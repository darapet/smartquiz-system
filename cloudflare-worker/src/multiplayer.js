/* Live multiplayer backend for the free Cloudflare Worker.
   Same rules as the old Firebase function, but it talks to Firestore over REST with the
   service account, so nothing needs the paid Firebase Blaze plan.

   Workers free plan: 10 ms CPU per request and 50 subrequests. So each action does a handful of
   Firestore calls, the access token is cached, and question shards are stored as one JSON string
   (cheap to parse) instead of nested Firestore maps. */

import * as M from './multiplayer-logic.js';

const ROOM_ID = /^[A-F0-9]{16}$/;
const QUOTA = { create: { limit: 10, windowMs: 3600e3 }, generate: { limit: 400, windowMs: 3600e3 }, ocr: { limit: 80, windowMs: 3600e3 } };
const LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';

/* ── Firestore value encoding ─────────────────────────────────────────────── */

const SERVER_TS = { __op: 'serverTs' };
const DELETE = { __op: 'delete' };
const inc = n => ({ __op: 'inc', n });
const ts = ms => ({ __ts: ms, toMillis() { return ms; } });
const isOp = v => v && typeof v === 'object' && typeof v.__op === 'string';

function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'object' && '__ts' in v) return { timestampValue: new Date(v.__ts).toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: encFields(v) } };
}
function encFields(o) {
  const f = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && !isOp(v)) f[k] = enc(v);
  return f;
}
function dec(v) {
  if (!v || 'nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return ts(Date.parse(v.timestampValue));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return decFields(v.mapValue.fields || {});
  return null;
}
function decFields(f) {
  const o = {};
  for (const [k, v] of Object.entries(f || {})) o[k] = dec(v);
  return o;
}

/* ── Firestore REST client ────────────────────────────────────────────────── */

class FirestoreError extends Error {
  constructor(status, code, message) {
    super(message);
    this.httpStatus = status;
    this.code = code;
  }
}

/* One access token is reused by every request this isolate serves. */
let tokenCache = { value: '', until: 0 };

function makeClient(env, getAccessToken) {
  const project = String(env.FIREBASE_PROJECT_ID || '').trim();
  if (!project) throw new Error('Firebase project is not configured on the Worker.');
  const root = `projects/${project}/databases/(default)/documents`;
  const base = `https://firestore.googleapis.com/v1/${root}`;
  const name = path => `${root}/${path}`;

  async function call(url, init = {}) {
    if (Date.now() > tokenCache.until) {
      tokenCache = { value: await getAccessToken(env), until: Date.now() + 45 * 60e3 };
    }
    let res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCache.value}` } });
    if (res.status === 401) {
      tokenCache = { value: await getAccessToken(env), until: Date.now() + 45 * 60e3 };
      res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCache.value}` } });
    }
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { /* leave empty */ }
    if (!res.ok) {
      const err = data.error || {};
      throw new FirestoreError(res.status, String(err.status || ''), String(err.message || `Firestore answered ${res.status}`));
    }
    return data;
  }

  const post = (suffix, body) => call(`${base}${suffix}`, { method: 'POST', body: JSON.stringify(body) });

  async function getMany(paths, transaction) {
    const body = { documents: paths.map(name) };
    if (transaction) body.transaction = transaction;
    const rows = await post(':batchGet', body);
    const found = new Map();
    for (const r of Array.isArray(rows) ? rows : []) {
      if (r.found) found.set(r.found.name.slice(root.length + 1), decFields(r.found.fields));
    }
    return found;
  }

  /* Lists a collection (all pages). `fields` limits which fields come back. */
  async function list(path, { transaction, fields } = {}) {
    const out = [];
    let pageToken = '';
    do {
      const q = new URLSearchParams({ pageSize: '300' });
      if (transaction) q.set('transaction', transaction);
      if (pageToken) q.set('pageToken', pageToken);
      for (const f of fields || []) q.append('mask.fieldPaths', f);
      const data = await call(`${base}/${path}?${q}`);
      for (const d of data.documents || []) out.push({ id: d.name.slice(d.name.lastIndexOf('/') + 1), data: decFields(d.fields) });
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return out;
  }

  const begin = async () => (await post(':beginTransaction', {})).transaction;
  const rollback = transaction => post(':rollback', { transaction }).catch(() => {});
  const commit = (writes, transaction) => post(':commit', transaction ? { writes, transaction } : { writes });

  return { name, getMany, list, begin, rollback, commit, call, base };
}

