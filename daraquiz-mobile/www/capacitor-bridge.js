/**
 * DaraQuiz AI — Capacitor Bridge
 * Auto-loaded on every page. Handles native integrations:
 * - Back button on Android
 * - Network status detection
 * - Keyboard resize
 * - Status bar theming
 * Include this script BEFORE closing </body> on every page.
 */

(function () {
  'use strict';

  var isCapacitor = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
  var platform = isCapacitor ? (window.Capacitor.getPlatform ? window.Capacitor.getPlatform() : 'web') : 'web';

  /* ── Platform class on body for CSS targeting ── */
  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('platform-' + platform);
    if (isCapacitor) document.body.classList.add('is-native');
  });

  /* ── Android back button handling ── */
  document.addEventListener('ionBackButton', function (ev) {
    if (history.length > 1) {
      history.back();
    }
  });

  if (isCapacitor && platform === 'android') {
    document.addEventListener('backbutton', function () {
      if (window.location.href.endsWith('index.html') ||
          window.location.pathname === '/' ||
          window.location.pathname === '/index.html') {
        /* On home page — confirm exit */
        if (confirm('Exit DaraQuiz AI?')) {
          if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
            window.Capacitor.Plugins.App.exitApp();
          }
        }
      } else {
        history.back();
      }
    }, false);
  }

  /* ── Network connectivity banner ── */
  function showOfflineBanner(show) {
    var banner = document.getElementById('aqsOfflineBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'aqsOfflineBanner';
      banner.style.cssText = [
        'position:fixed;top:0;left:0;right:0;z-index:99999',
        'background:#c0392b;color:#fff',
        'text-align:center;padding:8px 16px;font-size:14px',
        'font-family:sans-serif;display:none',
        'box-shadow:0 2px 6px rgba(0,0,0,.3)'
      ].join(';');
      banner.textContent = '⚠ No internet connection';
      document.body.appendChild(banner);
    }
    banner.style.display = show ? 'block' : 'none';
    if (show) document.body.style.paddingTop = '38px';
    else document.body.style.paddingTop = '';
  }

  window.addEventListener('offline', function () { showOfflineBanner(true); });
  window.addEventListener('online',  function () { showOfflineBanner(false); });
  if (!navigator.onLine) showOfflineBanner(true);

  /* ── Capacitor-specific network plugin ── */
  if (isCapacitor && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Network) {
    var Network = window.Capacitor.Plugins.Network;
    Network.addListener('networkStatusChange', function (status) {
      showOfflineBanner(!status.connected);
    });
    Network.getStatus().then(function (status) {
      showOfflineBanner(!status.connected);
    }).catch(function () {});
  }

  /* ── Capacitor SplashScreen hide ── */
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      if (isCapacitor && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SplashScreen) {
        window.Capacitor.Plugins.SplashScreen.hide({ fadeOutDuration: 500 });
      }
    }, 500);
  });

  /* ── Expose platform info globally ── */
  window.AQSPlatform = { isNative: isCapacitor, platform: platform };

})();
