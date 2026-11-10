'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../multiplayer');

const question = (n = 1) => ({ text: `Question ${n}?`, options: [{ text: 'Right', correct: true }, { text: 'Wrong 1', correct: false }, { text: 'Wrong 2', correct: false }, { text: 'Wrong 3', correct: false }] });
const fixture = () => ({ title: '  Demo quiz ', pin: '1234', capacity: 200, secondsPerQuestion: 30, difficulty: 'Professional', questions: [question()] });

test('validates and normalizes a room', () => {
  const room = M.validateRoom(fixture());
  assert.equal(room.title, 'Demo quiz');
  assert.equal(room.capacity, 200);
  assert.equal(room.difficulty, 'Professional');
});

test('unknown difficulty falls back to Easy', () => {
  assert.equal(M.validateRoom({ ...fixture(), difficulty: 'Nightmare' }).difficulty, 'Easy');
});

test('rejects invalid pin, capacity, timer, and ambiguous keys', () => {
  for (const edit of [r => r.pin = '12', r => r.pin = 'abcd', r => r.capacity = 201, r => r.capacity = 0, r => r.secondsPerQuestion = 4, r => r.questions[0].options[1].correct = true, r => r.questions = []]) {
    const r = fixture();
    edit(r);
    assert.throws(() => M.validateRoom(r));
  }
});

test('accepts a minimum of one question and a maximum of 1500', () => {
  assert.doesNotThrow(() => M.validateRoom({ ...fixture(), questions: Array.from({ length: 1500 }, (_, i) => question(i)) }));
  assert.throws(() => M.validateRoom({ ...fixture(), questions: Array.from({ length: 1501 }, (_, i) => question(i)) }));
});

test('questions are sharded and located by index', () => {
  const shards = M.shardQuestions(Array.from({ length: 250 }, (_, i) => question(i)));
  assert.deepEqual(shards.map(s => s.length), [100, 100, 50]);
  assert.equal(M.shardIndex(199), 1);
  assert.equal(M.shardOffset(199), 99);
  assert.equal(shards[M.shardIndex(205)][M.shardOffset(205)].text, 'Question 205?');
});

test('1500 realistic questions fit the shard size limit', () => {
  const long = { text: 'x'.repeat(600), options: ['a', 'b', 'c', 'd'].map((c, i) => ({ text: c.repeat(200), correct: i === 0 })) };
  assert.doesNotThrow(() => M.shardQuestions(Array.from({ length: 1500 }, () => long)));
});

test('avatar must be one of 250', () => {
  assert.equal(M.validateAvatar(0), 0);
  assert.equal(M.validateAvatar('249'), 249);
  for (const bad of [-1, 250, 1.5, 'x', null, undefined]) assert.throws(() => M.validateAvatar(bad));
});

test('public question strips correctness', () => {
  const q = M.publicQuestion(question());
  assert.deepEqual(q.options, [{ text: 'Right' }, { text: 'Wrong 1' }, { text: 'Wrong 2' }, { text: 'Wrong 3' }]);
  assert.equal(JSON.stringify(q).includes('correct'), false);
  assert.equal(M.correctIndex(question()), 0);
});

test('only the first correct answer earns five points', () => {
  assert.deepEqual(M.answerOutcome({ correct: true, firstCorrectUid: null }), { correct: true, firstCorrect: true, scoreDelta: 5 });
  assert.equal(M.answerOutcome({ correct: true, firstCorrectUid: 'a' }).scoreDelta, 0);
  assert.equal(M.answerOutcome({ correct: false, firstCorrectUid: null }).scoreDelta, 0);
});

test('answers are blocked during the countdown and after the deadline', () => {
  const base = { phase: 'question', currentQuestion: 2, questionIndex: 2, startMs: 10_000, deadlineMs: 40_000 };
  assert.equal(M.answerWindow({ ...base, nowMs: 5_000 }), 'countdown');
  assert.equal(M.answerWindow({ ...base, nowMs: 10_000 }), 'open');
  assert.equal(M.answerWindow({ ...base, nowMs: 40_001 }), 'closed');
  assert.equal(M.answerWindow({ ...base, nowMs: 20_000, questionIndex: 1 }), 'closed');
  assert.equal(M.answerWindow({ ...base, nowMs: 20_000, phase: 'complete' }), 'closed');
});

test('ranking orders by score, then correct answers, then speed', () => {
  const ranked = M.rankPlayers([
    { name: 'C', score: 10, correct: 2, answered: 4, totalLatency: 40 },
    { name: 'A', score: 15, correct: 3, answered: 4, totalLatency: 40 },
    { name: 'B', score: 10, correct: 2, answered: 4, totalLatency: 10 },
    { name: 'D', score: 10, correct: 3, answered: 4, totalLatency: 80 }
  ]);
  assert.deepEqual(ranked.map(p => p.name), ['A', 'D', 'B', 'C']);
});

test('maps multiplayer errors to HTTP status codes', () => {
  for (const [message, status] of [['Authentication required.', 401], ['Only the host can change game state.', 403], ['Incorrect room PIN.', 403], ['Room not found.', 404], ['Room is closed or full.', 409], ['Avatar already taken.', 409], ['Voice chat is full right now.', 409], ['Invalid answer.', 400]]) {
    assert.equal(M.errorStatus(new Error(message)), status);
  }
});

