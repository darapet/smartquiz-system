/* SmartQuiz live multiplayer: page controller.
   Flow: sign in (host) -> build quiz with AI -> room settings -> lobby -> game -> results.
   Players open the room link, choose a name, PIN and avatar, and land in the same lobby.
   The server (functions/multiplayer-functions.js) owns every rule; this file only shows state. */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import * as fs from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  LIMITS, extractJsonArray, normalizeQuestions, validateSetup, validateRoomSettings,
  rankPlayers, accuracy, countdownLabel, timeFraction, randomPin,
  planUnits, recommendedCount, minCountToCover, shuffled, SOURCE
} from './mp-core.js';
import { readOne, kindOf, DOC_LIMITS } from './mp-docs.js';
import { avatarSvg } from './mp-avatars.js';
import { createPicker, avatarInfo } from './mp-picker.js';
import { createVoice } from './mp-voice.js';

const firebaseConfig = { apiKey: 'AIzaSyCFVx82QXdKdufbUIHBBOOzDefNoFBYxtY', authDomain: 'smartquiz-darapet.firebaseapp.com', databaseURL: 'https://smartquiz-darapet-default-rtdb.firebaseio.com', projectId: 'smartquiz-darapet', storageBucket: 'smartquiz-darapet.firebasestorage.app', messagingSenderId: '915234258423', appId: '1:915234258423:web:0c8fc183e9e3ce0852c2f2', measurementId: 'G-W4G9C4X9H0' };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
let db;
try {
  db = fs.initializeFirestore(app, { experimentalForceLongPolling: true, useFetchStreams: false });
} catch (e) {
  /* The shared site script may have started Firestore first; reuse that instance. */
  db = fs.getFirestore(app);
}

const ROOM_ID = /^[A-F0-9]{16}$/;

/* The site is served from GitHub Pages / Cloudflare, where the Firebase Hosting rewrite
   (/api/multiplayer) does not exist. Call the Cloud Function directly unless this page is
   itself on Firebase Hosting. Set window.AQS_MULTIPLAYER_API_URL to override. */
const API_URL = (typeof window.AQS_MULTIPLAYER_API_URL === 'string' && window.AQS_MULTIPLAYER_API_URL) ||
  'https://smartquiz-system3.daramolapeter98.workers.dev/api/multiplayer';
const POINTS = 5;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ms = ts => (ts && ts.toMillis ? ts.toMillis() : 0);

const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
  micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M9 9v2a3 3 0 005.1 2.1M15 9.3V6a3 3 0 00-5.7-1.3"/><path d="M5 11a7 7 0 0011.2 5.6M19 11a7 7 0 01-.6 2.8M12 18v3"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>'
};

const S = {
  roomId: '', room: null, players: [], me: null, isHost: false, view: '',
  skew: 0, token: '', link: '', unsubs: [], tiles: new Map(), renderTimer: 0,
  level: 'Easy', docs: [], docSeq: 0, gen: null, hostPicker: null, joinPicker: null, dialogPicker: null,
  voice: null, speaking: new Set(), voiceSyncTimer: 0,
  q: { index: -1, start: 0, end: 0, answered: false, picked: -1, result: null, timeUp: false, revealTries: 0 }, tick: 0
};

const now = () => Date.now() + S.skew;

/* ───────────────────────── small UI helpers ───────────────────────── */

function say(id, text, kind) {
  const el = $(id);
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('ok', kind === 'ok');
}

let toastTimer = 0;
function toast(text) {
  let el = $('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 3200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const t = document.createElement('textarea');
    t.value = text;
    t.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(t);
    t.select();
    try { document.execCommand('copy'); } catch (err) { /* nothing else to try */ }
    t.remove();
  }
  toast('Room link copied');
}

function show(name) {
  clearInterval(S.tick);
  S.tick = 0;
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== `v-${name}`; });
  document.body.dataset.view = name;
  S.view = name;
  const inRoom = name === 'lobby' || name === 'game';
  $('top-room').hidden = !inRoom;
  $('mic-toggle').hidden = !inRoom;
  window.scrollTo(0, 0);
}

function updateHeader() {
  const d = S.room;
  if (!d) return;
  $('top-title').textContent = d.title;
  $('top-seconds').textContent = `${d.secondsPerQuestion}s per question`;
  $('top-count').textContent = `${S.players.length} player${S.players.length === 1 ? '' : 's'}`;
}

/* ───────────────────────── server calls ───────────────────────── */

/* No account is needed to host or join. Everyone gets a guest session from Firebase. */
async function ensureSignedIn() {
  if (auth.currentUser) return '';
  try {
    await signInAnonymously(auth);
    return '';
  } catch (e) {
    if (e && /admin-restricted|operation-not-allowed/.test(e.code || '')) {
      return 'Guest access is turned off for this project. In the Firebase console open Authentication, then Sign-in method, and enable Anonymous.';
    }
    return 'Could not start a guest session. Check your connection and refresh the page.';
  }
}

async function api(action, payload = {}, signal) {
  if (!auth.currentUser) {
    const problem = await ensureSignedIn();
    if (problem) throw new Error(problem);
  }
  const user = auth.currentUser;
  const token = await user.getIdToken();
  S.token = token;
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload }),
      signal
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new Error('Could not reach the server. Check your internet connection.');
  }
  const t1 = Date.now();
  const body = await res.json().catch(() => ({}));
  if (typeof body.serverNow === 'number') S.skew = body.serverNow - (t0 + t1) / 2;
  if (!res.ok) {
    const failure = new Error(!body.error && (res.status === 404 || res.status === 405)
      ? 'The multiplayer server was not found. The site owner needs to deploy the Cloudflare Worker.'
      : body.error || `The multiplayer service returned ${res.status}.`);
    failure.status = res.status;
    throw failure;
  }
  return body;
}

