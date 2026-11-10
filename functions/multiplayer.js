'use strict';

/* Pure, side-effect-free rules for SmartQuiz live multiplayer.
   Everything here is unit tested; the Cloud Function only wires it to Firestore. */

const LIMITS = Object.freeze({
  maxQuestions: 1500,
  maxPlayers: 200,
  avatarCount: 250,
  maxVoice: 12,
  minSeconds: 5,
  maxSeconds: 120,
  countdownMs: 3000,
  pointsPerWin: 5,
  shardSize: 100,
  maxShardBytes: 700 * 1024
});

const DIFFICULTIES = Object.freeze(['Easy', 'Hard', 'Harder', 'Professional']);

function validateAvatar(value) {
  const n = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 0 || n >= LIMITS.avatarCount) throw new Error('Pick one of the 250 avatars.');
  return n;
}

function validateRoom(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Room details are required.');
  const title = String(input.title || '').trim();
  if (!title || title.length > 100) throw new Error('Quiz title must be 1 to 100 characters.');
  if (!/^\d{4}$/.test(String(input.pin || ''))) throw new Error('Room PIN must be four digits.');
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > LIMITS.maxPlayers) throw new Error('Room capacity must be 1 to 200.');
  if (!Number.isInteger(input.secondsPerQuestion) || input.secondsPerQuestion < LIMITS.minSeconds || input.secondsPerQuestion > LIMITS.maxSeconds) throw new Error('Timer must be 5 to 120 seconds.');
  if (!Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > LIMITS.maxQuestions) throw new Error('Question count must be 1 to 1,500.');
  for (const q of input.questions) {
    if (!q || typeof q.text !== 'string' || !q.text.trim() || !Array.isArray(q.options) || q.options.length !== 4 || q.options.filter(o => o && o.correct === true).length !== 1 || q.options.some(o => !o || typeof o.text !== 'string' || !o.text.trim())) {
      throw new Error('Every question must have text, four options, and exactly one correct answer.');
    }
  }
  const difficulty = DIFFICULTIES.includes(input.difficulty) ? input.difficulty : 'Easy';
  const questions = input.questions.map(q => ({
    text: q.text.trim().slice(0, 600),
    options: q.options.map(o => ({ text: o.text.trim().slice(0, 200), correct: o.correct === true }))
  }));
  return { title, pin: String(input.pin), capacity: input.capacity, secondsPerQuestion: input.secondsPerQuestion, difficulty, questions };
}

/* Questions are stored in shards so one Firestore document never nears the 1 MiB limit. */
function shardQuestions(questions) {
  const shards = [];
  for (let i = 0; i < questions.length; i += LIMITS.shardSize) shards.push(questions.slice(i, i + LIMITS.shardSize));
  for (const shard of shards) {
    if (Buffer.byteLength(JSON.stringify(shard), 'utf8') > LIMITS.maxShardBytes) throw new Error('Question set is too large. Reduce the number of questions.');
  }
  return shards;
}

const shardIndex = questionIndex => Math.floor(questionIndex / LIMITS.shardSize);
const shardOffset = questionIndex => questionIndex % LIMITS.shardSize;

function publicQuestion(question) {
  return { text: question.text, options: question.options.map(o => ({ text: o.text })) };
}

function correctIndex(question) {
  return question.options.findIndex(o => o.correct === true);
}

function answerOutcome({ correct, firstCorrectUid }) {
  const firstCorrect = Boolean(correct && !firstCorrectUid);
  return { correct: Boolean(correct), firstCorrect, scoreDelta: firstCorrect ? LIMITS.pointsPerWin : 0 };
}

/* Is a player allowed to answer right now? Times are epoch milliseconds. */
function answerWindow({ phase, currentQuestion, questionIndex, startMs, deadlineMs, nowMs }) {
  if (phase !== 'question' || currentQuestion !== questionIndex) return 'closed';
  if (nowMs < startMs) return 'countdown';
  if (nowMs > deadlineMs) return 'closed';
  return 'open';
}

/* Highest score first; ties go to more correct answers, then faster average answers. */
function rankPlayers(players) {
  const avg = p => (p.answered > 0 ? (p.totalLatency || 0) / p.answered : Infinity);
  return players.slice().sort((a, b) =>
    (b.score || 0) - (a.score || 0) ||
    (b.correct || 0) - (a.correct || 0) ||
    avg(a) - avg(b) ||
    String(a.name || '').localeCompare(String(b.name || '')));
}

const STATUS = new Map([
  ['Authentication required.', 401],
  ['Only the host can remove players.', 403],
  ['Only the host can change game state.', 403],
  ['A non-anonymous host account is required.', 403],
  ['Incorrect room PIN.', 403],
  ['Room not found.', 404],
  ['Player not found.', 404],
  ['Room is closed or full.', 409],
  ['Room state changed; try again.', 409],
  ['Avatar already taken.', 409],
  ['Voice chat is full right now.', 409],
  ['You already answered this question.', 409]
]);

function errorStatus(error) {
  return STATUS.get(String(error && error.message || '')) || 400;
}

module.exports = {
  LIMITS, DIFFICULTIES, validateAvatar, validateRoom, shardQuestions, shardIndex, shardOffset,
  publicQuestion, correctIndex, answerOutcome, answerWindow, rankPlayers, errorStatus
};
