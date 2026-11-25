
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('StudyHub web and Android page assets remain identical', () => {
  for (const [web, android] of [
    ['studyhub.html', 'daraquiz-mobile/www/studyhub.html'],
    ['js/aqs-study-plan.js', 'daraquiz-mobile/www/js/aqs-study-plan.js'],
    ['css/aqs-studyhub.css', 'daraquiz-mobile/www/css/aqs-studyhub.css'],
    ['js/aqs-firebase.js', 'daraquiz-mobile/www/js/aqs-firebase.js']
  ]) assert.equal(read(web), read(android), web + ' must match ' + android);
});

test('study plans are stored below the signed-in user account', () => {
  const firebase = read('js/aqs-firebase.js');
  const rules = read('firestore.rules');
  const androidRules = read('daraquiz-mobile/www/firestore.rules');
  const studyRules = (source) => source.slice(source.indexOf('match /studyPlans/{planId}'), source.indexOf('match /studyPlans/{planId}') + 1900).replace(/\s/g, '');
  assert.equal(studyRules(rules), studyRules(androidRules));
  assert.match(firebase, /collection\(db,\s*'users',\s*user\.uid,\s*'studyPlans'\)/);
  assert.match(rules, /match \/users\/\{userId\}[\s\S]*?match \/studyPlans\/\{planId\}/);
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(rules, /data\.sourceMaterial\.size\(\) <= 24000/);
});

test('there is no fixed per-user study-plan count limit', () => {
  const firebase = read('js/aqs-firebase.js');
  const listMethod = firebase.slice(firebase.indexOf('window.aqsStudyPlanStore ='), firebase.indexOf('create: async function(data)'));
  assert.match(listMethod, /getDocs\(query\(plansRef,\s*orderBy\('updatedAt',\s*'desc'\)\)\)/);
  assert.doesNotMatch(listMethod, /limit\(/);
});

test('guided study implements lessons, tutor questions, objective quizzes and saved progress', () => {
  const guided = read('js/aqs-study-plan.js');
  for (const marker of ['generateLesson', 'askMore', 'recapConversation', 'generateQuiz', 'submitQuiz', 'completedTopics', 'savePlan']) {
    assert.ok(guided.includes(marker), 'missing guided study feature: ' + marker);
  }
  assert.match(guided, /Pass the previous topic quiz, or use the Pro bypass/);
  assert.match(guided, /PASS_MARK = 70/);
  assert.match(guided, /bypassRecord/);
  assert.match(guided, /guidedQuizBypass===true/);
  assert.match(guided, /Math\.max\(2,\s*Math\.min\(5/);
});

test('Guided Study has one dedicated dashboard and no legacy StudyHub panel', () => {
  const dashboard = read('studyhub-guided-dashboard.html');
  const androidDashboard = read('daraquiz-mobile/www/studyhub-guided-dashboard.html');
  const studyhub = read('studyhub.html');
  assert.equal(dashboard, androidDashboard);
  assert.match(dashboard, /id="gs-create-modal"/);
  assert.match(dashboard, /id="sg-workspace"/);
  assert.match(dashboard, /id="sg-category"/);
  assert.match(dashboard, /multiple accept=/);
  assert.match(dashboard, /id="sg-voice-orb"/);
  assert.match(dashboard, /id="sg-recap-btn"/);
  assert.match(dashboard, /js\/aqs-study-plan\.js\?v=guided-rebuild-6/);
  assert.doesNotMatch(studyhub, /sh-panel-guided|aqs-study-plan\.js/);
  assert.match(read('studyhub-dashboard.html'), /href="studyhub-guided-dashboard\.html"/);
});
