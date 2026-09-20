/* Shared behavior for the Dara mobile product spaces. */
(function () {
  'use strict';
  var path = (window.location.pathname || '').split('/').pop() || 'index.html';
  var activeSpace = path === 'dara-edu.html' ? 'dara-edu.html' :
    (path === 'workspace.html' ? 'workspace.html' : 'social.html');

  function mountMobileSpaceBottomNav() {
    if (!document.body || document.getElementById('aqs-mobile-space-bottom-nav')) return;
    var nav = document.createElement('nav');
    nav.id = 'aqs-mobile-space-bottom-nav';
    nav.className = 'aqs-mobile-space-bottom-nav';
    nav.setAttribute('aria-label', 'Studyco spaces');
    nav.innerHTML =
      '<a class="aqs-mobile-space-bottom-link" data-dara-space="social.html" href="social.html">' +
        '<span class="aqs-mobile-space-bottom-icon">◎</span><span>Studyco Student Connect</span>' +
      '</a>' +
      '<a class="aqs-mobile-space-bottom-link" data-dara-space="dara-edu.html" href="dara-edu.html">' +
        '<span class="aqs-mobile-space-bottom-icon">📚</span><span>Dara Edu</span>' +
      '</a>' +
      '<a class="aqs-mobile-space-bottom-link" data-dara-space="workspace.html" href="workspace.html">' +
        '<span class="aqs-mobile-space-bottom-icon">✦</span><span>Workspace</span>' +
      '</a>';
    document.body.appendChild(nav);
    document.body.classList.add('aqs-has-space-bottom-nav');
    nav.querySelectorAll('[data-dara-space]').forEach(function (link) {
      if (link.getAttribute('data-dara-space') === activeSpace) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
    });
  }

  window.aqsMountMobileSpaceBottomNav = mountMobileSpaceBottomNav;
  mountMobileSpaceBottomNav();

  document.querySelectorAll('[data-dara-space]').forEach(function (link) {
    if (link.getAttribute('data-dara-space') === activeSpace) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });
  document.querySelectorAll('[data-dara-space-menu]').forEach(function (button) {
    button.addEventListener('click', function () {
      var menu = document.getElementById(button.getAttribute('aria-controls'));
      if (!menu) return;
      var open = menu.hasAttribute('hidden');
      if (open) menu.removeAttribute('hidden'); else menu.setAttribute('hidden', '');
      button.setAttribute('aria-expanded', String(open));
    });
  });
})();