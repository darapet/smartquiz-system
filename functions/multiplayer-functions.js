'use strict';

const crypto = require('crypto');
const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const M = require('./multiplayer');

const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;
const ROOM_ID = /^[A-F0-9]{16}$/;

async function getUid(req) {
  const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Authentication required.');
  try {
    return (await admin.auth().verifyIdToken(token)).uid;
  } catch (e) {
    throw new Error('Authentication required.');
  }
}

/* Per-user limits. Guests can host, so keep one visitor from running up AI or storage costs. */
const QUOTA = { create: { limit: 10, windowMs: 3600e3 }, generate: { limit: 200, windowMs: 3600e3 } };

async function takeQuota(uid, bucket) {
  const { limit, windowMs } = QUOTA[bucket];
  const ref = db.collection('multiplayerLimits').doc(`${uid}_${bucket}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const next = M.nextQuota(snap.exists ? snap.data() : null, Date.now(), limit, windowMs);
    if (!next.ok) throw new Error('Too many requests. Please wait a while and try again.');
    tx.set(ref, { start: next.start, count: next.count });
  });
}

let settingsCache = { at: 0, data: {} };
async function aiSettings() {
  if (Date.now() - settingsCache.at < 60e3) return settingsCache.data;
  const snap = await db.collection('settings').doc('main').get();
  settingsCache = { at: Date.now(), data: snap.exists ? snap.data() : {} };
  return settingsCache.data;
}

async function chatOnce(url, key, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/* Groq first (quiz keys, then the shared pool), then Mistral. A bad, busy or rate-limited key
   moves on to the next one. Returns the model's raw text. */
async function writeQuestions(prompt) {
  const settings = await aiSettings();
  const groq = M.collectKeys(settings, ['quiz_groq_keys', 'groq_keys']);
  const mistral = M.collectKeys(settings, ['mistral_keys']);
  if (!groq.length && !mistral.length) throw new Error('AI is not set up yet. The site owner needs to add AI keys in Admin Settings.');
  const messages = [
    { role: 'system', content: 'You are an expert quiz writer. Reply with only the raw JSON array that was asked for.' },
    { role: 'user', content: prompt }
  ];
  const gModel = M.groqModelFor(settings.groq_model);
  const providers = [
    ...groq.map(k => ({ name: 'groq', key: k, url: 'https://api.groq.com/openai/v1/chat/completions', body: { model: gModel, messages, max_tokens: 4096, temperature: 0.5, ...(gModel.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}) } })),
    ...mistral.map(k => ({ name: 'mistral', key: k, url: 'https://api.mistral.ai/v1/chat/completions', body: { model: String(settings.mistral_model || 'mistral-small-latest'), messages, max_tokens: 4096, temperature: 0.5 } }))
  ];
  /* Start at a random key so one busy key does not take every request. */
  const offset = Math.floor(Math.random() * Math.max(1, groq.length));
  const ordered = [...groq.map((_, i) => providers[(i + offset) % groq.length]), ...providers.slice(groq.length)];
  const deadline = Date.now() + 100e3;
  let tried = 0;
  for (const p of ordered) {
    if (tried >= 6 || Date.now() > deadline - 5e3) break;
    tried++;
    try {
      const res = await chatOnce(p.url, p.key, p.body, Math.min(45e3, deadline - Date.now()));
      if (!res.ok) { console.warn(`multiplayer AI: ${p.name} answered ${res.status}`); continue; }
      const data = await res.json();
      const text = String(((data.choices || [])[0] || {}).message?.content || '');
      if (text.trim().length >= 20) return text;
    } catch (e) {
      console.warn(`multiplayer AI: ${p.name} failed: ${e.message}`);
    }
  }
  throw new Error('The AI service is busy or unavailable right now. Wait a minute, then press Continue.');
}

const roomRef = id => db.collection('multiplayerRooms').doc(id);
const playerRef = (id, uid) => roomRef(id).collection('players').doc(uid);
const claimRef = (id, avatar) => roomRef(id).collection('avatarClaims').doc(String(avatar));
const shardRef = (id, qi) => roomRef(id).collection('private').doc(`quiz_${M.shardIndex(qi)}`);

async function loadQuestion(tx, id, qi) {
  const snap = await tx.get(shardRef(id, qi));
  const question = snap.exists ? snap.data().questions[M.shardOffset(qi)] : null;
  if (!question) throw new Error('Room state changed; try again.');
  return question;
}

function requireHost(room, uid, message) {
  if (!room.exists) throw new Error('Room not found.');
  if (room.data().hostUid !== uid) throw new Error(message || 'Only the host can change game state.');
}

const freshPlayer = (name, avatar, ready) => ({
  name, avatar, ready, voice: false, score: 0, answered: 0, correct: 0, wrong: 0, totalLatency: 0,
  joinedAt: FieldValue.serverTimestamp()
});

const actions = {
  /* Anyone signed in can look at a room before joining: title and which avatars are taken. */
  async peek({ id }) {
    const [room, claims] = await Promise.all([roomRef(id).get(), roomRef(id).collection('avatarClaims').get()]);
    if (!room.exists) throw new Error('Room not found.');
    const d = room.data();
    return { title: d.title, phase: d.phase, capacity: d.capacity, playerCount: d.playerCount, secondsPerQuestion: d.secondsPerQuestion, questionCount: d.questionCount, difficulty: d.difficulty, takenAvatars: claims.docs.map(x => Number(x.id)) };
  },

  /* Anyone, including guests, can write questions with the site's AI keys. */
  async generate({ uid, body }) {
    const input = M.validateGenerate(body);
    await takeQuota(uid, 'generate');
    return { text: await writeQuestions(M.buildQuizPrompt(input)) };
  },

  /* Anyone, including guests, can host. Limited per user so rooms cannot be spammed. */
  async create({ uid, body }) {
    const input = M.validateRoom(body.room);
    const avatar = M.validateAvatar(body.avatar);
    const shards = M.shardQuestions(input.questions);
    await takeQuota(uid, 'create');
    const id = crypto.randomBytes(8).toString('hex').toUpperCase();
    const batch = db.batch();
    batch.create(roomRef(id), {
      roomId: id, title: input.title, hostUid: uid, pin: input.pin, capacity: input.capacity,
      playerCount: 1, voiceCount: 0, difficulty: input.difficulty, secondsPerQuestion: input.secondsPerQuestion,
      questionCount: input.questions.length, phase: 'lobby', currentQuestion: -1,
      createdAt: FieldValue.serverTimestamp()
    });
    shards.forEach((questions, i) => batch.create(roomRef(id).collection('private').doc(`quiz_${i}`), { questions }));
    batch.create(playerRef(id, uid), freshPlayer(String(body.hostName || 'Host').trim().slice(0, 35) || 'Host', avatar, true));
    batch.create(claimRef(id, avatar), { uid });
    await batch.commit();
    return { roomId: id };
  },

  async join({ id, uid, body }) {
    const pin = String(body.pin || '');
    const name = String(body.name || '').trim().slice(0, 35);
    if (!name || !/^\d{4}$/.test(pin)) throw new Error('Name and four-digit PIN are required.');
    const avatar = M.validateAvatar(body.avatar);
    await db.runTransaction(async tx => {
      const [room, me] = await Promise.all([tx.get(roomRef(id)), tx.get(playerRef(id, uid))]);
      if (!room.exists) throw new Error('Room not found.');
      const d = room.data();
      if (d.pin !== pin) throw new Error('Incorrect room PIN.');
      if (me.exists) return;
      if (d.phase !== 'lobby' || Number(d.playerCount || 0) >= d.capacity) throw new Error('Room is closed or full.');
      const claim = await tx.get(claimRef(id, avatar));
      if (claim.exists) throw new Error('Avatar already taken.');
      tx.create(claimRef(id, avatar), { uid });
      tx.create(playerRef(id, uid), freshPlayer(name, avatar, false));
      tx.update(roomRef(id), { playerCount: Number(d.playerCount || 0) + 1 });
    });
    return { ok: true };
  },

  async avatar({ id, uid, body }) {
    const avatar = M.validateAvatar(body.avatar);
    await db.runTransaction(async tx => {
      const [room, me] = await Promise.all([tx.get(roomRef(id)), tx.get(playerRef(id, uid))]);
      if (!room.exists) throw new Error('Room not found.');
      if (!me.exists) throw new Error('Player not found.');
      if (room.data().phase !== 'lobby') throw new Error('Room state changed; try again.');
      const current = me.data().avatar;
      if (current === avatar) return;
      const claim = await tx.get(claimRef(id, avatar));
      if (claim.exists) throw new Error('Avatar already taken.');
      tx.delete(claimRef(id, current));
      tx.create(claimRef(id, avatar), { uid });
      tx.update(playerRef(id, uid), { avatar });
    });
    return { ok: true };
  },

  async ready({ id, uid, body }) {
    if (typeof body.ready !== 'boolean') throw new Error('Ready must be true or false.');
    await db.runTransaction(async tx => {
      const [room, me] = await Promise.all([tx.get(roomRef(id)), tx.get(playerRef(id, uid))]);
      if (!room.exists) throw new Error('Room not found.');
      if (!me.exists) throw new Error('Player not found.');
      if (room.data().phase !== 'lobby') throw new Error('Room state changed; try again.');
      tx.update(playerRef(id, uid), { ready: body.ready });
    });
    return { ok: true };
  },

  /* Turning the mic on joins the voice room (capped); turning it off leaves it. */
  async voice({ id, uid, body }) {
    if (typeof body.on !== 'boolean') throw new Error('Voice must be true or false.');
    return db.runTransaction(async tx => {
      const [room, me] = await Promise.all([tx.get(roomRef(id)), tx.get(playerRef(id, uid))]);
      if (!room.exists) throw new Error('Room not found.');
      if (!me.exists) throw new Error('Player not found.');
      const live = Boolean(me.data().voice), count = Number(room.data().voiceCount || 0);
      if (body.on === live) return { ok: true };
      if (body.on && count >= M.LIMITS.maxVoice) throw new Error('Voice chat is full right now.');
      tx.update(playerRef(id, uid), { voice: body.on });
      tx.update(roomRef(id), { voiceCount: Math.max(0, count + (body.on ? 1 : -1)) });
      return { ok: true };
    });
  },

  async kick({ id, uid, body }) {
    const targetUid = String(body.uid || '');
    await db.runTransaction(async tx => {
      const [room, target] = await Promise.all([tx.get(roomRef(id)), tx.get(playerRef(id, targetUid))]);
      requireHost(room, uid, 'Only the host can remove players.');
      if (targetUid === uid || !target.exists) return;
      const d = room.data(), t = target.data();
      tx.delete(playerRef(id, targetUid));
      tx.delete(claimRef(id, t.avatar));
      tx.update(roomRef(id), { playerCount: Math.max(0, Number(d.playerCount || 1) - 1), voiceCount: Math.max(0, Number(d.voiceCount || 0) - (t.voice ? 1 : 0)) });
    });
    return { ok: true };
  },

  async leave({ id, uid }) {
    await db.runTransaction(async tx => {
      const [room, me] = await Promise.all([tx.get(roomRef(id)), tx.get(playerRef(id, uid))]);
      if (!room.exists || !me.exists || room.data().hostUid === uid || room.data().phase !== 'lobby') return;
      const d = room.data(), p = me.data();
      tx.delete(playerRef(id, uid));
      tx.delete(claimRef(id, p.avatar));
      tx.update(roomRef(id), { playerCount: Math.max(0, Number(d.playerCount || 1) - 1), voiceCount: Math.max(0, Number(d.voiceCount || 0) - (p.voice ? 1 : 0)) });
    });
    return { ok: true };
  },

  async start({ id, uid, body }) {
    await db.runTransaction(async tx => {
      const [room, players] = await Promise.all([tx.get(roomRef(id)), tx.get(roomRef(id).collection('players'))]);
      requireHost(room, uid);
      const d = room.data();
      if (d.phase !== 'lobby' || !players.size) throw new Error('Room state changed; try again.');
      if (body.force !== true && players.docs.some(p => !p.data().ready)) throw new Error('Room state changed; try again.');
      const question = await loadQuestion(tx, id, 0);
      const startMs = Date.now() + M.LIMITS.countdownMs;
      tx.update(roomRef(id), {
        phase: 'question', currentQuestion: 0,
        questionStartedAt: Timestamp.fromMillis(startMs),
        deadlineAt: Timestamp.fromMillis(startMs + d.secondsPerQuestion * 1000),
        publicQuestion: M.publicQuestion(question)
      });
    });
    return { ok: true };
  },

  /* After the timer ends the host reveals the right answer to everyone. */
  async reveal({ id, uid }) {
    await db.runTransaction(async tx => {
      const room = await tx.get(roomRef(id));
      requireHost(room, uid);
      const d = room.data();
      if (d.phase !== 'question' || !d.deadlineAt || d.deadlineAt.toMillis() > Date.now()) throw new Error('Room state changed; try again.');
      if (d.revealIndex !== undefined && d.revealIndex !== null && d.revealedQuestion === d.currentQuestion) return;
      const question = await loadQuestion(tx, id, d.currentQuestion);
      tx.update(roomRef(id), { revealIndex: M.correctIndex(question), revealedQuestion: d.currentQuestion });
    });
    return { ok: true };
  },

  async advance({ id, uid }) {
    await db.runTransaction(async tx => {
      const room = await tx.get(roomRef(id));
      requireHost(room, uid);
      const d = room.data();
      if (d.phase !== 'question' || !d.deadlineAt || d.deadlineAt.toMillis() > Date.now()) throw new Error('Room state changed; try again.');
      const next = d.currentQuestion + 1;
      if (next >= d.questionCount) {
        tx.update(roomRef(id), { phase: 'complete', completedAt: FieldValue.serverTimestamp(), publicQuestion: FieldValue.delete(), revealIndex: FieldValue.delete(), lastWinner: FieldValue.delete() });
        return;
      }
      const question = await loadQuestion(tx, id, next);
      const startMs = Date.now() + 1500;
      tx.update(roomRef(id), {
        currentQuestion: next,
        questionStartedAt: Timestamp.fromMillis(startMs),
        deadlineAt: Timestamp.fromMillis(startMs + d.secondsPerQuestion * 1000),
        publicQuestion: M.publicQuestion(question),
        revealIndex: FieldValue.delete(), lastWinner: FieldValue.delete()
      });
    });
    return { ok: true };
  },

  async finish({ id, uid }) {
    await db.runTransaction(async tx => {
      const room = await tx.get(roomRef(id));
      requireHost(room, uid);
      tx.update(roomRef(id), { phase: 'complete', completedAt: FieldValue.serverTimestamp(), publicQuestion: FieldValue.delete(), revealIndex: FieldValue.delete(), lastWinner: FieldValue.delete() });
    });
    return { ok: true };
  },

  /* One attempt per question. The first correct answer earns the points. */
  async answer({ id, uid, body }) {
    const qi = Number(body.questionIndex), option = Number(body.option);
    if (!Number.isInteger(qi) || qi < 0 || !Number.isInteger(option) || option < 0 || option > 3) throw new Error('Invalid answer.');
    return db.runTransaction(async tx => {
      const attempt = roomRef(id).collection('answers').doc(`${qi}_${uid}`);
      const first = roomRef(id).collection('private').doc(`first_${qi}`);
      const [room, me, prior, firstSnap] = await Promise.all([tx.get(roomRef(id)), tx.get(playerRef(id, uid)), tx.get(attempt), tx.get(first)]);
      if (!room.exists) throw new Error('Room not found.');
      if (!me.exists) throw new Error('Player not found.');
      const d = room.data();
      const state = M.answerWindow({ phase: d.phase, currentQuestion: d.currentQuestion, questionIndex: qi, startMs: d.questionStartedAt ? d.questionStartedAt.toMillis() : 0, deadlineMs: d.deadlineAt ? d.deadlineAt.toMillis() : 0, nowMs: Date.now() });
      if (state === 'countdown') throw new Error('Get ready. The question has not started yet.');
      if (state !== 'open') throw new Error('Question is closed.');
      if (prior.exists) throw new Error('You already answered this question.');
      const question = await loadQuestion(tx, id, qi);
      const right = M.correctIndex(question), correct = option === right;
      const outcome = M.answerOutcome({ correct, firstCorrectUid: firstSnap.exists ? firstSnap.data().uid : null });
      const elapsed = Math.max(0, (Date.now() - d.questionStartedAt.toMillis()) / 1000);
      tx.create(attempt, { uid, questionIndex: qi, option, correct, submittedAt: FieldValue.serverTimestamp() });
      tx.update(playerRef(id, uid), {
        answered: FieldValue.increment(1),
        [correct ? 'correct' : 'wrong']: FieldValue.increment(1),
        totalLatency: FieldValue.increment(elapsed),
        ...(outcome.firstCorrect ? { score: FieldValue.increment(outcome.scoreDelta) } : {})
      });
      if (outcome.firstCorrect) {
        tx.create(first, { uid, at: FieldValue.serverTimestamp() });
        tx.update(roomRef(id), { lastWinner: { questionIndex: qi, uid, name: me.data().name, avatar: me.data().avatar } });
      }
      return { correct, firstCorrect: outcome.firstCorrect, scoreDelta: outcome.scoreDelta };
    });
  }
};

exports.multiplayer = onRequest({ cors: true, region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  try {
    const uid = await getUid(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = String(body.action || '');
    const handler = Object.prototype.hasOwnProperty.call(actions, action) ? actions[action] : null;
    if (!handler) return res.status(400).json({ error: 'Unknown multiplayer action.' });
    let id = '';
    if (action !== 'create' && action !== 'generate') {
      id = String(body.roomId || '');
      if (!ROOM_ID.test(id)) throw new Error('Invalid room id.');
    }
    /* serverNow lets each browser correct for its own clock when counting down. */
    return res.json({ ...(await handler({ id, uid, body })), serverNow: Date.now() });
  } catch (e) {
    const status = M.errorStatus(e);
    if (status >= 500) console.error('multiplayer error', e);
    return res.status(status).json({ error: e.message || 'Multiplayer operation failed.' });
  }
});
