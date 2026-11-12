/* Pure helpers for the live multiplayer page (no DOM, no Firebase), so they can be unit tested. */

export const LIMITS = Object.freeze({ maxQuestions: 1500, maxPlayers: 200, minSeconds: 5, maxSeconds: 120, batchSize: 15 });

export const DIFFICULTY_GUIDE = Object.freeze({
  Easy: 'Easy: basic recall of core facts and definitions. Short, clear wording. Wrong options are clearly different from the right one.',
  Hard: 'Hard: apply ideas to new situations and compare related concepts. Wrong options are plausible to someone who studied.',
  Harder: 'Harder: multi-step reasoning, subtle distinctions, and common misconceptions. Wrong options are very plausible.',
  Professional: 'Professional: expert-level, exam or industry standard. Nuanced scenarios, edge cases, and precise terminology. Distractors reflect real expert-level confusions.'
});

export function buildPrompt({ topic, difficulty, count, avoid = [], batch = 1 }) {
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

/* Pulls a JSON array out of a model reply, even when it is wrapped in code fences or chatter. */
export function extractJsonArray(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const start = t.indexOf('['), end = t.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('The AI reply did not contain a question list.');
  t = t.slice(start, end + 1);
  try {
    return JSON.parse(t);
  } catch (e) {
    /* Common model slip: trailing commas. */
    return JSON.parse(t.replace(/,\s*([\]}])/g, '$1'));
  }
}

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* Turns raw model items into room questions. Invalid and duplicate items are dropped.
   `random` can be injected so tests are deterministic. */
export function normalizeQuestions(items, existing = [], random = Math.random) {
  const seen = new Set(existing.map(q => norm(q.text)));
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    const text = String((item && (item.q ?? item.question)) ?? '').trim();
    const raw = Array.isArray(item && item.options) ? item.options.map(o => String(o ?? '').replace(/^\s*[A-Da-d][).:]\s+/, '').trim()) : [];
    const answer = Number(item && (item.answer ?? item.correct));
    if (!text || raw.length !== 4 || raw.some(o => !o) || !Number.isInteger(answer) || answer < 0 || answer > 3) continue;
    if (new Set(raw.map(norm)).size !== 4) continue;
    const key = norm(text);
    if (seen.has(key)) continue;
    seen.add(key);
    const options = raw.map((o, i) => ({ text: o.slice(0, 200), correct: i === answer }));
    /* Shuffle so the right answer is not always in the same slot. */
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    out.push({ text: text.slice(0, 600), options });
  }
  return out;
}

export function validateSetup({ title, seconds, count, prompt, hasSource = false }) {
  if (!String(title).trim()) return 'Give your quiz a name.';
  if (!Number.isInteger(seconds) || seconds < LIMITS.minSeconds || seconds > LIMITS.maxSeconds) return 'Time per question must be 5 to 120 seconds.';
  if (!Number.isInteger(count) || count < 1 || count > LIMITS.maxQuestions) return 'Number of questions must be between 1 and 1,500.';
  if (!hasSource && String(prompt).trim().length < 3) return 'Tell the AI what the questions should be about, or add a file.';
  return '';
}

export function validateRoomSettings({ capacity, pin }) {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > LIMITS.maxPlayers) return 'Maximum players must be between 1 and 200.';
  if (!/^\d{4}$/.test(String(pin))) return 'Enter a four-digit PIN.';
  return '';
}

/* Highest score first; ties go to more correct answers, then faster average answers. */
export function rankPlayers(players) {
  const avg = p => (p.answered > 0 ? (p.totalLatency || 0) / p.answered : Infinity);
  return players.slice().sort((a, b) =>
    (b.score || 0) - (a.score || 0) ||
    (b.correct || 0) - (a.correct || 0) ||
    avg(a) - avg(b) ||
    String(a.name || '').localeCompare(String(b.name || '')));
}

export const accuracy = p => (p.answered > 0 ? Math.round(((p.correct || 0) / p.answered) * 100) : 0);

