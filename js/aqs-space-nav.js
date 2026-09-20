/* Shared behavior for Dara's three product spaces. */
(function () {
  'use strict';

  var path = (window.location.pathname || '').split('/').pop() || 'index.html';
  document.querySelectorAll('[data-dara-space]').forEach(function (link) {
    if (link.getAttribute('data-dara-space') === path) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });

  document.querySelectorAll('[data-dara-space-menu]').forEach(function (button) {
    button.addEventListener('click', function () {
      var menu = document.getElementById(button.getAttribute('aria-controls'));
      if (!menu) return;
      var open = menu.hasAttribute('hidden');
      if (open) menu.removeAttribute('hidden');
      else menu.setAttribute('hidden', '');
      button.setAttribute('aria-expanded', String(open));
    });
  });
})();