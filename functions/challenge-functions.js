'use strict';

const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');

const db = admin.database();
const ALLOWED_ACTIONS = new Set([
  'aqs_ch_create', 'aqs_ch_join', 'aqs_ch_start', 'aqs_ch_poll',
  'aqs_ch_answer', 'aqs_ch_skill_activate', 'aqs_ch_play_again', 'aqs_ch_chat',
  'aqs_ch_update_settings', 'aqs_ch_voice_push', 'aqs_ch_voice_poll',
]);

function cleanPlayers(players) {
  return Object.values(players || {}).map((p) => {
    const copy = { ...p };
    delete copy.player_token;
    return copy;
  });
}
function list(value) {
  if (Array.isArray(value)) return value;
  return value && typeof value === 'object' ? Object.values(value) : [];
}
function activePositions(ch) {
  if (ch.league_mode && ch.league_active_players) {
    return list(ch.league_active_players).map(Number);
  }
  return Array.from({ length: Number(ch.num_players) || 2 }, (_, i) => i);
}
function questionFor(ch, owner) {
  const pools = ch.player_questions || {};
  const pool = list(pools[owner] || pools[String(owner)]);
  const index = ((Number(ch.q_in_round) || 1) - 1)
    + ((Number(ch.round) || 1) - 1) * (Number(ch.questions_per_round) || 5);
  return ch.current_question || pool[index] || null;
}
function nextPrimary(ch) {
  const active = activePositions(ch);
  const answers = ch.answers_this_q || {};
  const done = new Set(Object.keys(answers)
    .filter((key) => answers[key] && !answers[key].is_steal)
    .map(Number));
  if (active.every((pos) => done.has(pos))) return { advance: true };
  const current = active.indexOf(Number(ch.active_pos) || 0);
  for (let step = 1; step <= active.length; step += 1) {
    const candidate = active[(Math.max(current, 0) + step) % active.length];
    if (!done.has(candidate)) return { advance: false, next: candidate };
  }
  return { advance: true };
}
function advanceQuestion(ch, now) {
  let round = Number(ch.round) || 1;
  let q = (Number(ch.q_in_round) || 1) + 1;
  const qpr = Number(ch.questions_per_round) || 5;
  if (q > qpr) { q = 1; round += 1; }
  const active = activePositions(ch);
  if (round > (Number(ch.total_rounds) || Number(ch.num_rounds) || 1)) {
    if (ch.league_mode && active.length > 1) {
      const scores = ch.scores || {};
      const lowest = Math.min(...active.map((p) => Number(scores[p]) || 0));
      const eliminated = active.filter((p) => (Number(scores[p]) || 0) === lowest).slice(-1)[0];
      const players = list(ch.players);
      const player = players.find((p) => Number(p.position) === eliminated);
      const remaining = active.filter((p) => p !== eliminated);
      ch.phase = 'league_elimination';
      ch.league_eliminated_pos = eliminated;
      ch.league_eliminated_name = player ? player.player_name : 'Player ' + (eliminated + 1);
      ch.league_eliminated_char = player ? (player.character_id || 'koda') : 'koda';
      ch.league_active_players = remaining;
      ch.league_round = (Number(ch.league_round) || 1) + 1;
      ch.league_transition_at = now;
      if (remaining.length <= 1) ch.finish_after_league_transition = true;
      else ch.next_league_round = round;
      return;
    }
    ch.status = 'finished';
    ch.phase = 'finished';
    ch.finished_at = now;
    return;
  }
  const first = ch.league_mode ? (active[0] || 0) : 0;
  ch.phase = 'active';
  ch.round = round;
  ch.q_in_round = q;
  ch.attempt_idx = (Number(ch.attempt_idx) || 0) + 1;
  ch.answers_this_q = {};
  ch.active_pos = first;
  ch.primary_pos = first;
  ch.steal_mode = false;
  ch.steal_of_pos = null;
  ch.question_started_at = now;
  ch.reveal_started_at = null;
  ch.last_result = null;
}
function progressRoom(ch, now) {
  if (ch.status !== 'active') return;
  if (ch.phase === 'active') {
    const started = Number(ch.question_started_at) || now;
    const elapsed = (now - started) / 1000;
    const pos = Number(ch.active_pos) || 0;
    const activeSkill = (ch.skill_effects || {})[pos] || {};
    if (elapsed >= (Number(ch.time_per_question) || 30) + (Number(activeSkill.extraTime) || 0)) {
      const answers = ch.answers_this_q || {};
      if (!answers[pos]) {
        ch.answers_this_q = { ...answers, [pos]: {
          answer_idx: -1, is_correct: false, time_ms: elapsed * 1000,
          is_steal: !!ch.steal_mode, pts: 0,
        } };
        const effects = { ...(ch.skill_effects || {}) };
        if (effects[pos] && !effects[pos].doubleSteal) delete effects[pos];
        ch.skill_effects = effects;
        ch.phase = 'reveal';
        ch.steal_mode = false;
        ch.steal_of_pos = null;
        ch.reveal_started_at = now;
        ch.last_result = {
          player_pos: pos, winner_pos: -1, is_correct: false,
          answer_idx: -1, correct_idx: -1, pts: 0,
          skipped: true, steal_offered: false,
        };
      }
    }
  } else if (ch.phase === 'reveal' && now - (Number(ch.reveal_started_at) || now) >= 2000) {
    if (ch.last_result && ch.last_result.steal_offered && Number.isInteger(Number(ch.pending_stealer))) {
      ch.phase = 'active';
      ch.active_pos = Number(ch.pending_stealer);
      ch.attempt_idx = (Number(ch.attempt_idx) || 0) + 1;
      ch.question_started_at = now;
      ch.steal_mode = true;
      ch.steal_of_pos = Number(ch.last_result.player_pos);
      ch.pending_stealer = null;
      ch.reveal_started_at = null;
    } else {
      const next = nextPrimary(ch);
      if (next.advance) advanceQuestion(ch, now);
      else {
        ch.phase = 'active';
        ch.active_pos = next.next;
        ch.primary_pos = next.next;
        ch.attempt_idx = (Number(ch.attempt_idx) || 0) + 1;
        ch.question_started_at = now;
        ch.steal_mode = false;
        ch.steal_of_pos = null;
        ch.reveal_started_at = null;
        ch.last_result = null;
      }
    }
  } else if (ch.phase === 'league_elimination'
      && now - (Number(ch.league_transition_at) || now) >= 7000) {
    if (ch.finish_after_league_transition || list(ch.league_active_players).length <= 1) {
      ch.status = 'finished';
      ch.phase = 'finished';
      ch.finished_at = now;
    } else {
      const first = list(ch.league_active_players)[0] || 0;
      const nextRound = Number(ch.next_league_round) || ((Number(ch.total_rounds) || 1) + 1);
      ch.phase = 'active';
      ch.round = nextRound;
      ch.total_rounds = nextRound;
      ch.q_in_round = 1;
      ch.attempt_idx = (Number(ch.attempt_idx) || 0) + 1;
      ch.answers_this_q = {};
      ch.active_pos = first;
      ch.primary_pos = first;
      ch.steal_mode = false;
      ch.steal_of_pos = null;
      ch.question_started_at = now;
      ch.last_result = null;
      ch.league_transition_at = null;
      ch.next_league_round = null;
    }
  }
}
function stripAnswerMetadata(value) {
  if (Array.isArray(value)) return value.map(stripAnswerMetadata);
  if (!value || typeof value !== 'object') return value;
  const blocked = new Set(['correct_answer_index', 'correct_idx', 'correctIndex', 'correct_answer', 'correctAnswer', 'answer', 'answer_index', 'is_correct', 'isCorrect', 'explanation']);
  return Object.keys(value).reduce((safe, key) => {
    if (!blocked.has(key)) safe[key] = stripAnswerMetadata(value[key]);
    return safe;
  }, {});
}
function publicState(ch, code, now, viewerToken) {
  const owner = Number(ch.steal_mode ? ch.steal_of_pos : ch.primary_pos) || 0;
  const q = questionFor(ch, owner);
  let safeQuestion = null;
  if (q) {
    safeQuestion = stripAnswerMetadata(q);
    delete safeQuestion.correct_answer_index;
    delete safeQuestion.explanation;
    delete safeQuestion.answer;
    delete safeQuestion.correct_answer;
  }
  const players = cleanPlayers(ch.players);
  const viewer = getPlayer(ch, viewerToken);
  const viewerPos = viewer ? Number(viewer.position) : -1;
  return {
    code, status: ch.status, phase: ch.phase,
    round: ch.round || 1, attempt_idx: ch.attempt_idx || 0,
    q_in_round: ch.q_in_round || 1, num_players: ch.num_players,
    num_rounds: ch.num_rounds, num_questions: ch.num_questions,
    questions_per_round: ch.questions_per_round,
    time_per_question: ch.time_per_question, total_rounds: ch.total_rounds || ch.num_rounds,
    title: ch.title, host_name: (players.find((p) => p.is_host) || {}).player_name || 'Host',
    players, scores: ch.scores || {}, question: safeQuestion,
    active_pos: ch.active_pos === undefined ? 0 : ch.active_pos,
    primary_pos: ch.primary_pos === undefined ? 0 : ch.primary_pos,
    steal_mode: !!ch.steal_mode, steal_of_pos: ch.steal_of_pos ?? null,
    answers_this_q: ch.answers_this_q || {}, last_result: ch.phase === 'reveal' ? (ch.last_result || null) : null,
    current_question: safeQuestion,
    reveal_answer: ch.phase === 'reveal' && q ? {
      correct_idx: Number(q.correct_answer_index),
      explanation: q.explanation || '',
    } : null,
    chat: list(ch.chat).slice(-100),
    server_time: now / 1000,
    question_started_at: (Number(ch.question_started_at) || now) / 1000,
    skills_used: ch.skills_used || {},
    my_skill_effect: viewerPos >= 0 ? ((ch.skill_effects || {})[viewerPos] || {}) : {},
    league_mode: !!ch.league_mode, league_round: ch.league_round || 1,
    league_active_players: ch.league_active_players || null,
    league_eliminated_pos: ch.league_eliminated_pos ?? null,
    league_eliminated_name: ch.league_eliminated_name || null,
    league_eliminated_char: ch.league_eliminated_char || null,
  };
}
function getPlayer(ch, token) {
  return list(ch.players).find((p) => p && p.player_token === token);
}
function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

