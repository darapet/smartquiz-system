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

test('public Challenge questions recursively remove answer metadata', () => {
  assert.match(backend, /function stripAnswerMetadata\(value\)/);
  assert.match(backend, /correct_answer_index/);
  assert.match(backend, /correct_idx/);
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