export function countdownLabel(msUntilStart) {
  if (msUntilStart <= 0) return '';
  return String(Math.min(3, Math.ceil(msUntilStart / 1000)));
}

/* Fraction of the timer left, for the progress bar. */
export function timeFraction(nowMs, startMs, deadlineMs) {
  if (deadlineMs <= startMs) return 0;
  return Math.min(1, Math.max(0, (deadlineMs - nowMs) / (deadlineMs - startMs)));
}

export function randomPin(random = Math.random) {
  return String(1000 + Math.floor(random() * 9000));
}

/* ───────── study material: cleaning, splitting, and planning so nothing is left out ───────── */

export const SOURCE = Object.freeze({
  /* The server accepts up to 32,000 characters per request; stay under it. */
  maxUnitChars: 24000,
  chunkChars: 5000,
  charsPerQuestion: 450,
  maxTotalChars: 800000
});

export function cleanText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u00AD\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t\u00A0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* Splits text into pieces of at most `max` characters, at paragraph, then sentence, then word breaks.
   Joining the pieces gives back all of the text (only whitespace at the cut points is dropped). */
export function splitIntoChunks(text, max = SOURCE.chunkChars) {
  const t = cleanText(text);
  if (!t) return [];
  const pieces = [];
  const pushLong = para => {
    let rest = para;
    while (rest.length > max) {
      let cut = Math.max(rest.lastIndexOf('. ', max), rest.lastIndexOf('? ', max), rest.lastIndexOf('! ', max), rest.lastIndexOf('\n', max));
      if (cut < max * 0.4) cut = rest.lastIndexOf(' ', max);
      if (cut < max * 0.4) cut = max - 1;
      pieces.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) pieces.push(rest);
  };
  for (const para of t.split(/\n{2,}/)) {
    if (para.length <= max) pieces.push(para);
    else pushLong(para);
  }
  /* Pack neighbouring pieces together up to `max`. */
  const chunks = [];
  let cur = '';
  for (const piece of pieces) {
    if (!piece) continue;
    if (cur && cur.length + piece.length + 2 > max) { chunks.push(cur); cur = piece; }
    else cur = cur ? `${cur}\n\n${piece}` : piece;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/* About how many questions it takes to cover the material (1 per ~450 characters). */
export function recommendedCount(chars) {
  if (!chars) return 0;
  return Math.min(LIMITS.maxQuestions, Math.max(1, Math.ceil(chars / SOURCE.charsPerQuestion)));
}

/* Plans which part of the material each question comes from.
   Returns units of { text, count }. Every character of the material lands in exactly one unit,
   and the counts add up to `count`, so no section is skipped even when few questions are asked. */
export function planUnits(text, count) {
  const chunks = splitIntoChunks(text);
  if (!chunks.length) return [];
  const total = chunks.reduce((n, c) => n + c.length, 0);
  /* Fewer questions than chunks: merge neighbouring chunks into `count` groups of similar size. */
  let groups = chunks;
  if (chunks.length > count) {
    groups = [];
    const target = total / count;
    let cur = '';
    chunks.forEach((c, i) => {
      cur = cur ? `${cur}\n\n${c}` : c;
      const left = chunks.length - i - 1, slotsLeft = count - groups.length - 1;
      if (slotsLeft > 0 && (cur.length >= target || left <= slotsLeft)) { groups.push(cur); cur = ''; }
    });
    if (cur) groups.push(cur);
  }
  /* Give each group at least one question, share the rest by length (largest remainder). */
  const n = groups.length;
  const extra = count - n;
  const len = groups.map(g => g.length);
  const sum = len.reduce((a, b) => a + b, 0);
  const raw = len.map(l => (l / sum) * extra);
  const counts = raw.map(r => 1 + Math.floor(r));
  let left = count - counts.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { counts[i]++; left--; } });
  return groups.map((g, i) => ({ text: g, count: counts[i] }));
}

/* The fewest questions that still let one request carry every part of the material. */
export function minCountToCover(chars) {
  return Math.max(1, Math.ceil(chars / SOURCE.maxUnitChars));
}

export function shuffled(list, random = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
