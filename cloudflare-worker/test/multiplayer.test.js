import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMultiplayer, __test } from '../src/multiplayer.js';

/* In-memory stand-in for the Firestore REST API, Firebase sign-in lookup and Groq. */
function makeWorld() {
  const docs = new Map(); // "multiplayerRooms/X" -> fields (REST encoded)
  const calls = { count: 0 };
  const root = 'projects/p/databases/(default)/documents';
  const state = { groqStatus: 200, groqText: '[{"q":"Q?","options":["a","b","c","d"],"answer":1}] padding padding', abortOnce: 0 };
  docs.set('settings/main', { quiz_groq_keys: { arrayValue: { values: [{ stringValue: 'gsk_test_key_value_123456789' }] } } });
  const rel = n => n.slice(root.length + 1);
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  async function fakeFetch(url, init = {}) {
    calls.count++;
    url = String(url);
    const body = init.body ? JSON.parse(init.body) : {};
    if (url.startsWith('https://identitytoolkit.googleapis.com')) {
      const uid = body.idToken.replace(/^tok_/, '');
      return reply(200, { users: [{ localId: uid }] });
    }
    if (url.startsWith('https://api.groq.com')) { state.lastGroq = body; return reply(state.groqStatus, state.groqOverride ? { choices: [{ message: { content: state.groqOverride } }] } : { choices: [{ message: { content: state.groqText } }] }); }
    if (!url.startsWith('https://firestore.googleapis.com/')) throw new Error('unexpected ' + url);
    const path = url.split('/documents')[1] || '';
    if (path.startsWith(':beginTransaction')) return reply(200, { transaction: 'tx1' });
    if (path.startsWith(':rollback')) return reply(200, {});
    if (path.startsWith(':batchGet')) {
      return reply(200, body.documents.map(n => (docs.has(rel(n)) ? { found: { name: n, fields: docs.get(rel(n)) } } : { missing: n })));
    }
    if (path.startsWith(':commit')) {
      if (state.abortOnce > 0) { state.abortOnce--; return reply(409, { error: { status: 'ABORTED', message: 'contention' } }); }
      const staged = new Map(docs);
      for (const w of body.writes) {
        if (w.delete) { staged.delete(rel(w.delete)); continue; }
        const key = rel(w.update.name);
        const exists = staged.has(key);
        if (w.currentDocument && w.currentDocument.exists === false && exists) return reply(409, { error: { status: 'ALREADY_EXISTS', message: 'exists' } });
        if (w.currentDocument && w.currentDocument.exists === true && !exists) return reply(404, { error: { status: 'NOT_FOUND', message: 'missing' } });
        const cur = { ...(exists ? staged.get(key) : {}) };
        if (w.updateMask) {
          for (const f of w.updateMask.fieldPaths) { if (f in w.update.fields) cur[f] = w.update.fields[f]; else delete cur[f]; }
        } else Object.assign(cur, w.update.fields);
        for (const t of w.updateTransforms || []) {
          if (t.setToServerValue) cur[t.fieldPath] = { timestampValue: new Date().toISOString() };
          else if (t.increment) {
            const prev = cur[t.fieldPath] ? Number(cur[t.fieldPath].integerValue ?? cur[t.fieldPath].doubleValue ?? 0) : 0;
            const add = Number(t.increment.integerValue ?? t.increment.doubleValue);
            const sum = prev + add;
            cur[t.fieldPath] = Number.isInteger(sum) ? { integerValue: String(sum) } : { doubleValue: sum };
          }
        }
        staged.set(key, cur);
      }
      docs.clear(); for (const [k, v] of staged) docs.set(k, v);
      return reply(200, { commitTime: new Date().toISOString() });
    }
    // list collection
    const u = new URL(url);
    const col = decodeURIComponent(u.pathname.split('/documents/')[1]);
    const out = [];
    for (const [k, v] of docs) {
      const m = k.match(/^(.*)\/([^/]+)$/);
      if (m && m[1] === col) out.push({ name: `${root}/${k}`, fields: v });
    }
    return reply(200, { documents: out });
  }
  return { docs, calls, state, fakeFetch };
}