/* Shareable room links must use a public HTTPS page. Capacitor's local
   capacitor://localhost origin only exists on the host's device, so players on
   other phones cannot open it. Keep the current web host when already online. */
const roomLink = id => {
  const nativeOrLocal = /^(capacitor|ionic):$/i.test(location.protocol)
    || ['localhost', '127.0.0.1'].includes(location.hostname);
  const page = nativeOrLocal
    ? 'https://darapet.github.io/smartquiz-system/multiplayer-host.html'
    : `${location.origin}${location.pathname}`;
  return `${page}?room=${encodeURIComponent(id)}`;
};

/* ───────────────────────── step 1: build the quiz with AI ───────────────────────── */

/* All the text from the files the host added, in the order they were added. */
function sourceText() {
  return S.docs.filter(d => d.status === 'ok').map(d => `Source: ${d.name}\n${d.text}`).join('\n\n');
}

function readSetup() {
  const source = sourceText();
  return {
    title: $('title').value.trim(),
    seconds: parseInt($('seconds').value, 10),
    count: parseInt($('count').value, 10),
    prompt: $('prompt').value.trim(),
    level: S.level,
    source,
    hasSource: source.length > 0
  };
}

/* ───────────────────────── study material (files and photos) ───────────────────────── */

const fmtNum = n => n.toLocaleString('en-US');

async function readPicture(dataUrl) {
  const r = await api('ocr', { image: dataUrl });
  return String(r.text || '');
}

function renderDocs() {
  const list = $('doc-list');
  list.innerHTML = S.docs.map(d => {
    const info = d.status === 'ok' ? `${fmtNum(d.text.length)} characters read${d.note || ''}`
      : d.status === 'err' ? d.error : (d.progress || 'Reading…');
    return `<li class="docitem ${d.status === 'ok' ? 'ok' : d.status === 'err' ? 'err' : ''}" data-id="${d.id}"><b>${esc(d.name)}</b><small>${esc(info)}</small><button type="button" class="doc-x" aria-label="Remove ${esc(d.name)}">✕</button></li>`;
  }).join('');
  const text = sourceText();
  const chars = text.length, busy = S.docs.some(d => d.status === 'busy');
  const has = chars > 0;
  $('doc-sum').hidden = !has;
  $('mix-wrap').hidden = !has;
  $('prompt-label').textContent = has ? 'Anything to focus on? (optional)' : 'What should the questions be about?';
  $('prompt').placeholder = has ? 'e.g. Only chapters 2 and 3, or focus on definitions' : 'e.g. Cell biology for first-year university students: organelles, mitosis, DNA replication';
  $('generate').disabled = busy || (S.gen && S.gen.running);
  if (!has) return;
  const rec = recommendedCount(chars), want = parseInt($('count').value, 10) || 0;
  $('doc-sum-text').textContent = `${fmtNum(chars)} characters read from ${S.docs.filter(d => d.status === 'ok').length} file(s). About ${fmtNum(rec)} question${rec === 1 ? '' : 's'} would cover all of it. ` +
    (want && want < rec ? `You asked for ${fmtNum(want)}, so each question will come from a wider part of your material. Every part is still used.` : 'Every part of your material will be used.');
  const btn = $('use-rec');
  btn.hidden = want === rec;
  btn.textContent = `Use ${fmtNum(rec)} questions`;
}

async function addFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  say('msg-setup', '');
  for (const file of files) {
    if (S.docs.length >= DOC_LIMITS.maxFiles) { say('msg-setup', `You can add up to ${DOC_LIMITS.maxFiles} files.`); break; }
    const doc = { id: ++S.docSeq, name: file.name, status: 'busy', text: '', note: '', error: '', progress: kindOf(file) === 'image' ? 'Reading the picture…' : 'Reading…' };
    S.docs.push(doc);
    renderDocs();
    try {
      const r = await readOne(file, {
        readImage: readPicture,
        onProgress: t => { doc.progress = t; const el = document.querySelector(`.docitem[data-id="${doc.id}"] small`); if (el) el.textContent = t; }
      });
      doc.text = r.text; doc.note = r.note; doc.status = 'ok';
      const total = sourceText().length;
      if (total > SOURCE.maxTotalChars) { doc.status = 'err'; doc.text = ''; doc.error = 'Your files together are too long. Remove something or split the material into two quizzes.'; }
    } catch (e) {
      doc.status = 'err';
      doc.error = (e && e.message) || 'This file could not be read.';
    }
    renderDocs();
  }
  /* Suggest a size that covers everything the first time material is added. */
  const chars = sourceText().length;
  if (chars && !S.countTouched) $('count').value = String(recommendedCount(chars));
  renderDocs();
}

function lockSetup(locked) {
  ['title', 'seconds', 'count', 'prompt', 'generate', 'docs', 'mix'].forEach(id => { $(id).disabled = locked; });
  document.querySelectorAll('.doc-x').forEach(b => { b.disabled = locked; });
  document.querySelectorAll('#levels .level').forEach(b => { b.disabled = locked; });
}

function aiErrorText(status, e) {
  if (navigator.onLine === false) return 'You appear to be offline. Reconnect, then press Continue.';
  return (e && e.message) || 'The AI did not answer. Press Continue to try again.';
}

