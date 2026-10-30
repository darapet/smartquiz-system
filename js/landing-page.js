(function () {
  'use strict';

  var toggle = document.querySelector('.lp-menu-toggle');
  var nav = document.getElementById('lp-main-nav');

  if (toggle && nav) {
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
  }

  var heroVideo = document.querySelector('.lp-hero-video');
  var heroPlay = document.querySelector('.lp-video-autoplay-fallback');
  var productVideo = document.getElementById('product-video');
  var soundPrompt = document.querySelector('[data-video-sound]');
  var playProductLink = document.querySelector('[data-play-product-video]');
  var motionPreference = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  var visibleVideos = new Set();

  function reducedMotionRequested() {
    return Boolean(motionPreference && motionPreference.matches);
  }

  function playVideo(video) {
    try {
      var result = video.play();
      return result && typeof result.then === 'function' ? result : Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function updateSoundPrompt() {
    if (!soundPrompt || !productVideo || productVideo.dataset.mutedFallback !== 'true') {
      if (soundPrompt) soundPrompt.hidden = true;
      return;
    }

    soundPrompt.hidden = false;
    soundPrompt.textContent = productVideo.muted ? 'Turn sound on' : 'Mute video';
    soundPrompt.setAttribute('aria-label', productVideo.muted ? 'Turn video sound on' : 'Mute video');
    soundPrompt.setAttribute('aria-pressed', String(!productVideo.muted));
  }

  function tryStartVideo(video) {
    if (!video || document.visibilityState === 'hidden' || reducedMotionRequested()) return;

    if (video === heroVideo) {
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      playVideo(video).catch(function () {
        if (heroPlay) heroPlay.hidden = false;
      });
      return;
    }

    if (video === productVideo && video.dataset.audioAttempted !== 'true') {
      video.dataset.audioAttempted = 'true';
      video.muted = false;
      playVideo(video).then(function () {
        video.dataset.soundWasEnabled = 'true';
        delete video.dataset.mutedFallback;
        updateSoundPrompt();
      }).catch(function () {
        video.muted = true;
        playVideo(video).then(function () {
          video.dataset.mutedFallback = 'true';
          updateSoundPrompt();
        }).catch(function () {});
      });
      return;
    }

    playVideo(video).catch(function (error) {
      if (video === productVideo && !video.muted && error && error.name === 'NotAllowedError') {
        video.muted = true;
        playVideo(video).then(function () {
          video.dataset.mutedFallback = 'true';
          updateSoundPrompt();
        }).catch(function () {});
      }
    });
  }

  function setVideoVisibility(video, isVisible) {
    if (isVisible && !reducedMotionRequested()) {
      visibleVideos.add(video);
      tryStartVideo(video);
    } else {
      visibleVideos.delete(video);
      video.pause();
    }
  }

  if (heroVideo) {
    heroVideo.muted = true;
    heroVideo.defaultMuted = true;
    heroVideo.playsInline = true;
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
        playVideo(heroVideo).then(function () {
          heroPlay.hidden = true;
        }).catch(function () {
          heroPlay.disabled = false;
          heroPlay.textContent = 'Tap to retry video';
        });
      });
    }
  }

  if (productVideo) {
    productVideo.playsInline = true;
    productVideo.addEventListener('volumechange', function () {
      if (!productVideo.muted) {
        productVideo.dataset.soundWasEnabled = 'true';
        delete productVideo.dataset.mutedFallback;
      } else if (productVideo.dataset.soundWasEnabled === 'true') {
        productVideo.dataset.mutedFallback = 'true';
      }
      updateSoundPrompt();
    });
  }

  if (soundPrompt && productVideo) {
    soundPrompt.addEventListener('click', function () {
      productVideo.dataset.audioAttempted = 'true';
      if (productVideo.muted) {
        productVideo.muted = false;
        playVideo(productVideo).then(function () {
          productVideo.dataset.soundWasEnabled = 'true';
          delete productVideo.dataset.mutedFallback;
          updateSoundPrompt();
        }).catch(function () {
          productVideo.muted = true;
          productVideo.dataset.mutedFallback = 'true';
          updateSoundPrompt();
        });
      } else {
        productVideo.muted = true;
        productVideo.dataset.mutedFallback = 'true';
        updateSoundPrompt();
      }
    });
  }

  if (playProductLink && productVideo) {
    playProductLink.addEventListener('click', function () {
      productVideo.dataset.audioAttempted = 'true';
      productVideo.muted = false;
      playVideo(productVideo).then(function () {
        productVideo.dataset.soundWasEnabled = 'true';
        delete productVideo.dataset.mutedFallback;
        updateSoundPrompt();
      }).catch(function () {
        productVideo.muted = true;
        playVideo(productVideo).then(function () {
          productVideo.dataset.mutedFallback = 'true';
          updateSoundPrompt();
        }).catch(function () {});
      });
    });
  }

  var autoplayVideos = document.querySelectorAll('[data-scroll-autoplay]');
  if ('IntersectionObserver' in window) {
    var videoObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var threshold = entry.target === productVideo ? 0.5 : 0.1;
        setVideoVisibility(entry.target, entry.isIntersecting && entry.intersectionRatio >= threshold);
      });
    }, { threshold: [0, 0.1, 0.5] });

    autoplayVideos.forEach(function (video) {
      videoObserver.observe(video);
    });
  } else {
    function checkVideoVisibility() {
      autoplayVideos.forEach(function (video) {
        var rect = video.getBoundingClientRect();
        var visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        var ratio = rect.height ? visibleHeight / rect.height : 0;
        var threshold = video === productVideo ? 0.5 : 0.1;
        setVideoVisibility(video, ratio >= threshold);
      });
    }

    window.addEventListener('scroll', checkVideoVisibility, { passive: true });
    window.addEventListener('resize', checkVideoVisibility);
    checkVideoVisibility();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      autoplayVideos.forEach(function (video) { video.pause(); });
    } else {
      visibleVideos.forEach(tryStartVideo);
    }
  });

  if (motionPreference && motionPreference.addEventListener) {
    motionPreference.addEventListener('change', function () {
      if (reducedMotionRequested()) {
        autoplayVideos.forEach(function (video) { video.pause(); });
      } else {
        visibleVideos.forEach(tryStartVideo);
      }
    });
  }
})();