/* A transaction collects writes and sends them in one commit, like the Admin SDK's. */
function makeTx(fs, id) {
  const writes = [];
  const toWrite = (path, data, mode) => {
    const w = { update: { name: fs.name(path), fields: encFields(data) } };
    const plain = Object.keys(data).filter(k => !isOp(data[k]) && data[k] !== undefined);
    const del = Object.keys(data).filter(k => data[k] === DELETE);
    const transforms = [];
    for (const [k, v] of Object.entries(data)) {
      if (v === SERVER_TS) transforms.push({ fieldPath: k, setToServerValue: 'REQUEST_TIME' });
      else if (isOp(v) && v.__op === 'inc') transforms.push({ fieldPath: k, increment: Number.isInteger(v.n) ? { integerValue: String(v.n) } : { doubleValue: v.n } });
    }
    if (transforms.length) w.updateTransforms = transforms;
    if (mode === 'create') w.currentDocument = { exists: false };
    else {
      w.updateMask = { fieldPaths: [...plain, ...del] };
      w.currentDocument = { exists: true };
    }
    return w;
  };
  return {
    id,
    async get(path) { return (await fs.getMany([path], id)).get(path) || null; },
    getMany: paths => fs.getMany(paths, id),
    list: (path, opts) => fs.list(path, { ...opts, transaction: id }),
    create(path, data) { writes.push(toWrite(path, data, 'create')); },
    update(path, data) { writes.push(toWrite(path, data, 'update')); },
    delete(path) { writes.push({ delete: fs.name(path) }); },
    writes,
    commit: () => (writes.length ? fs.commit(writes, id) : fs.rollback(id))
  };
}

const RETRYABLE = new Set(['ABORTED', 'ALREADY_EXISTS', 'FAILED_PRECONDITION', 'NOT_FOUND']);

/* Runs fn in a transaction. Busy rooms get a short random wait, then a retry. */
async function runTransaction(fs, fn) {
  let last;
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = await fs.begin();
    const tx = makeTx(fs, id);
    let result;
    try {
      result = await fn(tx);
    } catch (e) {
      await fs.rollback(id);
      throw e;
    }
    try {
      await tx.commit();
      return result;
    } catch (e) {
      if (!(e instanceof FirestoreError) || !RETRYABLE.has(e.code)) throw e;
      last = e;
      await new Promise(r => setTimeout(r, 40 + Math.random() * 160 * (attempt + 1)));
    }
  }
  throw new Error(last && last.code === 'ALREADY_EXISTS' ? 'Avatar already taken.' : 'Room state changed; try again.');
}

/* ── AI question writing ──────────────────────────────────────────────────── */

let settingsCache = { at: 0, data: {} };
async function aiSettings(fs) {
  if (Date.now() - settingsCache.at < 60e3) return settingsCache.data;
  const doc = (await fs.getMany(['settings/main'])).get('settings/main') || {};
  settingsCache = { at: Date.now(), data: doc };
  return doc;
}

async function chatOnce(url, key, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
  } finally {
    clearTimeout(timer);
  }
}

