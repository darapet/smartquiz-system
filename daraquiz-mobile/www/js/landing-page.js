(function () {
  'use strict';

  var toggle = document.querySelector('.lp-menu-toggle');
  var nav = document.getElementById('lp-main-nav');
  if (!toggle || !nav) return;

  function closeMenu() {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation menu');
    nav.classList.remove('is-open');
  }

  toggle.addEventListener('click', function () {
    var isOpen = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Open navigation menu' : 'Close navigation menu');
    nav.classList.toggle('is-open', !isOpen);
  });

  nav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeMenu();
  });
  var heroVideo = document.querySelector('.lp-hero-video');
  var heroPlay = document.querySelector('.lp-video-autoplay-fallback');
  if (heroVideo) {
    heroVideo.muted = true;
    heroVideo.defaultMuted = true;
    heroVideo.playsInline = true;

    function requestHeroPlayback() {
      var attempt = heroVideo.play();
      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch(function () { if (heroPlay) heroPlay.hidden = false; });
      }
    }

    heroVideo.addEventListener('playing', function () {
      if (heroPlay) heroPlay.hidden = true;
    });
    heroVideo.addEventListener('error', function () {
      if (heroPlay) {
        heroPlay.hidden = false;
        heroPlay.disabled = true;
        heroPlay.textContent = 'Hero video could not load';
      }
    });
    if (heroPlay) {
      heroPlay.addEventListener('click', function () {
        heroPlay.disabled = true;
        heroPlay.textContent = 'Loading video…';
        var attempt = heroVideo.play();
        if (attempt && typeof attempt.then === 'function') {
          attempt.then(function () { heroPlay.hidden = true; }).catch(function () {
            heroPlay.disabled = false;
            heroPlay.textContent = 'Tap to retry video';
          });
        }
      });
    }
    requestHeroPlayback();
  }

  var playProductLink = document.querySelector('[data-play-product-video]');
  var productVideo = document.getElementById('product-video');
  if (playProductLink && productVideo) {
    playProductLink.addEventListener('click', function () {
      var attempt = productVideo.play();
      if (attempt && typeof attempt.catch === 'function') attempt.catch(function () {});
    });
  }
})();