/* The AI keys live on the server, so guests can generate questions without logging in. */
async function askAI(cfg, need, G) {
  G.status = 0;
  G.ctrl = new AbortController();
  const timer = setTimeout(() => G.ctrl.abort(), 110000);
  const unit = G.units[G.ui];
  try {
    const r = await api('generate', {
      topic: cfg.prompt, difficulty: cfg.level, count: need,
      avoid: G.unitQs.slice(-30), batch: ++G.batch,
      ...(unit.text ? { source: unit.text, part: G.ui + 1, parts: G.units.length } : {})
    }, G.ctrl.signal);
    const text = String(r.text || '');
    if (text.trim().length < 20) throw new Error('The AI sent an empty reply.');
    return text;
  } catch (e) {
    G.status = e.status || 0;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function paintGen() {
  const G = S.gen, n = G.questions.length, total = G.cfg.count;
  $('gen-count').textContent = `${n} of ${total} question${total === 1 ? '' : 's'}`;
  const pct = Math.round((n / total) * 100);
  $('gen-fill').style.width = `${pct}%`;
  $('gen-bar').setAttribute('aria-valuenow', String(pct));
  $('gen-stop').hidden = !G.running;
  $('gen-continue').hidden = G.running || n >= total;
  $('to-room').hidden = G.running || n < 1;
  $('to-room').textContent = n >= total ? 'Next: room settings →' : `Use these ${n} question${n === 1 ? '' : 's'} →`;
}

function appendQuestions(fresh, startIndex) {
  const list = $('qlist');
  const nearEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  const frag = document.createDocumentFragment();
  fresh.forEach((q, i) => {
    const li = document.createElement('li');
    li.className = 'qitem';
    li.innerHTML = `<b>${startIndex + i + 1}. ${esc(q.text)}</b><div class="ans">${q.options.map((o, j) => `<span class="${o.correct ? 'right' : ''}">${'ABCD'[j]}. ${esc(o.text)}${o.correct ? ' ✓' : ''}</span>`).join('')}</div>`;
    frag.appendChild(li);
  });
  list.appendChild(frag);
  if (nearEnd) list.scrollTop = list.scrollHeight;
}

async function runGeneration() {
  const G = S.gen, cfg = G.cfg;
  if (G.running) return;
  G.running = true;
  G.stop = false;
  G.error = '';
  lockSetup(true);
  say('msg-setup', '');
  let stalls = 0, failures = 0;
  paintGen();

  while (!G.stop && G.questions.length < cfg.count) {
    const unit = G.units[G.ui];
    if (!unit) break;
    if (G.uDone >= unit.count) { G.ui++; G.uDone = 0; G.unitQs = []; stalls = 0; continue; }
    const have = G.questions.length;
    const need = Math.min(LIMITS.batchSize, unit.count - G.uDone);
    $('gen-state').textContent = unit.text && G.units.length > 1
      ? `Writing questions ${have + 1} to ${have + need} (material part ${G.ui + 1} of ${G.units.length})…`
      : `Writing questions ${have + 1} to ${have + need}…`;
    try {
      const raw = await askAI(cfg, need, G);
      const fresh = normalizeQuestions(extractJsonArray(raw), G.questions).slice(0, need);
      if (!fresh.length) {
        if (++stalls >= 3) {
          if (unit.text) {
            /* This part of the material has no more new points. Give its remaining questions to the next part. */
            const spare = unit.count - G.uDone;
            const next = G.units[G.ui + 1];
            if (next) next.count += spare;
            else throw new Error('The AI could not find enough new points in your material. Press Continue to try again, or lower the number of questions.');
            unit.count = G.uDone;
            continue;
          }
          throw new Error('The AI keeps repeating itself. Try a broader topic, then press Continue.');
        }
        continue;
      }
      stalls = 0;
      failures = 0;
      G.questions.push(...fresh);
      G.unitQs.push(...fresh.map(q => q.text));
      G.uDone += fresh.length;
      appendQuestions(fresh, have);
      paintGen();
    } catch (e) {
      if (G.stop) break;
      const final = G.status === 429 || /AI is not set up/.test(e.message || '');
      if (final || ++failures >= 2) {
        G.error = aiErrorText(G.status, e);
        break;
      }
      await sleep(1500);
    }
  }

  G.running = false;
  lockSetup(false);
  const n = G.questions.length;
  if (n >= cfg.count) $('gen-state').textContent = 'All questions are ready. Review them, then continue.';
  else $('gen-state').textContent = G.error ? `Stopped at ${n}. ${G.error}` : `Paused at ${n}. Press Continue to keep going.`;
  paintGen();
}

function startGeneration() {
  const cfg = readSetup();
  const err = validateSetup(cfg);
  if (err) return say('msg-setup', err);
  if (S.docs.some(d => d.status === 'busy')) return say('msg-setup', 'Wait for your files to finish reading.');
  if (cfg.hasSource) {
    const least = minCountToCover(cfg.source.length);
    if (cfg.count < least) {
      cfg.count = least;
      $('count').value = String(least);
      say('msg-setup', `Your material is long, so the quiz needs at least ${fmtNum(least)} questions to include all of it. The number was raised to match.`, 'ok');
    }
  }
  if (S.gen && S.gen.questions.length && !confirm('Start over? The questions you have now will be replaced.')) return;
  /* With files, every part of the material gets its share of the questions. */
  const units = cfg.hasSource ? planUnits(cfg.source, cfg.count) : [{ text: '', count: cfg.count }];
  S.gen = { cfg, units, ui: 0, uDone: 0, unitQs: [], questions: [], running: false, stop: false, ctrl: null, batch: 0, error: '', status: 0 };
  $('qlist').innerHTML = '';
  $('gen').hidden = false;
  runGeneration();
}

function pauseGeneration() {
  const G = S.gen;
  if (!G || !G.running) return;
  G.stop = true;
  if (G.ctrl) G.ctrl.abort();
}

/* ───────────────────────── step 2: room settings ───────────────────────── */

function openRoomStep() {
  if (!S.gen || !S.gen.questions.length) return;
  show('room');
  if (!$('pin').value) $('pin').value = randomPin();
  if (!S.hostPicker) S.hostPicker = createPicker($('host-picker'), {});
  say('msg-room', '');
}

async function hostRoom() {
  const setup = readSetup();
  const seconds = setup.seconds;
  const title = setup.title;
  const capacity = parseInt($('capacity').value, 10);
  const pin = $('pin').value.trim();
  const err = (!title && 'Give your quiz a name.') ||
    (!Number.isInteger(seconds) || seconds < LIMITS.minSeconds || seconds > LIMITS.maxSeconds ? 'Time per question must be 5 to 120 seconds.' : '') ||
    validateRoomSettings({ capacity, pin });
  if (err) return say('msg-room', err);

  $('host-btn').disabled = true;
  say('msg-room', 'Creating your room…', 'ok');
  try {
    const r = await api('create', {
      hostName: $('host-name').value.trim().slice(0, 35) || 'Host',
      avatar: S.hostPicker.get(),
      room: { title, pin, capacity, secondsPerQuestion: seconds, difficulty: S.gen.cfg.level, questions: S.gen.cfg.hasSource && $('mix').checked ? shuffled(S.gen.questions) : S.gen.questions }
    });
    S.roomId = r.roomId;
    S.link = roomLink(r.roomId);
    $('link-text').textContent = S.link;
    $('link-pin').textContent = pin;
    $('link-code').textContent = r.roomId;
    $('linkcard').hidden = false;
    $('back-setup').disabled = true;
    say('msg-room', '');
    $('linkcard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (e) {
    $('host-btn').disabled = false;
    say('msg-room', e.message);
  }
}

/* ───────────────────────── joining as a player ───────────────────────── */

async function bootPlayer(rid, pinParam, notice) {
  show('join');
  say('msg-join', notice || '');
  $('join-btn').disabled = true;
  if (!ROOM_ID.test(rid)) return say('msg-join', 'This room link is not valid. Ask the host for a new one.');
  const problem = await ensureSignedIn();
  if (problem) return say('msg-join', problem);

  /* Already in this room (a refresh, or the host coming back)? Go straight in. */
  try {
    const snap = await fs.getDoc(fs.doc(db, 'multiplayerRooms', rid));
    if (snap.exists()) return enterRoom(rid);
  } catch (e) { /* not a member yet */ }

  let info;
  try {
    info = await api('peek', { roomId: rid });
  } catch (e) {
    return say('msg-join', e.message);
  }
  S.roomId = rid;
  $('join-room-code').value = rid;
  $('join-title').textContent = info.title;
  $('join-meta').textContent = `${info.secondsPerQuestion} seconds per question · ${info.questionCount} questions · ${info.difficulty} · ${info.playerCount} of ${info.capacity} players`;
  if (pinParam && /^\d{4}$/.test(pinParam)) $('join-pin').value = pinParam;
  const user = auth.currentUser;
  if (user && !user.isAnonymous && user.displayName && !$('join-name').value) $('join-name').value = user.displayName.slice(0, 35);

  const taken = new Set(info.takenAvatars);
  if (S.joinPicker) S.joinPicker.setTaken(taken);
  else S.joinPicker = createPicker($('join-picker'), { taken });

  if (info.phase !== 'lobby') say('msg-join', 'This game has already started.');
  else if (info.playerCount >= info.capacity) say('msg-join', 'This room is full.');
  else $('join-btn').disabled = false;
}

async function findRoom() {
  const rid = String($('join-room-code').value || '').trim().toUpperCase();
  $('join-room-code').value = rid;
  if (!ROOM_ID.test(rid)) return say('msg-join', 'Enter the 16-character room code from the host.');
  $('find-room-btn').disabled = true;
  $('join-btn').disabled = true;
  say('msg-join', 'Finding room…', 'ok');
  try {
    await bootPlayer(rid, '');
  } finally {
    $('find-room-btn').disabled = false;
  }
}

async function joinRoom() {
  const name = $('join-name').value.trim();
  const pin = $('join-pin').value.trim();
  if (!name) return say('msg-join', 'Enter your name.');
  if (!/^\d{4}$/.test(pin)) return say('msg-join', 'Enter the four-digit room PIN.');
  $('join-btn').disabled = true;
  say('msg-join', 'Joining…', 'ok');
  try {
    await api('join', { roomId: S.roomId, pin, name, avatar: S.joinPicker.get() });
    enterRoom(S.roomId);
  } catch (e) {
    $('join-btn').disabled = false;
    say('msg-join', e.message);
    if (e.message === 'Avatar already taken.') {
      try {
        const info = await api('peek', { roomId: S.roomId });
        S.joinPicker.setTaken(new Set(info.takenAvatars));
        say('msg-join', 'Someone just took that avatar. We picked another one for you.');
      } catch (err) { /* keep the first message */ }
    }
  }
}

/* ───────────────────────── live room ───────────────────────── */

function enterRoom(rid) {
  cleanupRoom();
  S.roomId = rid;
  S.link = roomLink(rid);
  history.replaceState(null, '', `?room=${rid}`);
  const uid = auth.currentUser.uid;

  S.voice = createVoice({
    fs, db, roomId: rid, uid,
    setVoice: on => api('voice', { roomId: rid, on }),
    getPlayers: () => S.players,
    audioHost: $('voice-audio'),
    onState: setMicUI,
    onSpeaking: set => { S.speaking = set; paintSpeaking(); },
    onError: message => toast(message)
  });
  setMicUI('off');

  S.unsubs.push(fs.onSnapshot(fs.doc(db, 'multiplayerRooms', rid), onRoom, onListenError));
  S.unsubs.push(fs.onSnapshot(fs.query(fs.collection(db, 'multiplayerRooms', rid, 'players'), fs.orderBy('joinedAt')), onPlayers, onListenError));
}

function cleanupRoom() {
  S.unsubs.forEach(f => { try { f(); } catch (e) { /* already closed */ } });
  S.unsubs = [];
  if (S.voice) { S.voice.stop(); S.voice = null; }
  S.tiles.clear();
  $('stage').innerHTML = '';
  S.room = null;
  S.players = [];
  S.me = null;
  S.q = { index: -1, start: 0, end: 0, answered: false, picked: -1, result: null, timeUp: false, revealTries: 0 };
}

function onListenError(e) {
  if (!S.unsubs.length) return;
  if (e && e.code === 'permission-denied') {
    const rid = S.roomId;
    cleanupRoom();
    bootPlayer(rid, null, 'You are no longer in this room. The host may have removed you.');
  } else {
    toast('Connection problem. Trying to reconnect…');
  }
}

function onRoom(snap) {
  if (!snap.exists()) {
    cleanupRoom();
    show('join');
    $('join-btn').disabled = true;
    return say('msg-join', 'This room has been closed.');
  }
  const d = snap.data();
  S.room = d;
  S.isHost = d.hostUid === auth.currentUser.uid;
  if (d.phase === 'lobby') {
    if (S.view !== 'lobby') { show('lobby'); initLobby(); }
    paintLobbyInfo();
  } else if (d.phase === 'question') {
    if (S.view !== 'game') { show('game'); $('host-controls').hidden = !S.isHost; }
    onQuestion(d);
  } else if (d.phase === 'complete') {
    if (S.view !== 'results') showResults();
  }
  updateHeader();
}

function onPlayers(snap) {
  S.players = snap.docs.map(x => ({ uid: x.id, ...x.data() }));
  S.me = S.players.find(p => p.uid === auth.currentUser.uid) || null;
  scheduleRender();
  clearTimeout(S.voiceSyncTimer);
  S.voiceSyncTimer = setTimeout(() => { if (S.voice) S.voice.sync(); }, 700);
}

function scheduleRender() {
  if (S.renderTimer) return;
  S.renderTimer = setTimeout(() => {
    S.renderTimer = 0;
    updateHeader();
    if (S.view === 'lobby') renderLobby();
    else if (S.view === 'game') renderGameBar();
    else if (S.view === 'results') renderResults();
  }, 60);
}

/* ───────────────────────── lobby ───────────────────────── */

function initLobby() {
  $('stage').innerHTML = '';
  S.tiles.clear();
  say('msg-lobby', '');
  try {
    $('qr').hidden = true;
    if (window.QRCode) Promise.resolve(window.QRCode.toCanvas($('qr'), S.link, { width: 192, margin: 1 })).then(() => { $('qr').hidden = false; }).catch(() => {});
  } catch (e) { /* the QR code is optional */ }
}

function paintLobbyInfo() {
  const d = S.room;
  $('lobby-title').textContent = d.title;
  $('lobby-meta').textContent = `${d.secondsPerQuestion} seconds per question · ${d.questionCount} question${d.questionCount === 1 ? '' : 's'} · ${d.difficulty}`;
  $('room-pin').textContent = d.pin;
  $('room-code').textContent = S.roomId;
  $('room-link').textContent = S.link;
  $('player-cap').textContent = d.capacity;
  $('ready-btn').hidden = S.isHost;
  $('start-btn').hidden = !S.isHost;
  scheduleRender();
}

function makeTile(uid) {
  const el = document.createElement('div');
  el.className = 'pl';
  el.dataset.uid = uid;
  el.innerHTML = '<div class="av"></div><div class="nm"></div><div class="sk"></div><div class="state"></div>';
  return el;
}

function updateTile(el, p) {
  const hostUid = S.room.hostUid, meUid = auth.currentUser.uid;
  el.classList.toggle('me', p.uid === meUid);
  el.classList.toggle('is-ready', !!p.ready);
  el.classList.toggle('speaking', S.speaking.has(p.uid));
  const av = el.querySelector('.av');
  if (el.dataset.av !== String(p.avatar)) {
    av.innerHTML = avatarSvg(p.avatar);
    el.dataset.av = String(p.avatar);
  }
  const hasTick = !!av.querySelector('.tick');
  if (p.ready && !hasTick) av.insertAdjacentHTML('beforeend', `<span class="tick" title="Ready">${ICON.check}</span>`);
  else if (!p.ready && hasTick) av.querySelector('.tick').remove();
  const hasCrown = !!el.querySelector('.crown');
  if (p.uid === hostUid && !hasCrown) el.insertAdjacentHTML('afterbegin', `<span class="crown" title="Host">${ICON.crown}</span>`);
  const hasVoice = !!el.querySelector('.voice');
  if (p.voice && !hasVoice) el.insertAdjacentHTML('afterbegin', `<span class="voice" title="Mic on">${ICON.mic}</span>`);
  else if (!p.voice && hasVoice) el.querySelector('.voice').remove();
  const canKick = S.isHost && p.uid !== meUid;
  const hasKick = !!el.querySelector('.kick');
  if (canKick && !hasKick) el.insertAdjacentHTML('beforeend', `<button type="button" class="kick" aria-label="Remove ${esc(p.name)}" title="Remove player">×</button>`);
  else if (!canKick && hasKick) el.querySelector('.kick').remove();
  el.querySelector('.nm').textContent = p.uid === meUid ? `${p.name} (you)` : p.name;
  el.querySelector('.sk').textContent = avatarInfo(p.avatar).skill;
  el.querySelector('.state').textContent = p.ready ? 'Ready' : 'Not ready';
}

function renderLobby() {
  if (!S.room) return;
  const stage = $('stage');
  stage.classList.toggle('lobby-lite', S.players.length > 60);
  const seen = new Set();
  S.players.forEach((p, i) => {
    let el = S.tiles.get(p.uid);
    if (!el) { el = makeTile(p.uid); S.tiles.set(p.uid, el); }
    updateTile(el, p);
    seen.add(p.uid);
    const at = stage.children[i];
    if (at !== el) stage.insertBefore(el, at || null);
  });
  for (const [uid, el] of S.tiles) if (!seen.has(uid)) { el.remove(); S.tiles.delete(uid); }

  if (S.dialogPicker && $('picker-dialog').open) S.dialogPicker.setTaken(new Set(S.players.filter(p => p.uid !== auth.currentUser.uid).map(p => p.avatar)));

  const ready = S.players.filter(p => p.ready).length;
  $('player-count').textContent = S.players.length;
  $('ready-count').textContent = ready ? `· ${ready} ready` : '';

  const rb = $('ready-btn'), me = S.me;
  rb.disabled = !me;
  rb.classList.toggle('is-ready', !!(me && me.ready));
  rb.textContent = me && me.ready ? 'Waiting to start…' : "I'm ready";
  rb.setAttribute('aria-pressed', String(!!(me && me.ready)));
  rb.title = me && me.ready ? 'Click to mark yourself not ready' : '';
}

function paintSpeaking() {
  const mine = auth.currentUser && S.speaking.has(auth.currentUser.uid);
  $('mic-toggle').classList.toggle('talking', !!mine);
  S.tiles.forEach((el, uid) => el.classList.toggle('speaking', S.speaking.has(uid)));
}

async function toggleReady() {
  if (!S.me) return;
  $('ready-btn').disabled = true;
  try {
    await api('ready', { roomId: S.roomId, ready: !S.me.ready });
  } catch (e) {
    say('msg-lobby', e.message);
  }
  $('ready-btn').disabled = !S.me;
}

async function startGame() {
  const waiting = S.players.filter(p => !p.ready).length;
  if (waiting && !confirm(`${waiting} player${waiting === 1 ? ' is' : 's are'} not ready yet. Start anyway?`)) return;
  $('start-btn').disabled = true;
  say('msg-lobby', '');
  try {
    await api('start', { roomId: S.roomId, force: waiting > 0 });
  } catch (e) {
    say('msg-lobby', e.message);
  }
  $('start-btn').disabled = false;
}

async function kickPlayer(uid) {
  const p = S.players.find(x => x.uid === uid);
  if (!p || !confirm(`Remove ${p.name} from the room?`)) return;
  try {
    await api('kick', { roomId: S.roomId, uid });
  } catch (e) {
    toast(e.message);
  }
}

function openAvatarDialog() {
  const mine = S.me ? S.me.avatar : undefined;
  const taken = () => new Set(S.players.filter(p => p.uid !== auth.currentUser.uid).map(p => p.avatar));
  const box = $('dialog-picker');
  S.dialogPicker = createPicker(box, {
    taken: taken(), value: mine,
    onChange: async id => {
      try {
        await api('avatar', { roomId: S.roomId, avatar: id });
      } catch (e) {
        toast(e.message);
        if (S.me) S.dialogPicker.set(S.me.avatar);
      }
    }
  });
  const dlg = $('picker-dialog');
  if (!dlg.open) dlg.showModal();
}

/* ───────────────────────── voice ───────────────────────── */

function setMicUI(state) {
  const b = $('mic-toggle');
  b.classList.toggle('live', state === 'live');
  b.classList.toggle('muted', state === 'muted');
  if (state !== 'live') b.classList.remove('talking');
  $('mic-icon').innerHTML = state === 'live' ? ICON.mic : ICON.micOff;
  $('mic-text').textContent = state === 'live' ? 'Mic on' : state === 'muted' ? 'Muted' : 'Mic off';
  b.setAttribute('aria-pressed', String(state === 'live'));
  b.setAttribute('aria-label', state === 'live' ? 'Mute microphone' : state === 'muted' ? 'Unmute microphone' : 'Turn microphone on');
}

async function toggleMic() {
  if (!S.voice) return;
  try {
    await S.voice.toggle();
  } catch (e) {
    toast(e.message);
  }
}

async function stopVoice() {
  if (!S.voice || S.voice.state() === 'off') return;
  S.voice.stop();
  try { await api('voice', { roomId: S.roomId, on: false }); } catch (e) { /* best effort */ }
}

/* ───────────────────────── game ───────────────────────── */

function onQuestion(d) {
  const q = S.q;
  if (q.index !== d.currentQuestion) newQuestion(d);
  /* Reveal and winner can change while the same question is on screen. */
  paintWinner(d);
  if (typeof d.revealIndex === 'number') applyReveal(d.revealIndex);
  renderGameBar();
}

function newQuestion(d) {
  const pq = d.publicQuestion;
  if (!pq) return;
  Object.assign(S.q, {
    index: d.currentQuestion, start: ms(d.questionStartedAt), end: ms(d.deadlineAt),
    answered: false, picked: -1, result: null, timeUp: false, revealTries: 0
  });
  $('game-progress').textContent = `Question ${d.currentQuestion + 1} of ${d.questionCount}`;
  $('q-eyebrow').textContent = `Question ${d.currentQuestion + 1} · first correct answer wins ${POINTS} points`;
  $('q-text').textContent = pq.text;
  $('options').innerHTML = pq.options.map((o, i) => `<button type="button" class="opt" data-i="${i}" disabled><span class="shape">${'ABCD'[i]}</span><span class="txt">${esc(o.text)}</span></button>`).join('');
  const fb = $('feedback');
  fb.textContent = '';
  fb.className = 'feedback';
  $('winner-banner').hidden = true;
  $('countdown').hidden = true;
  const last = d.currentQuestion + 1 >= d.questionCount;
  $('next-btn').textContent = last ? 'Show results →' : 'Next question →';
  $('next-btn').disabled = true;
  clearInterval(S.tick);
  S.tick = setInterval(tickGame, 120);
  tickGame();
}

function tickGame() {
  const q = S.q, t = now();
  const untilStart = q.start - t;
  const opts = [...document.querySelectorAll('#options .opt')];
  const timer = $('timer-fill').parentElement;

  if (untilStart > 0) {
    const label = countdownLabel(untilStart);
    const c = $('countdown');
    if (c.dataset.n !== label) {
      c.dataset.n = label;
      c.hidden = false;
      c.classList.remove('tick');
      void c.offsetWidth;
      c.classList.add('tick');
      c.innerHTML = `<div><span>${label}</span><small>${q.index === 0 ? 'Get ready' : 'Next question'}</small></div>`;
    }
    $('timer-fill').style.transform = 'scaleX(1)';
    $('timer-text').textContent = `${Math.round((q.end - q.start) / 1000)}s`;
    timer.classList.remove('low', 'critical');
    return;
  }

  const c = $('countdown');
  if (!c.hidden) { c.hidden = true; c.dataset.n = ''; }
  const left = Math.max(0, q.end - t);
  const frac = timeFraction(t, q.start, q.end);
  $('timer-fill').style.transform = `scaleX(${frac})`;
  $('timer-text').textContent = `${Math.ceil(left / 1000)}s`;
  timer.classList.toggle('low', frac <= 0.4 && frac > 0.2);
  timer.classList.toggle('critical', frac <= 0.2);

  const open = left > 0 && !q.answered;
  opts.forEach(b => { if (!b.classList.contains('picked')) b.disabled = !open; });

  if (left <= 0 && !q.timeUp) onTimeUp();
}

function onTimeUp() {
  const q = S.q;
  q.timeUp = true;
  document.querySelectorAll('#options .opt').forEach(b => { b.disabled = true; });
  if (!q.answered) setFeedback("Time's up.", 'info');
  if (S.isHost) revealSoon();
}

/* The host's screen asks the server to reveal the right answer once the timer is over. */
async function revealSoon() {
  const q = S.q, index = q.index;
  while (S.view === 'game' && q.index === index && q.revealTries < 5) {
    q.revealTries++;
    await sleep(q.revealTries === 1 ? 500 : 1000);
    if (S.view !== 'game' || q.index !== index) return;
    try {
      await api('reveal', { roomId: S.roomId });
      break;
    } catch (e) { /* the server clock may be a moment behind ours; try again */ }
  }
  /* Never leave the host stuck: Next works even if the reveal could not be sent. */
  if (S.view === 'game' && q.index === index) $('next-btn').disabled = false;
}

function setFeedback(text, kind) {
  const fb = $('feedback');
  fb.textContent = text;
  fb.className = `feedback ${kind || ''}`;
}

async function pickOption(i) {
  const q = S.q;
  if (q.answered || q.timeUp || now() < q.start) return;
  q.answered = true;
  q.picked = i;
  document.querySelectorAll('#options .opt').forEach(b => {
    b.disabled = true;
    b.classList.toggle('picked', +b.dataset.i === i);
  });
  setFeedback('Answer locked in…', 'info');
  const index = q.index;
  try {
    const r = await api('answer', { roomId: S.roomId, questionIndex: index, option: i });
    if (q.index !== index) return;
    q.result = r;
    if (r.firstCorrect) setFeedback(`You were first and correct! +${r.scoreDelta} points`, 'ok');
    else if (r.correct) setFeedback('Correct, but someone was faster. No points this time.', 'info');
    else setFeedback('Not this one. The right answer shows when time is up.', 'bad');
  } catch (e) {
    if (q.index !== index) return;
    if (e.message === 'You already answered this question.') return setFeedback('Answer locked in.', 'info');
    q.answered = false;
    q.picked = -1;
    document.querySelectorAll('#options .opt').forEach(b => b.classList.remove('picked'));
    setFeedback(e.message, 'bad');
    tickGame();
  }
}

function applyReveal(right) {
  const q = S.q;
  const opts = [...document.querySelectorAll('#options .opt')];
  opts.forEach((b, i) => {
    b.disabled = true;
    b.classList.toggle('right', i === right);
    b.classList.toggle('wrong', i === q.picked && i !== right);
    b.classList.toggle('dim', i !== right && i !== q.picked);
  });
  if (!(q.result && q.result.correct)) {
    const text = opts[right] ? opts[right].querySelector('.txt').textContent : '';
    setFeedback(`The correct answer is ${'ABCD'[right]}: ${text}`, 'info');
  }
  if (S.isHost) $('next-btn').disabled = false;
}

function paintWinner(d) {
  const w = d.lastWinner, box = $('winner-banner');
  if (!w || w.questionIndex !== d.currentQuestion) { box.hidden = true; return; }
  const mine = w.uid === auth.currentUser.uid;
  box.innerHTML = `<span class="a">${avatarSvg(w.avatar, { still: true })}</span><span>${mine ? 'You were' : `${esc(w.name)} was`} first to answer correctly · +${POINTS} points</span>`;
  box.hidden = false;
}

function renderGameBar() {
  const ranked = rankPlayers(S.players).filter(p => (p.score || 0) > 0).slice(0, 3);
  $('top3').innerHTML = ranked.length
    ? ranked.map((p, i) => `<div class="t3"><span class="rk">${i + 1}</span><span class="a">${avatarSvg(p.avatar, { still: true })}</span><span class="who"><b>${esc(p.name)}</b><span>${p.score} pts</span></span></div>`).join('')
    : '<span class="chip">No points yet. Be the first!</span>';
  const me = S.me;
  $('me-box').innerHTML = me
    ? `<span class="a">${avatarSvg(me.avatar, { still: true })}</span><span class="who"><b>${me.score || 0}</b><span>your points</span></span>`
    : '';
}

async function hostNext() {
  $('next-btn').disabled = true;
  try {
    await api('advance', { roomId: S.roomId });
  } catch (e) {
    toast(e.message);
    $('next-btn').disabled = false;
  }
}

async function hostEnd() {
  if (!confirm('End the game now and show the results?')) return;
  try {
    await api('finish', { roomId: S.roomId });
  } catch (e) {
    toast(e.message);
  }
}

/* ───────────────────────── results ───────────────────────── */

function showResults() {
  show('results');
  stopVoice();
  renderResults();
  confetti();
}

function renderResults() {
  const ranked = rankPlayers(S.players);
  const top = ranked[0];
  $('winner-line').textContent = !top ? 'Game over' : (top.score || 0) > 0 ? `${top.name} wins with ${top.score} points!` : 'Game over. Nobody scored this time.';

  const order = [[1, 'second'], [0, 'first'], [2, 'third']];
  $('podium').innerHTML = order.filter(([i]) => ranked[i]).map(([i, cls]) => {
    const p = ranked[i];
    return `<div class="pod ${cls}"><div class="av">${avatarSvg(p.avatar)}</div><b>${esc(p.name)}</b><span>${p.score || 0} points</span><div class="block">${i + 1}</div></div>`;
  }).join('');

  const myUid = auth.currentUser.uid;
  $('board').innerHTML = ranked.map((p, i) => `<tr class="${p.uid === myUid ? 'mine' : ''}"><td class="rank">${i + 1}</td><td><span class="who-cell"><span class="a">${avatarSvg(p.avatar, { still: true })}</span>${esc(p.name)}${p.uid === myUid ? ' (you)' : ''}</span></td><td class="num">${p.score || 0}</td><td class="num">${p.correct || 0}</td><td class="num">${p.wrong || 0}</td><td class="num">${p.answered || 0}</td><td class="num">${accuracy(p)}%</td></tr>`).join('');
  $('results-note').textContent = 'Ties are broken by more correct answers, then by faster average answers.';
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const host = document.querySelector('.results-head');
  const colors = ['#e08a1e', '#0f8f78', '#1d4ed8', '#c62828', '#8b5cf6', '#157f3b'];
  for (let i = 0; i < 44; i++) {
    const c = document.createElement('i');
    c.className = 'conf';
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = `${2.4 + Math.random() * 2.4}s`;
    c.style.animationDelay = `${Math.random() * 0.8}s`;
    host.appendChild(c);
    setTimeout(() => c.remove(), 6000);
  }
}

/* ───────────────────────── start-up and events ───────────────────────── */

function bindEvents() {
  document.querySelectorAll('#levels .level').forEach(b => b.addEventListener('click', () => {
    S.level = b.dataset.level;
    document.querySelectorAll('#levels .level').forEach(x => {
      x.classList.toggle('on', x === b);
      x.setAttribute('aria-checked', String(x === b));
    });
  }));
  $('generate').addEventListener('click', startGeneration);
  $('docs').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addFiles(e.dataTransfer && e.dataTransfer.files));
  $('doc-list').addEventListener('click', e => {
    const x = e.target.closest('.doc-x');
    if (!x || x.disabled) return;
    const id = +x.closest('.docitem').dataset.id;
    S.docs = S.docs.filter(d => d.id !== id);
    renderDocs();
  });
  $('use-rec').addEventListener('click', () => { $('count').value = String(recommendedCount(sourceText().length)); S.countTouched = true; renderDocs(); });
  $('count').addEventListener('input', () => { S.countTouched = true; renderDocs(); });
  $('gen-stop').addEventListener('click', pauseGeneration);
  $('gen-continue').addEventListener('click', runGeneration);
  $('to-room').addEventListener('click', openRoomStep);
  $('back-setup').addEventListener('click', () => show('setup'));
  $('random-pin').addEventListener('click', () => { $('pin').value = randomPin(); });
  $('pin').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
  $('join-pin').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
  $('host-btn').addEventListener('click', hostRoom);
  $('copy-link-1').addEventListener('click', () => copyText(S.link));
  $('copy-link-2').addEventListener('click', () => copyText(S.link));
  $('to-lobby').addEventListener('click', () => enterRoom(S.roomId));
  $('join-btn').addEventListener('click', joinRoom);
  $('ready-btn').addEventListener('click', toggleReady);
  $('start-btn').addEventListener('click', startGame);
  $('change-avatar').addEventListener('click', openAvatarDialog);
  $('picker-close').addEventListener('click', () => $('picker-dialog').close());
  $('stage').addEventListener('click', e => {
    const k = e.target.closest('.kick');
    if (k) kickPlayer(k.closest('.pl').dataset.uid);
  });
  $('options').addEventListener('click', e => {
    const b = e.target.closest('.opt');
    if (b && !b.disabled) pickOption(+b.dataset.i);
  });
  $('next-btn').addEventListener('click', hostNext);
  $('end-btn').addEventListener('click', hostEnd);
  $('mic-toggle').addEventListener('click', toggleMic);

  /* Keep the room tidy when someone closes the tab: free their avatar, seat and mic slot. */
  window.addEventListener('pagehide', e => {
    if (e.persisted || !S.roomId || !S.token) return;
    const post = body => {
      try {
        fetch(API_URL, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${S.token}` }, body: JSON.stringify(body) });
      } catch (err) { /* best effort */ }
    };
    if (S.voice && S.voice.state() !== 'off') post({ action: 'voice', roomId: S.roomId, on: false });
    if (!S.isHost && S.room && S.room.phase === 'lobby') post({ action: 'leave', roomId: S.roomId });
    if (S.voice) S.voice.stop();
  });
}

let booted = false;
onAuthStateChanged(auth, async user => {
  if (booted) return;
  booted = true;
  bindEvents();
  const params = new URLSearchParams(location.search);
  const rid = (params.get('room') || '').toUpperCase();
  if (rid) return bootPlayer(rid, params.get('pin'));
  show('setup');
  if (!user) {
    const problem = await ensureSignedIn();
    if (problem) say('msg-setup', problem);
  } else if (!user.isAnonymous && user.displayName && !$('host-name').value) {
    $('host-name').value = user.displayName.slice(0, 35);
  }
});
