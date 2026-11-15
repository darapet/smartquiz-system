'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const backend = fs.readFileSync(path.join(root, 'functions/challenge-functions.js'), 'utf8');
const challengeCss = fs.readFileSync(path.join(root, 'css/aqs-challenge.css'), 'utf8');
const mobileCss = fs.readFileSync(path.join(root, 'daraquiz-mobile/www/css/aqs-challenge.css'), 'utf8');
const challengeHtml = fs.readFileSync(path.join(root, 'challenge.html'), 'utf8');
const mobileHtml = fs.readFileSync(path.join(root, 'daraquiz-mobile/www/challenge.html'), 'utf8');
const challengeJs = fs.readFileSync(path.join(root, 'js/aqs-challenge.js'), 'utf8');
const mobileJs = fs.readFileSync(path.join(root, 'daraquiz-mobile/www/js/aqs-challenge.js'), 'utf8');

test('public Challenge questions recursively remove answer metadata', () => {
  assert.match(backend, /function stripAnswerMetadata\(value\)/);
  assert.match(backend, /correct_answer_index/);
  assert.match(backend, /correct_idx/);
  assert.match(backend, /'correct',/);
  assert.match(backend, /safeQuestion = stripAnswerMetadata\(q\)/);
});

test('a previous answer result is not exposed while a new turn is active', () => {
  assert.match(backend, /last_result: ch\.phase === 'reveal' \? \(ch\.last_result \|\| null\) : null/);
});

test('polling requires a valid room player token', () => {
  assert.match(backend, /if \(!getPlayer\(polledRoom, token\)\) fail\('Join this challenge before viewing its live state\.', 403\)/);
});

test('skill activation advances expired turns before granting a time boost', () => {
  const start = backend.indexOf("if (action === 'aqs_ch_skill_activate')");
  const end = backend.indexOf("if (action === 'aqs_ch_answer')", start);
  const block = backend.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /progressRoom\(ch, now\)/);
  assert.match(block, /elapsedBeforeSkill >=/);
});

test('Viper effect identifier matches the browser skill identifier', () => {
  assert.match(backend, /viper: 'doublesteal'/);
  assert.match(backend, /effect === 'doublesteal'/);
  assert.match(backend, /effect === 'doublesteal' && !ch\.steal_mode/);
});

test('50/50 resolves the question owner during a steal turn', () => {
  assert.match(backend, /const questionOwner = ch\.steal_mode \? Number\(ch\.steal_of_pos\) : pos/);
  assert.match(backend, /questionFor\(ch, questionOwner\)/);
});

test('play-again clears stale League transition state', () => {
  assert.match(backend, /finish_after_league_transition = false/);
  assert.match(backend, /ch\.league_active_players = ch\.league_mode/);
  assert.match(backend, /ch\.pending_stealer = null/);
});

test('browser and Android Challenge styling remain identical and use the system theme', () => {
  assert.equal(challengeCss, mobileCss);
  assert.match(challengeCss, /CHALLENGE ACCESSIBILITY \+ SYSTEM CREAM THEME/);
  assert.match(challengeCss, /--ch-text:#12304a/);
  assert.match(challengeCss, /\.aqs-ch-option[\s\S]*?color:#12304a !important/);
});

test('browser and Android Challenge pages preserve user zoom and safe areas', () => {
  assert.equal(challengeHtml, mobileHtml);
  assert.match(challengeHtml, /viewport-fit=cover/);
  assert.doesNotMatch(challengeHtml, /maximum-scale=1/);
});

test('browser and Android Challenge scripts stay identical and do not trust question HTML', () => {
  assert.equal(challengeJs, mobileJs);
  assert.match(challengeJs, /trust:false/);
  assert.doesNotMatch(challengeJs, /trust:true/);
});

test('Challenge creation validates question shape and requires a valid correct option', () => {
  assert.match(backend, /function validateQuestions\(questions\)/);
  assert.match(backend, /questions = validateQuestions\(questions\)/);
  assert.match(backend, /correct >= options\.length/);
  assert.match(backend, /answerIdx >= \(Array\.isArray\(q\.options\)/);
});

test('manual Challenge questions cannot be added without marking the correct answer', () => {
  assert.match(challengeJs, /if\(correctIdx<0\).*Mark the correct answer/s);
  assert.match(mobileJs, /if\(correctIdx<0\).*Mark the correct answer/s);
});

test('Challenge chat and voice endpoints enforce per-player rate limits', () => {
  assert.match(backend, /async function enforceRateLimit\(ref, limit, windowMs, now\)/);
  assert.match(backend, /Too many requests\. Please wait a moment and try again\.', 429/);
  assert.match(backend, /rate_limits\/' \+ player\.position \+ '\/chat/);
  assert.match(backend, /rate_limits\/' \+ pos \+ '\/voice_push/);
  assert.match(backend, /rate_limits\/' \+ player\.position \+ '\/voice_poll/);
});

test('Challenge chat history and voice chunks are stored in bounded queues', () => {
  assert.match(backend, /\.slice\(-100\)/);
  assert.match(backend, /queue\.slice\(-30\)/);
  assert.match(backend, /chunks\.sort\(\(a, b\) => a\.ts - b\.ts\)/);
});

test('Challenge chat uses the browser payload shape and preserves sliding-window updates', () => {
  assert.match(backend, /name: player\.player_name, msg: message, ts: entryTs/);
  assert.match(backend, /name: String\(message\.name \|\| message\.player_name/);
  assert.match(backend, /msg: String\(message\.msg \|\| message\.message/);
  assert.match(challengeJs, /chatSeenTs/);
  assert.match(challengeJs, /Number\(m\.ts\)>lastSeen/);
  assert.equal(challengeJs, mobileJs);
});

test('Viper receives a clear explanation when used outside a steal turn', () => {
  assert.match(backend, /Viper Strike can only be activated during a steal turn/);
});

test('League ties use primary-turn accuracy and average response time before seeded fallback', () => {
  assert.match(backend, /const tiedLowest = active\.filter/);
  assert.match(backend, /const leastCorrect = Math\.min/);
  assert.match(backend, /const slowestAverage = Math\.max/);
  assert.match(backend, /tie_break_seed/);
  assert.match(backend, /if \(!stealing\) \{/);
  assert.match(backend, /if \(!ch\.steal_mode\) \{/);
});

test('League statistics and tie-break seed reset for a replay', () => {
  assert.match(backend, /ch\.player_stats\[p\.position\] = \{ correct: 0, answered: 0, total_time_ms: 0 \}/);
  assert.match(backend, /ch\.tie_break_seed = require\('crypto'\)\.randomBytes\(16\)/);
});

test('Challenge score configuration agrees with the server steal award', () => {
  assert.match(challengeHtml, /steal_score: 3/);
  assert.match(mobileHtml, /steal_score: 3/);
  assert.match(backend, /stealing \? \(useDoubleSteal \? 6 : 3\)/);
});