async function runAction(action, data, uid) {
  const code = String(data.code || '').toUpperCase();
  const now = Date.now();
  if (action === 'aqs_ch_create') {
    const numPlayers = Math.max(2, Math.min(20, parseInt(data.num_players, 10) || 2));
    const qpr = Math.max(1, Math.min(30, parseInt(data.questions_per_round, 10) || 5));
    const league = !!parseInt(data.league_mode, 10);
    const rounds = league ? numPlayers - 1 : Math.max(1, Math.min(20, parseInt(data.num_rounds, 10) || 1));
    const time = Math.max(5, Math.min(180, parseInt(data.time_per_question, 10) || 30));
    let questions = [];
    try { questions = JSON.parse(data.questions_json || data.questions || '[]'); } catch (_) {}
    if (!Array.isArray(questions) || !questions.length) fail('Add questions before creating the challenge.');
    if (questions.length > 1000) fail('A challenge can contain at most 1,000 questions.');
    const roomCode = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    const playerToken = require('crypto').randomBytes(18).toString('hex');
    const playerName = String(data.host_name || 'Host').trim().slice(0, 40) || 'Host';
    const ch = {
      code: roomCode, host_uid: uid, title: String(data.title || ('Challenge ' + roomCode)).slice(0, 100),
      status: 'waiting', phase: 'waiting', num_players: numPlayers, num_rounds: rounds,
      questions_per_round: qpr, time_per_question: time, num_questions: numPlayers * qpr * rounds,
      questions, players: { 0: { position: 0, player_name: playerName,
        player_token: playerToken, character_id: String(data.character_id || 'koda').slice(0, 32),
        is_host: 1, score: 0, joined_at: now } },
      chat: [], round: 0, attempt_idx: 0, scores: { 0: 0 }, league_mode: league,
      created_at: now, server_time: now / 1000,
    };
    const roomRef = db.ref('challenges/' + roomCode);
    const result = await roomRef.transaction((current) => current === null ? ch : undefined);
    if (!result.committed) fail('Could not reserve a unique challenge code. Please try again.', 503);
    return { code: roomCode, player_token: playerToken, position: 0, is_host: true,
      num_players: numPlayers, num_rounds: rounds, questions_per_round: qpr,
      time_per_question: time, num_questions: ch.num_questions, title: ch.title, host_name: playerName };
  }
  if (!/^[A-Z0-9]{6}$/.test(code)) fail('Challenge code is invalid.');
  const roomRef = db.ref('challenges/' + code);
  const token = String(data.player_token || '');

  if (action === 'aqs_ch_join') {
    const playerToken = require('crypto').randomBytes(18).toString('hex');
    const playerName = String(data.player_name || '').trim().slice(0, 40);
    if (!playerName) fail('Enter your name to join.');
    let position = -1;
    let hostName = 'Host';
    const result = await roomRef.transaction((ch) => {
      if (!ch || ch.status !== 'waiting') return;
      const players = ch.players || {};
      const taken = Object.keys(players).map(Number);
      if (taken.length >= Number(ch.num_players)) return;
      position = Array.from({ length: Number(ch.num_players) }, (_, i) => i).find((p) => !taken.includes(p));
      if (position === undefined) return;
      hostName = (list(players).find((p) => p.is_host) || {}).player_name || 'Host';
      ch.players = { ...players, [position]: { position, player_name: playerName,
        player_token: playerToken, character_id: String(data.character_id || 'koda').slice(0, 32),
        is_host: 0, score: 0, joined_at: now } };
      ch.scores = { ...(ch.scores || {}), [position]: 0 };
      return ch;
    });
    if (!result.committed) fail('This challenge is full or has already started.');
    return { code, player_token: playerToken, position, is_host: false,
      num_players: result.snapshot.val().num_players,
      num_rounds: result.snapshot.val().num_rounds,
      questions_per_round: result.snapshot.val().questions_per_round,
      time_per_question: result.snapshot.val().time_per_question,
      num_questions: result.snapshot.val().num_questions,
      title: result.snapshot.val().title, host_name: hostName, joined_mid_game: false };
  }

  if (action === 'aqs_ch_start') {
    const result = await roomRef.transaction((ch) => {
      if (!ch || ch.status !== 'waiting') return;
      if (ch.host_uid !== uid || !getPlayer(ch, token)?.is_host) return;
      const questions = list(ch.questions);
      const players = Number(ch.num_players) || 2;
      const qpr = Number(ch.questions_per_round) || 5;
      const rounds = Number(ch.num_rounds) || 1;
      const totalPerPlayer = qpr * (ch.league_mode ? players - 1 : rounds);
      if (questions.length < players * totalPerPlayer) return;
      ch.player_questions = {};
      for (let p = 0; p < players; p += 1) {
        const pool = [];
        for (let n = 0; n < totalPerPlayer; n += 1) {
          const index = ch.league_mode
            ? (Math.floor(n / qpr) * players * qpr) + (p * qpr) + (n % qpr)
            : (p + n * players);
          pool.push(questions[index]);
        }
        ch.player_questions[p] = pool;
      }
      ch.status = 'active'; ch.phase = 'active'; ch.round = 1; ch.attempt_idx = 0;
      ch.q_in_round = 1; ch.answers_this_q = {}; ch.started_at = now;
      ch.question_started_at = now; ch.server_time = now / 1000;
      ch.total_rounds = ch.league_mode ? 1 : rounds;
      ch.active_pos = 0; ch.primary_pos = 0;
      if (ch.league_mode) {
        ch.total_rounds = 1; ch.league_round = 1;
        ch.league_active_players = Array.from({ length: players }, (_, i) => i);
      }
      return ch;
    });
    if (!result.committed) fail('Only the host can start, and the challenge must have enough questions.');
    return { started: true };
  }

  if (action === 'aqs_ch_poll') {
    const result = await roomRef.transaction((ch) => {
      if (!ch) return;
      const before = JSON.stringify(ch);
      progressRoom(ch, now);
      return JSON.stringify(ch) === before ? undefined : ch;
    });
    if (!result.snapshot.exists()) fail('Challenge not found.', 404);
    const polledRoom = result.snapshot.val();
    if (!getPlayer(polledRoom, token)) fail('Join this challenge before viewing its live state.', 403);
    return publicState(polledRoom, code, now, token);
  }

  if (action === 'aqs_ch_skill_activate') {
    let activated = null;
    const result = await roomRef.transaction((ch) => {
      if (!ch || ch.status !== 'active') return;
      progressRoom(ch, now);
      if (ch.phase !== 'active') return ch;
      const elapsedBeforeSkill = (now - (Number(ch.question_started_at) || now)) / 1000;
      if (elapsedBeforeSkill >= (Number(ch.time_per_question) || 30) + (Number(((ch.skill_effects || {})[Number(ch.active_pos)] || {}).extraTime) || 0)) return;
      const player = getPlayer(ch, token);
      if (!player || Number(player.position) !== Number(ch.active_pos)) return;
      const pos = Number(player.position);
      if ((ch.skills_used || {})[pos]) return;
      const skillByCharacter = {
        blaze: 'double', reaper: 'double', samurai: 'double', koda: 'double',
        cyber: 'shield', luna: 'shield',
        inferno: 'timeboost', ember: 'timeboost', aang: 'timeboost',
        nova: 'fiftyfifty', phantom: 'fiftyfifty', viper: 'doublesteal',
      };
      const effect = skillByCharacter[player.character_id];
      if (!effect) return;
      const state = { ...(ch.skill_effects || {}) };
      const skill = {};
      if (effect === 'double') skill.boost = true;
      if (effect === 'shield') skill.shield = true;
      if (effect === 'timeboost') skill.extraTime = 10;
      if (effect === 'doublesteal') skill.doubleSteal = true;
      if (effect === 'fiftyfifty') {
        const questionOwner = ch.steal_mode ? Number(ch.steal_of_pos) : pos;
        const q = questionFor(ch, questionOwner);
        const options = q && Array.isArray(q.options) ? q.options : [];
        const correct = Number(q && q.correct_answer_index);
        const wrong = options.map((_, index) => index).filter((index) => index !== correct);
        for (let i = wrong.length - 1; i > 0; i -= 1) {
          const j = require('crypto').randomInt(i + 1);
          [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
        }
        skill.eliminatedOptionIndices = wrong.slice(0, 2);
      }
      state[pos] = skill;
      ch.skill_effects = state;
      ch.skills_used = { ...(ch.skills_used || {}), [pos]: true };
      activated = { effect, eliminated_indices: skill.eliminatedOptionIndices || [], extra_time: skill.extraTime || 0 };
      return ch;
    });
    if (!result.committed || !activated) fail('This skill cannot be used now, or it has already been used.');
    return activated;
  }

  if (action === 'aqs_ch_answer') {
    const answerIdx = Number.parseInt(data.answer_idx ?? data.answer_index, 10);
    if (!Number.isInteger(answerIdx) || answerIdx < -1 || answerIdx > 100) fail('Choose a valid answer.');
    let response = null;
    const result = await roomRef.transaction((ch) => {
      if (!ch || ch.status !== 'active' || ch.phase !== 'active') return;
      const player = getPlayer(ch, token);
      if (!player) return;
      const pos = Number(player.position);
      if (pos !== Number(ch.active_pos)) return;
      const answers = ch.answers_this_q || {};
      if (answers[pos] || answers[String(pos)]) return;
      const elapsed = (now - (Number(ch.question_started_at) || now)) / 1000;
      const activeSkill = (ch.skill_effects || {})[pos] || {};
      if (elapsed > (Number(ch.time_per_question) || 30) + (Number(activeSkill.extraTime) || 0)) return;
      const stealing = !!ch.steal_mode;
      const owner = stealing ? Number(ch.steal_of_pos) : pos;
      const q = questionFor(ch, owner);
      if (!q) return;
      const correct = Number(q.correct_answer_index);
      const isCorrect = answerIdx >= 0 && answerIdx === correct;
      const effectiveTime = (Number(ch.time_per_question) || 30) + (Number(activeSkill.extraTime) || 0);
      const bonus = Math.max(0, Math.round((1 - elapsed / effectiveTime) * 100));
      const skillEffects = { ...(ch.skill_effects || {}) };
      const skillEffect = skillEffects[pos] || {};
      const useDoubleSteal = stealing && !!skillEffect.doubleSteal;
      const boost = skillEffect.boost ? 2 : 1;
      const shield = !!skillEffect.shield;
      const basePoints = stealing ? (useDoubleSteal ? 6 : 3) : (10 + Math.round(bonus / 10));
      const points = isCorrect ? basePoints * (stealing ? 1 : boost) : (shield ? 3 : 0);
      if (skillEffect.doubleSteal && !stealing) {
        skillEffects[pos] = { doubleSteal: true };
      } else {
        delete skillEffects[pos];
      }
      ch.skill_effects = skillEffects;
      const scores = { ...(ch.scores || {}) };
      scores[pos] = (Number(scores[pos]) || 0) + points;
      ch.scores = scores;
      ch.answers_this_q = { ...answers, [pos]: {
        answer_idx: answerIdx, is_correct: isCorrect, time_ms: elapsed * 1000,
        is_steal: stealing, pts: points,
      } };
      ch.phase = 'reveal'; ch.reveal_started_at = now;
      ch.last_result = { player_pos: pos, player_name: player.player_name,
        winner_pos: isCorrect ? pos : -1, is_correct: isCorrect,
        answer_idx: answerIdx, correct_idx: correct, pts: points,
        skipped: answerIdx < 0, is_steal: stealing, steal_offered: false,
        explanation: q.explanation || '' };
      ch.steal_mode = false; ch.steal_of_pos = null; ch.pending_stealer = null;
      if (!isCorrect && !stealing) {
        const active = activePositions(ch);
        const idx = active.indexOf(pos);
        for (let step = 1; step < active.length; step += 1) {
          const candidate = active[(Math.max(idx, 0) + step) % active.length];
          const entry = ch.answers_this_q[candidate] || ch.answers_this_q[String(candidate)];
          if (!entry) {
            ch.last_result.steal_offered = true;
            ch.pending_stealer = candidate;
            break;
          }
        }
      }
      response = { is_correct: isCorrect, score: scores[pos], time_bonus: isCorrect ? bonus : 0, correct_idx: correct, explanation: q.explanation || '', skill_boost_applied: !!skillEffect.boost, skill_shield_applied: shield };
      return ch;
    });
    if (!result.committed) fail('Your answer was not accepted. Check whose turn it is, or whether time has expired.');
    return response;
  }

  if (action === 'aqs_ch_play_again') {
    const result = await roomRef.transaction((ch) => {
      if (!ch || ch.status !== 'finished' || ch.host_uid !== uid || !getPlayer(ch, token)?.is_host) return;
      ch.status = 'waiting'; ch.phase = 'waiting'; ch.round = 1; ch.q_in_round = 1;
      ch.attempt_idx = 0; ch.active_pos = 0; ch.primary_pos = 0;
      ch.steal_mode = false; ch.steal_of_pos = null; ch.answers_this_q = {};
      ch.scores = {}; list(ch.players).forEach((p) => { ch.scores[p.position] = 0; });
      ch.skills_used = {}; ch.skill_effects = {}; ch.voice = {}; ch.chat = [];
      ch.last_result = null; ch.question_started_at = null; ch.reveal_started_at = null;
      ch.pending_stealer = null; ch.finish_after_league_transition = false;
      ch.league_eliminated_pos = null; ch.league_eliminated_name = null;
      ch.league_eliminated_char = null; ch.league_transition_at = null;
      ch.next_league_round = null; ch.league_round = 1;
      ch.league_active_players = ch.league_mode
        ? Array.from({ length: Number(ch.num_players) || 2 }, (_, i) => i)
        : null;
      delete ch.player_questions; delete ch.finished_at;
      return ch;
    });
    if (!result.committed) fail('Only the host can restart a finished challenge.');
    return { ok: true };
  }

  if (action === 'aqs_ch_update_settings') {
    const title = String(data.title || '').trim().slice(0, 100);
    const time = Math.max(5, Math.min(180, parseInt(data.time_per_question, 10) || 30));
    const result = await roomRef.transaction((ch) => {
      if (!ch || ch.status !== 'waiting' || ch.host_uid !== uid || !getPlayer(ch, token)?.is_host) return;
      ch.title = title || ch.title; ch.time_per_question = time; return ch;
    });
    if (!result.committed) fail('Only the host can change settings before the challenge starts.');
    return { title: title, time_per_question: time };
  }

  if (action === 'aqs_ch_chat') {
    const message = String(data.message || '').trim().slice(0, 300);
    if (!message) return { ok: true };
    const snap = await roomRef.get();
    if (!snap.exists()) fail('Challenge not found.', 404);
    const player = getPlayer(snap.val(), token);
    if (!player) fail('Player not found.', 403);
    await roomRef.child('chat').push({ player_name: player.player_name, message, ts: now });
    return { ok: true };
  }

  if (action === 'aqs_ch_voice_push') {
    const chunk = String(data.chunk || '');
    if (!chunk || chunk.length > 180000) fail('Audio chunk is empty or too large.');
    const snap = await roomRef.get();
    if (!snap.exists() || !getPlayer(snap.val(), token)) fail('Player not found.', 403);
    const pos = String(getPlayer(snap.val(), token).position);
    await roomRef.child('voice/' + pos).set({ data: chunk, ts: now, mime: String(data.mime || 'audio/webm').slice(0, 80) });
    return { ok: true };
  }

  if (action === 'aqs_ch_voice_poll') {
    const snap = await roomRef.get();
    if (!snap.exists()) fail('Challenge not found.', 404);
    const ch = snap.val();
    const player = getPlayer(ch, token);
    if (!player) fail('Player not found.', 403);
    const since = Number(data.since) || 0;
    const voice = ch.voice || {};
    const chunks = Object.keys(voice).filter((p) => Number(p) !== Number(player.position))
      .filter((p) => voice[p] && voice[p].data && Number(voice[p].ts) > since)
      .map((p) => ({ pos: Number(p), data: voice[p].data, mime: voice[p].mime || 'audio/webm', ts: voice[p].ts }));
    return { chunks, server_time: now };
  }
  fail('Unsupported Challenge action.');
}

exports.challenge = onRequest({ region: 'us-central1', cors: true, timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST required.' });
  try {
    const header = String(req.get('authorization') || '');
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required.' });
    const decoded = await admin.auth().verifyIdToken(token);
    const body = req.body || {};
    const action = String(body.action || '');
    if (!ALLOWED_ACTIONS.has(action)) return res.status(400).json({ success: false, error: 'Unsupported Challenge action.' });
    const data = body.data || {};
    const result = await runAction(action, data, decoded.uid);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Challenge]', error);
    return res.status(error.status || 400).json({ success: false, error: error.message || 'Challenge request failed.' });
  }
});
