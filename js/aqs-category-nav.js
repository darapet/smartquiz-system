/* Category-specific navigation for Dara Edu and Workspace pages. */
(function () {
  'use strict';

  var file = (window.location.pathname || '').split('/').pop() || 'index.html';
  var mobile = !!document.querySelector('script[src*="capacitor-bridge.js"]');
  var isSocial = file === 'social.html' || file === 'studyco-meet.html';
  if (isSocial || document.getElementById('dara-category-nav')) return;

  var eduPages = [
    'dara-edu.html', 'quiz-setup.html', 'create-quiz.html', 'self-quiz.html',
    'take-quiz.html', 'quiz-results.html', 'quiz-manage.html', 'quiz-leaderboard.html',
    'studyhub.html', 'ai-teacher.html', 'challenge.html', 'puzzle.html',
    'library.html', 'library-upload.html', 'library-read.html',
    'library-host-profile.html', 'library-host-view.html', 'user-dashboard.html'
  ];
  var workspacePages = [
    'workspace.html', 'studio.html', 'text-to-docs.html', 'docs-gen.html',
    'image-gen.html', 'image-editor.html', 'tts.html', 'ai-animate.html',
    'design-studio.html'
  ];
  if (file.indexOf('ai-creator-studio-pro') !== -1) workspacePages.push(file);

  var category = eduPages.indexOf(file) !== -1 ? 'edu' :
    (workspacePages.indexOf(file) !== -1 ? 'workspace' : '');
  if (!category) return;

  var root = mobile ? '' : '';
  var socialHome = mobile ? 'social.html' : 'studyco-meet.html';
  var eduHome = 'dara-edu.html';
  var createQuiz = mobile ? 'create-quiz.html' : 'quiz-setup.html';
  var links = category === 'edu' ? [
    ['Dara Edu', eduHome],
    ['Create Quiz', createQuiz],
    ['AI Teacher', 'ai-teacher.html'],
    ['Study Hub', 'studyhub.html'],
    ['Challenge', 'challenge.html'],
    ['Puzzle', 'puzzle.html'],
    ['Library', 'library.html']
  ] : [
    ['Workspace', 'workspace.html'],
    ['Studio AI', 'studio.html'],
    ['Text to Docs', 'text-to-docs.html'],
    ['Docs AI', 'docs-gen.html'],
    ['Images', 'image-gen.html'],
    ['Image Editor', 'image-editor.html'],
    ['Speech', 'tts.html'],
    ['Animate', 'ai-animate.html'],
    ['Design', 'design-studio.html']
  ];

  var nav = document.createElement('div');
  nav.id = 'dara-category-nav';
  nav.className = 'dara-category-nav';
  nav.innerHTML =
    '<a class="dara-category-back" href="' + socialHome + '">← Social</a>' +
    '<div class="dara-category-title"><span>' + (category === 'edu' ? '📚' : '✦') + '</span>' +
      (category === 'edu' ? 'Dara Edu' : 'Workspace') + '</div>' +
    '<button class="dara-category-toggle" type="button" aria-expanded="false">☰ Menu</button>' +
    '<nav class="dara-category-links" aria-label="' + (category === 'edu' ? 'Dara Edu' : 'Workspace') + ' tools"></nav>';

  var linksRoot = nav.querySelector('.dara-category-links');
  links.forEach(function (item) {
    var link = document.createElement('a');
    link.className = 'dara-category-link';
    link.href = root + item[1];
    link.textContent = item[0];
    if (item[1] === file) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
    linksRoot.appendChild(link);
  });

  var toggle = nav.querySelector('.dara-category-toggle');
  toggle.addEventListener('click', function () {
    var open = linksRoot.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  function mount() {
    if (document.body && !document.getElementById('dara-category-nav')) {
      document.body.insertBefore(nav, document.body.firstChild);
    }
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();