/* Sends a chat request to the AI providers. `vision` sends the request to Groq's image model only. */
async function askModel(fs, messages, deps, env, { vision = false, maxTokens = 4096 } = {}) {
  const settings = await aiSettings(fs);
  /* Groq keys live in Worker storage (same place as /api/ai). Old Firestore keys still work as a fallback. */
  const stored = deps.getGroqConfig ? await deps.getGroqConfig(env).catch(() => ({ keys: [], model: '' })) : { keys: [], model: '' };
  const groq = M.collectKeys({ w: stored.keys, q: settings.quiz_groq_keys, g: settings.groq_keys }, ['w', 'q', 'g']);
  const mistral = vision ? [] : M.collectKeys(settings, ['mistral_keys']);
  if (!groq.length && !mistral.length) throw new Error('AI is not set up yet. The site owner needs to add AI keys in Admin Settings.');
  const gModel = vision ? M.GROQ_VISION_MODEL : M.groqModelFor(stored.model || settings.groq_model);
  const groqP = groq.map(k => ({ name: 'groq', key: k, url: 'https://api.groq.com/openai/v1/chat/completions', body: { model: gModel, messages, max_tokens: maxTokens, temperature: vision ? 0 : 0.5, ...(gModel.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}) } }));
  const mistralP = mistral.map(k => ({ name: 'mistral', key: k, url: 'https://api.mistral.ai/v1/chat/completions', body: { model: String(settings.mistral_model || 'mistral-small-latest'), messages, max_tokens: maxTokens, temperature: 0.5 } }));
  /* Start at a random key so one busy key does not take every request. */
  const offset = Math.floor(Math.random() * Math.max(1, groqP.length));
  const ordered = [...groqP.map((_, i) => groqP[(i + offset) % groqP.length]), ...mistralP];
  const deadline = Date.now() + 100e3;
  let tried = 0;
  for (const p of ordered) {
    if (tried >= 6 || Date.now() > deadline - 5e3) break;
    tried++;
    try {
      const res = await chatOnce(p.url, p.key, p.body, Math.min(45e3, deadline - Date.now()));
      if (!res.ok) { console.warn(`multiplayer AI: ${p.name} answered ${res.status}`); continue; }
      const data = await res.json();
      const text = String((((data.choices || [])[0] || {}).message || {}).content || '');
      if (text.trim().length >= (vision ? 1 : 20)) return text;
    } catch (e) {
      console.warn(`multiplayer AI: ${p.name} failed: ${e.message}`);
    }
  }
  throw new Error('The AI service is busy or unavailable right now. Wait a minute, then press Continue.');
}

const writeQuestions = (fs, prompt, deps, env) => askModel(fs, [
  { role: 'system', content: 'You are an expert quiz writer. Reply with only the raw JSON array that was asked for.' },
  { role: 'user', content: prompt }
], deps, env);

/* Reads every word of text out of a picture (notes, slides, textbook pages, screenshots). */
const readImageText = (fs, image, deps, env) => askModel(fs, [{
  role: 'user',
  content: [
    { type: 'text', text: 'Read this image and write out ALL of the text in it, in reading order, exactly as written. Keep headings, bullet points, numbers, formulas and table rows (put each table row on one line, cells separated by " | "). If there are diagrams or charts, add one short line describing what they show and any labels. Do not summarise, skip or explain anything. If the image has no readable text, reply with exactly: NO TEXT' },
    { type: 'image_url', image_url: { url: image } }
  ]
}], deps, env, { vision: true, maxTokens: 6000 });

/* ── Sign-in check (guests have no email, so this does not use the email helper) ── */

