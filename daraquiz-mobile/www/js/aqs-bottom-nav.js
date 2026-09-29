(function () {
  'use strict';

  var path = window.location.pathname || '';
  var page = path.split('/').pop() || 'index.html';
  var isMobileBundle = path.indexOf('/daraquiz-mobile/www/') !== -1;
  var isSocial = page === 'social.html' || page === 'studyco-meet.html';
  var socialHref = isMobileBundle ? 'social.html' : 'studyco-meet.html';
  var cssHref = 'css/aqs-bottom-nav.css';
  var items = [
    { id: 'home', label: 'Home', href: 'index.html', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>' },
    { id: 'learn', label: 'Learn', href: 'studyhub.html', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 5.5v15M8 7h8M8 11h8"/></svg>' },
    { id: 'create', label: 'Create', href: 'quiz-setup.html', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/></svg>' },
    { id: 'library', label: 'Library', href: 'library.html', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 0 2 2M9 8h6M9 12h6"/></svg>' },
    { id: 'social', label: 'Dara Social', href: socialHref, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v6a3.5 3.5 0 0 1-3.5 3.5H11l-4.5 4v-4.4A3.5 3.5 0 0 1 4 12.5z"/><path d="m8 8 3 2.2L16 7"/></svg>' }
  ];

  function addStylesheet() {
    if (document.querySelector('link[data-aqs-bottom-nav-css]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssHref;
    link.dataset.aqsBottomNavCss = 'true';
    document.head.appendChild(link);
  }

  function moveSocialNav() {
    if (!isSocial) return;
    var topbar = document.querySelector('.studyco-topbar');
    var topNav = document.querySelector('.studyco-top-nav');
    if (!topbar || !topNav || topNav.closest('.studyco-context-nav')) return;
    var wrapper = document.createElement('div');
    wrapper.className = 'studyco-context-nav';
    wrapper.setAttribute('aria-label', 'Dara Social navigation');
    topbar.insertAdjacentElement('afterend', wrapper);
    wrapper.appendChild(topNav);
  }

  function activeId() {
    if (isSocial) return 'social';
    if (page === 'studyhub.html' || page === 'dara-edu.html') return 'learn';
    if (/^(quiz-setup|create-quiz|self-quiz|studio)\.html$/.test(page)) return 'create';
    if (page.indexOf('library') === 0) return 'library';
    return page === 'index.html' || page === '' ? 'home' : '';
  }

  function shouldSkip() {
    return ['login.html', 'register.html', 'unauthorized.html', 'take-quiz.html', 'challenge.html', 'quiz-results.html'].indexOf(page) !== -1;
  }

  function injectNav() {
    moveSocialNav();
    if (shouldSkip() || document.querySelector('.aqs-bottom-nav, ._aqsbn')) return;
    var nav = document.createElement('nav');
    nav.className = 'aqs-bottom-nav';
    nav.setAttribute('aria-label', 'Main navigation');
    nav.innerHTML = items.map(function (item) {
      var active = item.id === activeId();
      return '<a class="aqs-bottom-nav__item' + (active ? ' is-active' : '') + '" href="' + item.href + '" aria-label="' + item.label + '"' + (active ? ' aria-current="page"' : '') + '>' + item.icon + '<span>' + item.label + '</span></a>';
    }).join('');
    document.body.classList.add('aqs-bottom-nav-page');
    document.body.appendChild(nav);
  }

  function boot() {
    addStylesheet();
    moveSocialNav();
    var app = isSocial && document.getElementById('studyco-app-screen');
    if (app && app.hidden) {
      var observer = new MutationObserver(function () {
        if (!app.hidden) { observer.disconnect(); injectNav(); }
      });
      observer.observe(app, { attributes: true, attributeFilter: ['hidden'] });
      return;
    }
    injectNav();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}());