const deps = {
  json: (_r, _e, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  corsHeaders: () => ({}),
  getAccessToken: async () => 'access',
  getGroqConfig: async () => ({ keys: ['gsk_test_key_value_123456789'], model: 'llama-3.3-70b-versatile' })
};
const env = { FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k' };

let world;
test.beforeEach(() => { world = makeWorld(); globalThis.fetch = world.fakeFetch; __test.resetCaches(); });

async function call(uid, body) {
  const res = await handleMultiplayer(new Request('https://w/api/multiplayer', { method: 'POST', headers: { Authorization: `Bearer tok_${uid}` }, body: JSON.stringify(body) }), env, deps);
  return { status: res.status, ...(await res.json()) };
}
const questions = n => Array.from({ length: n }, (_, i) => ({ text: `Question ${i}?`, options: [{ text: 'A', correct: i % 4 === 0 }, { text: 'B', correct: i % 4 === 1 }, { text: 'C', correct: i % 4 === 2 }, { text: 'D', correct: i % 4 === 3 }] }));
const room = { title: 'Quiz', pin: '1234', capacity: 5, secondsPerQuestion: 10, difficulty: 'Easy', questions: questions(3) };

async function hostRoom() {
  const r = await call('host', { action: 'create', room, avatar: 3, hostName: 'Hosty' });
  assert.equal(r.status, 200, JSON.stringify(r));
  return r.roomId;
}

test('encoding round trips', () => {
  const v = { a: 1, b: 1.5, c: 'x', d: true, e: null, f: [1, 'z'], g: { h: 2 } };
  const back = __test.dec({ mapValue: { fields: __test.enc(v).mapValue.fields } });
  assert.deepEqual(back, v);
});

test('rejects calls without a sign-in', async () => {
  const res = await handleMultiplayer(new Request('https://w/api/multiplayer', { method: 'POST', body: '{}' }), env, deps);
  assert.equal(res.status, 401);
});

test('guest can host, join with the PIN, and sees taken avatars', async () => {
  const id = await hostRoom();
  assert.ok(world.docs.get(`multiplayerRooms/${id}/private/quiz_0`).json.stringValue.includes('Question 0'));
  assert.equal((await call('p1', { action: 'join', roomId: id, name: 'Ann', pin: '9999', avatar: 4 })).status, 403);
  assert.equal((await call('p1', { action: 'join', roomId: id, name: 'Ann', pin: '1234', avatar: 3 })).status, 409);
  assert.equal((await call('p1', { action: 'join', roomId: id, name: 'Ann', pin: '1234', avatar: 4 })).status, 200);
  const peek = await call('p2', { action: 'peek', roomId: id });
  assert.deepEqual(peek.takenAvatars.sort(), [3, 4]);
  assert.equal(peek.playerCount, 2);
  assert.ok(typeof peek.serverNow === 'number');
});

test('full game: first correct answer gets 5 points, others none', async () => {
  const id = await hostRoom();
  await call('p1', { action: 'join', roomId: id, name: 'Ann', pin: '1234', avatar: 4 });
  await call('p2', { action: 'join', roomId: id, name: 'Bob', pin: '1234', avatar: 5 });
  assert.equal((await call('host', { action: 'start', roomId: id })).status, 409, 'not everyone ready');
  await call('p1', { action: 'ready', roomId: id, ready: true });
  await call('p2', { action: 'ready', roomId: id, ready: true });
  assert.equal((await call('host', { action: 'start', roomId: id })).status, 200);
  const q = id => `multiplayerRooms/${id}`;
  // pull the start forward so answers are allowed
  const r = world.docs.get(q(id));
  r.questionStartedAt = { timestampValue: new Date(Date.now() - 1000).toISOString() };
  r.deadlineAt = { timestampValue: new Date(Date.now() + 9000).toISOString() };
  const early = await call('p1', { action: 'answer', roomId: id, questionIndex: 0, option: 0 });
  assert.equal(early.status, 200); assert.equal(early.firstCorrect, true); assert.equal(early.scoreDelta, 5);
  assert.equal(Object.hasOwn(early, 'correctIndex'), false, 'answer response must not expose the correct option index');
  const late = await call('p2', { action: 'answer', roomId: id, questionIndex: 0, option: 0 });
  assert.equal(late.correct, true); assert.equal(late.firstCorrect, false); assert.equal(late.scoreDelta, 0);
  assert.equal((await call('p1', { action: 'answer', roomId: id, questionIndex: 0, option: 1 })).status, 409, 'one attempt only');
  assert.equal(Number(world.docs.get(`${q(id)}/players/p1`).score.integerValue), 5);
  assert.equal(Number(world.docs.get(`${q(id)}/players/p2`).score.integerValue), 0);
  assert.equal(world.docs.get(q(id)).lastWinner.mapValue.fields.name.stringValue, 'Ann');
  // wrong answers never reveal the key
  assert.equal(world.docs.get(q(id)).publicQuestion.mapValue.fields.options.arrayValue.values[0].mapValue.fields.correct, undefined);
  // reveal and advance need the timer to be over and the host
  assert.equal((await call('p1', { action: 'reveal', roomId: id })).status, 403);
  assert.equal((await call('host', { action: 'reveal', roomId: id })).status, 409, 'timer not over');
  world.docs.get(q(id)).deadlineAt = { timestampValue: new Date(Date.now() - 10).toISOString() };
  { const x = await call('host', { action: 'reveal', roomId: id }); assert.equal(x.status, 200, JSON.stringify(x)); }
  assert.equal(Number(world.docs.get(q(id)).revealIndex.integerValue), 0);
  assert.equal((await call('host', { action: 'advance', roomId: id })).status, 200);
  assert.equal(Number(world.docs.get(q(id)).currentQuestion.integerValue), 1);
  assert.equal(world.docs.get(q(id)).revealIndex, undefined, 'reveal cleared');
  assert.equal((await call('host', { action: 'finish', roomId: id })).status, 200);
  assert.equal(world.docs.get(q(id)).phase.stringValue, 'complete');
});

test('avatar swap, ready, voice cap, leave and kick keep counts right', async () => {
  const id = await hostRoom();
  await call('p1', { action: 'join', roomId: id, name: 'Ann', pin: '1234', avatar: 4 });
  assert.equal((await call('p1', { action: 'avatar', roomId: id, avatar: 3 })).status, 409);
  assert.equal((await call('p1', { action: 'avatar', roomId: id, avatar: 9 })).status, 200);
  assert.ok(!world.docs.has(`multiplayerRooms/${id}/avatarClaims/4`));
  assert.ok(world.docs.has(`multiplayerRooms/${id}/avatarClaims/9`));
  assert.equal((await call('p1', { action: 'voice', roomId: id, on: true })).status, 200);
  assert.equal(Number(world.docs.get(`multiplayerRooms/${id}`).voiceCount.integerValue), 1);
  assert.equal((await call('p1', { action: 'kick', roomId: id, uid: 'host' })).status, 403);
  assert.equal((await call('host', { action: 'kick', roomId: id, uid: 'p1' })).status, 200);
  const d = world.docs.get(`multiplayerRooms/${id}`);
  assert.equal(Number(d.playerCount.integerValue), 1);
  assert.equal(Number(d.voiceCount.integerValue), 0);
  assert.ok(!world.docs.has(`multiplayerRooms/${id}/avatarClaims/9`));
  await call('p2', { action: 'join', roomId: id, name: 'Bob', pin: '1234', avatar: 4 });
  assert.equal((await call('p2', { action: 'leave', roomId: id })).status, 200);
  assert.equal(Number(world.docs.get(`multiplayerRooms/${id}`).playerCount.integerValue), 1);
});

test('late players can join an active question without choosing an avatar or restarting it', async () => {
  const id = await hostRoom();
  assert.equal((await call('host', { action: 'start', roomId: id })).status, 200);
  const roomPath = `multiplayerRooms/${id}`;
  const liveRoom = world.docs.get(roomPath);
  liveRoom.questionStartedAt = { timestampValue: new Date(Date.now() - 500).toISOString() };
  liveRoom.deadlineAt = { timestampValue: new Date(Date.now() + 5000).toISOString() };

  const joined = await call('late_player', { action: 'join', roomId: id, name: 'Late Player', pin: '1234' });
  assert.equal(joined.status, 200, JSON.stringify(joined));

  const player = world.docs.get(`${roomPath}/players/late_player`);
  assert.ok(player, 'late player record is created');
  const avatar = Number(player.avatar.integerValue);
  assert.ok(avatar >= 0 && avatar < 250, 'server assigns an available avatar');
  assert.ok(world.docs.has(`${roomPath}/avatarClaims/${avatar}`), 'avatar is reserved');
  assert.equal(liveRoom.phase.stringValue, 'question', 'active game remains active');
  assert.equal(Number(liveRoom.currentQuestion.integerValue), 0, 'current question is not restarted');
  assert.ok(liveRoom.publicQuestion, 'current question remains visible');

  const answer = await call('late_player', { action: 'answer', roomId: id, questionIndex: 0, option: 0 });
  assert.equal(answer.status, 200, JSON.stringify(answer));
  assert.equal(answer.firstCorrect, true);
  assert.equal(Number(world.docs.get(`${roomPath}/players/late_player`).score.integerValue), 5);

  await call('host', { action: 'finish', roomId: id });
  const afterGame = await call('another_player', { action: 'join', roomId: id, name: 'After Game', pin: '1234' });
  assert.equal(afterGame.status, 409, 'completed games do not accept new players');
});

test('capacity is enforced', async () => {
  const r = await call('host', { action: 'create', room: { ...room, capacity: 1 }, avatar: 0 });
  assert.equal((await call('p1', { action: 'join', roomId: r.roomId, name: 'Ann', pin: '1234', avatar: 1 })).status, 409);
});

test('busy rooms retry after a Firestore abort', async () => {
  const id = await hostRoom();
  world.state.abortOnce = 2;
  assert.equal((await call('p1', { action: 'join', roomId: id, name: 'Ann', pin: '1234', avatar: 4 })).status, 200);
});

test('AI generate: works, rate limits, and reports missing keys', async () => {
  const ok = await call('g', { action: 'generate', topic: 'Photosynthesis', difficulty: 'Easy', count: 5 });
  assert.equal(ok.status, 200); assert.ok(ok.text.includes('"q"'));
  world.docs.set('settings/main', {});
  __test.resetCaches();
  const saved = deps.getGroqConfig; deps.getGroqConfig = async () => ({ keys: [], model: '' });
  assert.equal((await call('g', { action: 'generate', topic: 'Photosynthesis', difficulty: 'Easy', count: 5 })).status, 503);
  deps.getGroqConfig = saved;
  assert.equal((await call('g', { action: 'generate', topic: 'x', difficulty: 'Easy', count: 5 })).status, 400);
  world.docs.set('multiplayerLimits/spam_generate', { start: { integerValue: String(Date.now()) }, count: { integerValue: '400' } });
  assert.equal((await call('spam', { action: 'generate', topic: 'Photosynthesis', difficulty: 'Easy', count: 5 })).status, 429);
});

test('Groq failure surfaces the busy message', async () => {
  world.state.groqStatus = 500;
  const r = await call('g', { action: 'generate', topic: 'Photosynthesis', difficulty: 'Easy', count: 5 });
  assert.equal(r.status, 503);
});

test('an action stays well under the 50-subrequest limit', async () => {
  const id = await hostRoom();
  world.calls.count = 0;
  await call('p1', { action: 'join', roomId: id, name: 'Ann', pin: '1234', avatar: 4 });
  assert.ok(world.calls.count <= 8, `join used ${world.calls.count} calls`);
});

test('generate from uploaded material puts the passage in the prompt and needs no topic', async () => {
  const source = 'Mitochondria make ATP.\n\nRibosomes build proteins.';
  const r = await call('g', { action: 'generate', source, part: 2, parts: 5, difficulty: 'Hard', count: 10 });
  assert.equal(r.status, 200, JSON.stringify(r));
  const prompt = world.state.lastGroq.messages[1].content;
  assert.ok(prompt.includes('Mitochondria make ATP.') && prompt.includes('part 2 of 5'));
  assert.ok(/ONLY on facts/.test(prompt));
  assert.equal((await call('g', { action: 'generate', source: 'x'.repeat(32001), difficulty: 'Hard', count: 10 })).status, 400);
  assert.equal((await call('g', { action: 'generate', difficulty: 'Hard', count: 10 })).status, 400);
});

test('image reading sends the picture to the vision model and returns its text', async () => {
  world.state.groqOverride = 'Chapter 1\nCells are the basic unit of life.';
  const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
  const r = await call('o', { action: 'ocr', image });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.ok(r.text.includes('Cells are the basic unit'));
  assert.equal(world.state.lastGroq.model, 'qwen/qwen3.8-27b');
  assert.equal(world.state.lastGroq.messages[0].content[1].image_url.url, image);
  world.state.groqOverride = 'NO TEXT';
  assert.equal((await call('o', { action: 'ocr', image })).text, '');
  assert.equal((await call('o', { action: 'ocr', image: 'data:text/html;base64,AAAA' })).status, 400);
  assert.equal((await call('o', { action: 'ocr', image: 'data:image/png;base64,' + 'A'.repeat(1800001) })).status, 400);
});

test('image reading is rate limited', async () => {
  world.docs.set('multiplayerLimits/spam_ocr', { start: { integerValue: String(Date.now()) }, count: { integerValue: '80' } });
  assert.equal((await call('spam', { action: 'ocr', image: 'data:image/png;base64,AAAA' })).status, 429);
});
