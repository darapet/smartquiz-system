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
  ['Incorrect room PIN.', 403],
  ['Room not found.', 404],
  ['Player not found.', 404],
  ['Room is closed or full.', 409],
  ['Room state changed; try again.', 409],
  ['Avatar already taken.', 409],
  ['Voice chat is full right now.', 409],
  ['You already answered this question.', 409],
  ['Too many requests. Please wait a while and try again.', 429],
  ['AI is not set up yet. The site owner needs to add AI keys in Admin Settings.', 503],
  ['The AI service is busy or unavailable right now. Wait a minute, then press Continue.', 503]
]);

/* ── Server-side AI question writing ───────────────────────────────────────
   Hosts do not need an account, so the AI keys stay on the server and the browser
   only sends the topic. Every call is validated and rate limited per user. */

const DIFFICULTY_GUIDE = Object.freeze({
  Easy: 'Easy: basic recall of core facts and definitions. Short, clear wording. Wrong options are clearly different from the right one.',
  Hard: 'Hard: apply ideas to new situations and compare related concepts. Wrong options are plausible to someone who studied.',
  Harder: 'Harder: multi-step reasoning, subtle distinctions, and common misconceptions. Wrong options are very plausible.',
  Professional: 'Professional: expert-level, exam or industry standard. Nuanced scenarios, edge cases, and precise terminology. Distractors reflect real expert-level confusions.'
});

const AI_LIMITS = Object.freeze({ maxTopic: 1500, maxCount: 20, maxAvoid: 30, maxAvoidChars: 240, maxBatch: 200 });

function validateGenerate(body) {
  const b = body && typeof body === 'object' ? body : {};
  const topic = String(b.topic || '').replace(/\s+/g, ' ').trim();
  if (topic.length < 3) throw new Error('Describe what the questions should be about.');
  if (topic.length > AI_LIMITS.maxTopic) throw new Error(`The topic must be ${AI_LIMITS.maxTopic} characters or fewer.`);
  if (!DIFFICULTIES.includes(b.difficulty)) throw new Error('Choose a difficulty level.');
  const count = Number(b.count);
  if (!Number.isInteger(count) || count < 1 || count > AI_LIMITS.maxCount) throw new Error(`Ask for 1 to ${AI_LIMITS.maxCount} questions at a time.`);
  const batch = Number.isInteger(Number(b.batch)) ? Math.min(AI_LIMITS.maxBatch, Math.max(1, Number(b.batch))) : 1;
  const avoid = (Array.isArray(b.avoid) ? b.avoid : []).slice(-AI_LIMITS.maxAvoid)
    .map(x => String(x || '').replace(/\s+/g, ' ').trim().slice(0, AI_LIMITS.maxAvoidChars)).filter(Boolean);
  return { topic, difficulty: b.difficulty, count, batch, avoid };
}

function buildQuizPrompt({ topic, difficulty, count, avoid = [], batch = 1 }) {
  const guide = DIFFICULTY_GUIDE[difficulty] || DIFFICULTY_GUIDE.Easy;
  const avoidText = avoid.length
    ? `\nDo NOT repeat or rephrase any of these existing questions:\n${avoid.map(q => `- ${q}`).join('\n')}\n`
    : '';
  return `Write exactly ${count} multiple-choice quiz questions about: ${topic}

Difficulty: ${guide}
This is batch ${batch}. Cover a different sub-topic or angle than earlier batches.${avoidText}
Rules:
- Each question has exactly 4 answer options and exactly 1 correct option.
- Plain text only. No markdown. Write math in plain text (for example x^2 or sqrt(9)).
- Keep each question under 220 characters and each option under 100 characters.
- Do not put letters like "A)" in the options.

Return ONLY a raw JSON array, nothing else. Format:
[{"q":"Question text","options":["Option 1","Option 2","Option 3","Option 4"],"answer":0}]
"answer" is the index (0 to 3) of the correct option.`;
}

/* Groq retired these in 2026; an old admin setting must not send requests to them. */
const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-20b';
const GROQ_RETIRED = Object.freeze({
  'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
  'llama3-8b-8192': 'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
  'llama3-70b-8192': 'openai/gpt-oss-120b',
  'mixtral-8x7b-32768': 'openai/gpt-oss-20b',
  'gemma2-9b-it': 'openai/gpt-oss-20b',
  'gemma-7b-it': 'openai/gpt-oss-20b',
  'llama-3.1-70b-versatile': 'openai/gpt-oss-120b',
  'llama-3.3-70b-specdec': 'openai/gpt-oss-120b',
  'llama-3.2-1b-preview': 'openai/gpt-oss-20b',
  'llama-3.2-3b-preview': 'openai/gpt-oss-20b',
  'llama-3.2-11b-vision-preview': 'openai/gpt-oss-120b',
  'llama-3.2-90b-vision-preview': 'openai/gpt-oss-120b',
  'qwen/qwen3-32b': 'openai/gpt-oss-120b',
  'moonshotai/kimi-k2-instruct-0905': 'openai/gpt-oss-120b',
  'meta-llama/llama-4-scout-17b-16e-instruct': 'openai/gpt-oss-120b',
  'meta-llama/llama-4-maverick-17b-128e-instruct': 'openai/gpt-oss-120b'
});
const groqModelFor = model => GROQ_RETIRED[String(model || '').trim()] || String(model || '').trim() || GROQ_DEFAULT_MODEL;

/* Admin Settings stores key pools as arrays of strings. Quiz keys first, then the shared pool. */
function collectKeys(settings, fields) {
  const seen = new Set(), out = [];
  for (const f of fields) {
    for (const raw of Array.isArray(settings && settings[f]) ? settings[f] : []) {
      const k = String(raw || '').replace(/[^\x20-\x7E]/g, '').trim();
      if (k.length > 20 && !seen.has(k)) { seen.add(k); out.push(k); }
    }
  }
  return out;
}

/* Fixed-window rate limit. Returns the next stored state, or ok:false when the limit is used up. */
function nextQuota(state, nowMs, limit, windowMs) {
  let start = Number(state && state.start) || 0, count = Number(state && state.count) || 0;
  if (!start || nowMs - start >= windowMs) { start = nowMs; count = 0; }
  if (count >= limit) return { ok: false, start, count };
  return { ok: true, start, count: count + 1 };
}

function errorStatus(error) {
  return STATUS.get(String(error && error.message || '')) || 400;
}

module.exports = {
  LIMITS, DIFFICULTIES, validateAvatar, validateRoom, shardQuestions, shardIndex, shardOffset,
  publicQuestion, correctIndex, answerOutcome, answerWindow, rankPlayers, errorStatus,
  AI_LIMITS, validateGenerate, buildQuizPrompt, groqModelFor, collectKeys, nextQuota, GROQ_DEFAULT_MODEL
};
