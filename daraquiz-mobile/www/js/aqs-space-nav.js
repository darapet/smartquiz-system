/* Shared behavior for the Dara mobile product spaces. */
(function () {
  'use strict';
  var path = (window.location.pathname || '').split('/').pop() || 'index.html';
  var activeSpace = path === 'dara-edu.html' ? 'dara-edu.html' :
    (path === 'workspace.html' ? 'workspace.html' : 'social.html');

  function markActiveSpaceLinks() {
    document.querySelectorAll('[data-dara-space]').forEach(function (link) {
      if (link.getAttribute('data-dara-space') === activeSpace) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
    });
  }

  function wireSpaceMenus() {
    document.querySelectorAll('[data-dara-space-menu]').forEach(function (button) {
      button.addEventListener('click', function () {
        var menu = document.getElementById(button.getAttribute('aria-controls'));
        if (!menu) return;
        var open = menu.hasAttribute('hidden');
        if (open) menu.removeAttribute('hidden'); else menu.setAttribute('hidden', '');
        button.setAttribute('aria-expanded', String(open));
      });
    });
  }

  function init() {
    markActiveSpaceLinks();
    wireSpaceMenus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