test('Firestore rules deny client writes and protect answer/private docs', () => {
  const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');
  const block = rules.match(/match \/multiplayerRooms\/\{roomId\} \{([\s\S]*?)\/\/ ─── Library Views/);
  assert.ok(block, 'multiplayer rule block exists');
  assert.match(block[1], /allow create, update, delete: if false;/);
  assert.match(block[1], /match \/answers\/\{answerId\} \{\s*allow read, write: if false;/);
  assert.match(block[1], /match \/private\/\{privateId\} \{\s*allow read, write: if false;/);
  assert.match(block[1], /match \/avatarClaims\/\{avatarId\} \{\s*allow read, write: if false;/);
  assert.match(block[1], /match \/players\/\{playerUid\}/);
});

test('voice signals are limited to room players and readable only by the addressee', () => {
  const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');
  const signals = rules.match(/match \/signals\/\{signalId\} \{([\s\S]*?)\n      \}/);
  assert.ok(signals, 'signals rule exists');
  assert.match(signals[1], /request\.resource\.data\.from == request\.auth\.uid/);
  assert.match(signals[1], /data\.size\(\) < 6000/);
  assert.match(signals[1], /allow read, delete: if isSignedIn\(\) && resource\.data\.to == request\.auth\.uid;/);
  assert.match(signals[1], /allow update: if false;/);
});

test('validates an AI request and trims it', () => {
  const input = M.validateGenerate({ topic: '  Cell   biology  ', difficulty: 'Hard', count: 15, batch: 3, avoid: ['  a  ', '', 'b'] });
  assert.deepEqual(input, { topic: 'Cell biology', difficulty: 'Hard', count: 15, batch: 3, avoid: ['a', 'b'] });
});

test('rejects bad AI requests', () => {
  assert.throws(() => M.validateGenerate({ topic: 'ab', difficulty: 'Easy', count: 5 }), /Describe/);
  assert.throws(() => M.validateGenerate({ topic: 'Biology', difficulty: 'Impossible', count: 5 }), /difficulty/);
  assert.throws(() => M.validateGenerate({ topic: 'Biology', difficulty: 'Easy', count: 21 }), /1 to 20/);
  assert.throws(() => M.validateGenerate({ topic: 'x'.repeat(1501), difficulty: 'Easy', count: 5 }), /characters/);
  assert.throws(() => M.validateGenerate(null), /Describe/);
});

test('keeps only the newest 30 avoid entries and caps their length', () => {
  const avoid = Array.from({ length: 50 }, (_, i) => `q${i}`);
  assert.equal(M.validateGenerate({ topic: 'Biology', difficulty: 'Easy', count: 5, avoid }).avoid.length, 30);
  assert.equal(M.validateGenerate({ topic: 'Biology', difficulty: 'Easy', count: 5, avoid }).avoid[0], 'q20');
  assert.equal(M.validateGenerate({ topic: 'Biology', difficulty: 'Easy', count: 5, avoid: ['z'.repeat(999)] }).avoid[0].length, M.AI_LIMITS.maxAvoidChars);
});

test('builds a prompt with count, topic, level and avoid list', () => {
  const p = M.buildQuizPrompt({ topic: 'Photosynthesis', difficulty: 'Professional', count: 12, avoid: ['What is a leaf?'], batch: 4 });
  assert.match(p, /exactly 12 multiple-choice/);
  assert.match(p, /about: Photosynthesis/);
  assert.match(p, /Professional: expert-level/);
  assert.match(p, /batch 4/);
  assert.match(p, /- What is a leaf\?/);
});

test('moves retired Groq models to current ones', () => {
  assert.equal(M.groqModelFor('llama-3.3-70b-versatile'), 'openai/gpt-oss-120b');
  assert.equal(M.groqModelFor('llama-3.1-8b-instant'), 'openai/gpt-oss-20b');
  assert.equal(M.groqModelFor('openai/gpt-oss-120b'), 'openai/gpt-oss-120b');
  assert.equal(M.groqModelFor(''), 'openai/gpt-oss-20b');
  assert.equal(M.groqModelFor(undefined), 'openai/gpt-oss-20b');
});

test('collects, cleans and de-duplicates AI keys across pools', () => {
  const k1 = 'gsk_' + 'a'.repeat(30), k2 = 'gsk_' + 'b'.repeat(30);
  const keys = M.collectKeys({ quiz_groq_keys: [k1, ' ' + k1 + '​', 'short'], groq_keys: [k2, null, 5], other: ['x'.repeat(40)] }, ['quiz_groq_keys', 'groq_keys']);
  assert.deepEqual(keys, [k1, k2]);
  assert.deepEqual(M.collectKeys({}, ['groq_keys']), []);
  assert.deepEqual(M.collectKeys(null, ['groq_keys']), []);
});

test('fixed-window quota counts, blocks, then resets', () => {
  const hour = 3600e3;
  let s = M.nextQuota(null, 1000, 2, hour);
  assert.deepEqual(s, { ok: true, start: 1000, count: 1 });
  s = M.nextQuota(s, 2000, 2, hour);
  assert.deepEqual(s, { ok: true, start: 1000, count: 2 });
  assert.equal(M.nextQuota(s, 3000, 2, hour).ok, false);
  const reset = M.nextQuota(s, 1000 + hour, 2, hour);
  assert.deepEqual(reset, { ok: true, start: 1000 + hour, count: 1 });
});

test('maps guest-facing errors to useful status codes', () => {
  assert.equal(M.errorStatus(new Error('Too many requests. Please wait a while and try again.')), 429);
  assert.equal(M.errorStatus(new Error('AI is not set up yet. The site owner needs to add AI keys in Admin Settings.')), 503);
  assert.equal(M.errorStatus(new Error('The AI service is busy or unavailable right now. Wait a minute, then press Continue.')), 503);
});