const uidCache = new Map();
async function getUid(request, env) {
  const token = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Authentication required.');
  const hit = uidCache.get(token);
  if (hit && hit.until > Date.now()) return hit.uid;
  const key = String(env.FIREBASE_WEB_API_KEY || '').trim();
  if (!key) throw new Error('Authentication required.');
  const res = await fetch(`${LOOKUP_URL}?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }) });
  const data = await res.json().catch(() => ({}));
  const user = data && Array.isArray(data.users) ? data.users[0] : null;
  if (!res.ok || !user || !user.localId) throw new Error('Authentication required.');
  if (uidCache.size > 500) uidCache.clear();
  uidCache.set(token, { uid: String(user.localId), until: Date.now() + 60e3 });
  return String(user.localId);
}

/* ── Actions ──────────────────────────────────────────────────────────────── */

const roomP = id => `multiplayerRooms/${id}`;
const playerP = (id, uid) => `multiplayerRooms/${id}/players/${uid}`;
const claimP = (id, avatar) => `multiplayerRooms/${id}/avatarClaims/${avatar}`;
const shardP = (id, qi) => `multiplayerRooms/${id}/private/quiz_${M.shardIndex(qi)}`;

async function takeQuota(fs, uid, bucket) {
  const { limit, windowMs } = QUOTA[bucket];
  const path = `multiplayerLimits/${uid}_${bucket}`;
  await runTransaction(fs, async tx => {
    const snap = await tx.get(path);
    const next = M.nextQuota(snap, Date.now(), limit, windowMs);
    if (!next.ok) throw new Error('Too many requests. Please wait a while and try again.');
    if (snap) tx.update(path, { start: next.start, count: next.count });
    else tx.create(path, { start: next.start, count: next.count });
  });
}

async function loadQuestion(tx, id, qi) {
  const shard = await tx.get(shardP(id, qi));
  let question = null;
  try { question = shard ? JSON.parse(shard.json)[M.shardOffset(qi)] : null; } catch (_) { /* fall through */ }
  if (!question) throw new Error('Room state changed; try again.');
  return question;
}

function validateMusicTrack(track) {
  if (!track || typeof track !== 'object') throw new Error('Choose a licensed track first.');
  const url = String(track.url || '');
  let parsed;
  try { parsed = new URL(url); } catch (_) { throw new Error('Invalid music stream URL.'); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'upload.wikimedia.org') throw new Error('Only approved Wikimedia Commons audio streams are allowed.');
  const license = String(track.license || '').trim();
  if (!/^(?:CC0(?:\s+1\.0)?|CC BY(?:\s+[0-9.]+)?|Public domain)$/i.test(license)) throw new Error('This music licence is not approved for multiplayer.');
  const title = String(track.title || '').trim().slice(0, 100);
  const id = String(track.id || '').trim().slice(0, 40);
  if (!title || !id) throw new Error('The selected music track is missing its details.');
  const mime = String(track.mime || '').trim();
  if (!/^audio\/(mpeg|ogg|wav|flac|opus|x-wav)$/i.test(mime)) throw new Error('This audio format is not supported.');
  const pageUrl = String(track.pageUrl || '');
  if (!pageUrl.startsWith('https://commons.wikimedia.org/wiki/')) throw new Error('Invalid music source page.');
  return { id, title, artist: String(track.artist || 'Artist not listed').slice(0, 140), license, licenseUrl: String(track.licenseUrl || '').slice(0, 240), pageUrl, url, mime: mime.slice(0, 60), credit: String(track.credit || '').slice(0, 240) };
}

function requireHost(room, uid, message) {
  if (!room) throw new Error('Room not found.');
  if (room.hostUid !== uid) throw new Error(message || 'Only the host can change game state.');
}

const freshPlayer = (name, avatar, ready) => ({
  name, avatar, ready, voice: false, score: 0, answered: 0, correct: 0, wrong: 0, totalLatency: 0, joinedAt: SERVER_TS
});

const clearRound = { publicQuestion: DELETE, revealIndex: DELETE, lastWinner: DELETE };
const hex16 = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

const actions = {
  async peek({ fs, id }) {
    const [rooms, claims] = await Promise.all([fs.getMany([roomP(id)]), fs.list(`${roomP(id)}/avatarClaims`, { fields: ['uid'] })]);
    const d = rooms.get(roomP(id));
    if (!d) throw new Error('Room not found.');
    return { title: d.title, hostUid: d.hostUid, phase: d.phase, startAt: d.startAt && typeof d.startAt.toMillis === 'function' ? d.startAt.toMillis() : 0, capacity: d.capacity, playerCount: d.playerCount, secondsPerQuestion: d.secondsPerQuestion, questionCount: d.questionCount, difficulty: d.difficulty, takenAvatars: claims.map(x => Number(x.id)) };
  },

  async generate({ fs, uid, body, deps, env }) {
    const input = M.validateGenerate(body);
    await takeQuota(fs, uid, 'generate');
    return { text: await writeQuestions(fs, M.buildQuizPrompt(input), deps, env) };
  },

  async ocr({ fs, uid, body, deps, env }) {
    const image = M.validateImage(body);
    await takeQuota(fs, uid, 'ocr');
    const text = (await readImageText(fs, image, deps, env)).trim();
    return { text: /^NO TEXT\.?$/i.test(text) ? '' : text };
  },

  async create({ fs, uid, body }) {
    const input = M.validateRoom(body.room);
    const scheduledDelaySeconds = Number(body.room.scheduledDelaySeconds || 0);
    if (!Number.isInteger(scheduledDelaySeconds) || scheduledDelaySeconds < 0 || scheduledDelaySeconds > 604800) throw new Error('Scheduled opening must be between 0 seconds and 7 days.');
    const avatar = M.validateAvatar(body.avatar);
    const shards = M.shardQuestions(input.questions);
    await takeQuota(fs, uid, 'create');
    const id = hex16();
    const tx = makeTx(fs, null);
    tx.create(roomP(id), {
      roomId: id, title: input.title, hostUid: uid, pin: input.pin, capacity: input.capacity,
      playerCount: 1, voiceCount: 0, difficulty: input.difficulty, secondsPerQuestion: input.secondsPerQuestion,
      questionCount: input.questions.length, phase: 'lobby', currentQuestion: -1,
      startAt: ts(Date.now() + scheduledDelaySeconds * 1000),
      music: body.room && body.room.music && body.room.music.enabled === true && body.room.music.track
        ? { enabled: true, track: validateMusicTrack(body.room.music.track) } : { enabled: false, track: null },
      createdAt: SERVER_TS
    });
    shards.forEach((questions, i) => tx.create(`${roomP(id)}/private/quiz_${i}`, { json: JSON.stringify(questions) }));
    tx.create(playerP(id, uid), freshPlayer(String(body.hostName || 'Host').trim().slice(0, 35) || 'Host', avatar, true));
    tx.create(claimP(id, avatar), { uid });
    await fs.commit(tx.writes);
    return { roomId: id };
  },

  async setMusic({ fs, id, uid, body }) {
    await runTransaction(fs, async tx => {
      const room = await tx.get(roomP(id));
      requireHost(room, uid);
      if (!['lobby', 'question'].includes(room.phase)) throw new Error('Music can only be changed while the room is active.');
      const enabled = body.enabled === true;
      const track = enabled ? validateMusicTrack(body.track || (room.music && room.music.track)) : (room.music && room.music.track) || null;
      tx.update(roomP(id), { music: { enabled, track }, musicUpdatedAt: SERVER_TS });
    });
    return { ok: true };
  },

  async join({ fs, id, uid, body }) {
    const pin = String(body.pin || '');
    const name = String(body.name || '').trim().slice(0, 35);
    if (!name || !/^\d{4}$/.test(pin)) throw new Error('Name and four-digit PIN are required.');
    const requestedAvatar = body.avatar === undefined || body.avatar === null ? null : M.validateAvatar(body.avatar);
    await runTransaction(fs, async tx => {
      const got = await tx.getMany([roomP(id), playerP(id, uid)]);
      const d = got.get(roomP(id));
      if (!d) throw new Error('Room not found.');
      if (d.pin !== pin) throw new Error('Incorrect room PIN.');
      if (d.startAt && d.startAt.toMillis() > Date.now()) throw new Error('This room is scheduled to open later. Please wait for the countdown to finish.');
      if (got.get(playerP(id, uid))) return;
      if (!['lobby', 'question'].includes(d.phase) || Number(d.playerCount || 0) >= d.capacity) throw new Error('Room is closed or full.');

      let avatar = requestedAvatar;
      if (avatar === null) {
        /* Late joiners do not stop to choose an avatar: reserve the first free one on the server. */
        const claims = await tx.list(`${roomP(id)}/avatarClaims`, { fields: ['uid'] });
        const taken = new Set(claims.map(claim => Number(claim.id)));
        avatar = Array.from({ length: M.LIMITS.avatarCount }, (_, index) => index).find(index => !taken.has(index));
        if (avatar === undefined) throw new Error('Room is closed or full.');
      } else if (await tx.get(claimP(id, avatar))) {
        throw new Error('Avatar already taken.');
      }

      tx.create(claimP(id, avatar), { uid });
      tx.create(playerP(id, uid), freshPlayer(name, avatar, false));
      tx.update(roomP(id), { playerCount: Number(d.playerCount || 0) + 1 });
    });
    return { ok: true };
  },

  async avatar({ fs, id, uid, body }) {
    const avatar = M.validateAvatar(body.avatar);
    await runTransaction(fs, async tx => {
      const got = await tx.getMany([roomP(id), playerP(id, uid), claimP(id, avatar)]);
      const room = got.get(roomP(id)), me = got.get(playerP(id, uid));
      if (!room) throw new Error('Room not found.');
      if (!me) throw new Error('Player not found.');
      if (room.phase !== 'lobby') throw new Error('Room state changed; try again.');
      if (me.avatar === avatar) return;
      if (got.get(claimP(id, avatar))) throw new Error('Avatar already taken.');
      tx.delete(claimP(id, me.avatar));
      tx.create(claimP(id, avatar), { uid });
      tx.update(playerP(id, uid), { avatar });
    });
    return { ok: true };
  },

  async ready({ fs, id, uid, body }) {
    if (typeof body.ready !== 'boolean') throw new Error('Ready must be true or false.');
    await runTransaction(fs, async tx => {
      const got = await tx.getMany([roomP(id), playerP(id, uid)]);
      const room = got.get(roomP(id));
      if (!room) throw new Error('Room not found.');
      if (!got.get(playerP(id, uid))) throw new Error('Player not found.');
      if (room.phase !== 'lobby') throw new Error('Room state changed; try again.');
      tx.update(playerP(id, uid), { ready: body.ready });
    });
    return { ok: true };
  },

  async voice({ fs, id, uid, body }) {
    if (typeof body.on !== 'boolean') throw new Error('Voice must be true or false.');
    return runTransaction(fs, async tx => {
      const got = await tx.getMany([roomP(id), playerP(id, uid)]);
      const room = got.get(roomP(id)), me = got.get(playerP(id, uid));
      if (!room) throw new Error('Room not found.');
      if (!me) throw new Error('Player not found.');
      const live = Boolean(me.voice), count = Number(room.voiceCount || 0);
      if (body.on === live) return { ok: true };
      if (body.on && count >= M.LIMITS.maxVoice) throw new Error('Voice chat is full right now.');
      tx.update(playerP(id, uid), { voice: body.on });
      tx.update(roomP(id), { voiceCount: Math.max(0, count + (body.on ? 1 : -1)) });
      return { ok: true };
    });
  },

  async kick({ fs, id, uid, body }) {
    const targetUid = String(body.uid || '');
    if (!targetUid || targetUid.includes('/')) throw new Error('Player not found.');
    await runTransaction(fs, async tx => {
      const got = await tx.getMany([roomP(id), playerP(id, targetUid)]);
      const room = got.get(roomP(id)), target = got.get(playerP(id, targetUid));
      requireHost(room, uid, 'Only the host can remove players.');
      if (targetUid === uid || !target) return;
      tx.delete(playerP(id, targetUid));
      tx.delete(claimP(id, target.avatar));
      tx.update(roomP(id), { playerCount: Math.max(0, Number(room.playerCount || 1) - 1), voiceCount: Math.max(0, Number(room.voiceCount || 0) - (target.voice ? 1 : 0)) });
    });
    return { ok: true };
  },

  async leave({ fs, id, uid }) {
    await runTransaction(fs, async tx => {
      const got = await tx.getMany([roomP(id), playerP(id, uid)]);
      const room = got.get(roomP(id)), me = got.get(playerP(id, uid));
      if (!room || !me || room.hostUid === uid || room.phase !== 'lobby') return;
      tx.delete(playerP(id, uid));
      tx.delete(claimP(id, me.avatar));
      tx.update(roomP(id), { playerCount: Math.max(0, Number(room.playerCount || 1) - 1), voiceCount: Math.max(0, Number(room.voiceCount || 0) - (me.voice ? 1 : 0)) });
    });
    return { ok: true };
  },

  async start({ fs, id, uid, body }) {
    await runTransaction(fs, async tx => {
      const [room, players] = await Promise.all([tx.get(roomP(id)), tx.list(`${roomP(id)}/players`, { fields: ['ready'] })]);
      requireHost(room, uid);
      if (room.phase !== 'lobby' || !players.length || (room.startAt && room.startAt.toMillis() > Date.now())) throw new Error('This room is not open yet. Wait for its countdown to finish.');
      if (body.force !== true && players.some(p => !p.data.ready)) throw new Error('Room state changed; try again.');
      const question = await loadQuestion(tx, id, 0);
      const startMs = Date.now() + M.LIMITS.countdownMs;
      tx.update(roomP(id), {
        phase: 'question', currentQuestion: 0,
        questionStartedAt: ts(startMs), deadlineAt: ts(startMs + room.secondsPerQuestion * 1000),
        publicQuestion: M.publicQuestion(question)
      });
    });
    return { ok: true };
  },

  async reveal({ fs, id, uid }) {
    await runTransaction(fs, async tx => {
      const room = await tx.get(roomP(id));
      requireHost(room, uid);
      if (room.phase !== 'question' || !room.deadlineAt || (room.deadlineAt.toMillis() > Date.now() && !(room.lastWinner && room.lastWinner.questionIndex === room.currentQuestion))) throw new Error('Room state changed; try again.');
      if (room.revealIndex !== undefined && room.revealIndex !== null && room.revealedQuestion === room.currentQuestion) return;
      const question = await loadQuestion(tx, id, room.currentQuestion);
      tx.update(roomP(id), { revealIndex: M.correctIndex(question), revealedQuestion: room.currentQuestion });
    });
    return { ok: true };
  },

  async advance({ fs, id, uid }) {
    await runTransaction(fs, async tx => {
      const room = await tx.get(roomP(id));
      requireHost(room, uid);
      if (room.phase !== 'question' || !room.deadlineAt || (room.deadlineAt.toMillis() > Date.now() && !(room.lastWinner && room.lastWinner.questionIndex === room.currentQuestion))) throw new Error('Room state changed; try again.');
      const next = room.currentQuestion + 1;
      if (next >= room.questionCount) {
        tx.update(roomP(id), { phase: 'complete', completedAt: SERVER_TS, ...clearRound });
        return;
      }
      const question = await loadQuestion(tx, id, next);
      const startMs = Date.now() + 1500;
      tx.update(roomP(id), {
        currentQuestion: next, questionStartedAt: ts(startMs), deadlineAt: ts(startMs + room.secondsPerQuestion * 1000),
        publicQuestion: M.publicQuestion(question), revealIndex: DELETE, lastWinner: DELETE
      });
    });
    return { ok: true };
  },

  async finish({ fs, id, uid }) {
    await runTransaction(fs, async tx => {
      const room = await tx.get(roomP(id));
      requireHost(room, uid);
      tx.update(roomP(id), { phase: 'complete', completedAt: SERVER_TS, ...clearRound });
    });
    return { ok: true };
  },

  async answer({ fs, id, uid, body }) {
    const qi = Number(body.questionIndex), option = Number(body.option);
    if (!Number.isInteger(qi) || qi < 0 || !Number.isInteger(option) || option < 0 || option > 3) throw new Error('Invalid answer.');
    const attemptP = `${roomP(id)}/answers/${qi}_${uid}`;
    const firstP = `${roomP(id)}/private/first_${qi}`;
    return runTransaction(fs, async tx => {
      const got = await tx.getMany([roomP(id), playerP(id, uid), attemptP, firstP, shardP(id, qi)]);
      const room = got.get(roomP(id)), me = got.get(playerP(id, uid));
      if (!room) throw new Error('Room not found.');
      if (!me) throw new Error('Player not found.');
      const now = Date.now();
      const startMs = room.questionStartedAt ? room.questionStartedAt.toMillis() : 0;
      const state = M.answerWindow({ phase: room.phase, currentQuestion: room.currentQuestion, questionIndex: qi, startMs, deadlineMs: room.deadlineAt ? room.deadlineAt.toMillis() : 0, nowMs: now });
      if (state === 'countdown') throw new Error('Get ready. The question has not started yet.');
      if (state !== 'open') throw new Error('Question is closed.');
      if (got.get(attemptP)) throw new Error('You already answered this question.');
      let question = null;
      try { const shard = got.get(shardP(id, qi)); question = shard ? JSON.parse(shard.json)[M.shardOffset(qi)] : null; } catch (_) { /* below */ }
      if (!question) throw new Error('Room state changed; try again.');
      const right = M.correctIndex(question), correct = option === right;
      const first = got.get(firstP);
      const outcome = M.answerOutcome({ correct, firstCorrectUid: first ? first.uid : null });
      const elapsed = Math.max(0, (now - startMs) / 1000);
      tx.create(attemptP, { uid, questionIndex: qi, option, correct, submittedAt: SERVER_TS });
      tx.update(playerP(id, uid), {
        answered: inc(1), [correct ? 'correct' : 'wrong']: inc(1), totalLatency: inc(elapsed),
        ...(outcome.firstCorrect ? { score: inc(outcome.scoreDelta) } : {})
      });
      if (outcome.firstCorrect) {
        tx.create(firstP, { uid, at: SERVER_TS });
        tx.update(roomP(id), { lastWinner: { questionIndex: qi, uid, name: me.name, avatar: me.avatar, correctIndex: right } });
      }
      return { correct, firstCorrect: outcome.firstCorrect, scoreDelta: outcome.scoreDelta };
    });
  }
};

/* ── HTTP entry ───────────────────────────────────────────────────────────── */

/* deps: { json, corsHeaders, getAccessToken(env), getGroqConfig(env) -> { keys, model } } */
export async function handleMultiplayer(request, env, deps) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: deps.corsHeaders(request, env) });
  if (request.method !== 'POST') return deps.json(request, env, { error: 'Use POST.' }, 405);
  try {
    const uid = await getUid(request, env);
    const body = await request.json().catch(() => ({}));
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const action = String(input.action || '');
    const handler = Object.prototype.hasOwnProperty.call(actions, action) ? actions[action] : null;
    if (!handler) return deps.json(request, env, { error: 'Unknown multiplayer action.' }, 400);
    let id = '';
    if (action !== 'create' && action !== 'generate' && action !== 'ocr') {
      id = String(input.roomId || '');
      if (!ROOM_ID.test(id)) throw new Error('Invalid room id.');
    }
    const fs = makeClient(env, deps.getAccessToken);
    const result = await handler({ fs, id, uid, body: input, deps, env });
    /* serverNow lets each browser correct for its own clock when counting down. */
    return deps.json(request, env, { ...result, serverNow: Date.now() });
  } catch (e) {
    const status = M.errorStatus(e);
    if (status >= 500 || e instanceof FirestoreError) console.error('multiplayer error', e && e.message);
    const message = e instanceof FirestoreError ? 'The game server had a problem. Try again in a moment.' : (e.message || 'Multiplayer operation failed.');
    return deps.json(request, env, { error: message }, e instanceof FirestoreError ? 503 : status);
  }
}

export const __test = { enc, dec, runTransaction, makeClient, resetCaches() { tokenCache = { value: '', until: 0 }; settingsCache = { at: 0, data: {} }; uidCache.clear(); } };
