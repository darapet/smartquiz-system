/* =======================================================================
   median-bridge.js  — Median (GoNative) WebView compatibility layer
   Fixes: audio autoplay blocked, microphone permission, AudioContext lock
   Add this script to EVERY page:
       <script src="js/median-bridge.js"></script>
   ======================================================================= */
(function () {
    'use strict';

    /* ── Detect Median / GoNative WebView ──────────────────────────────── */
    var ua = navigator.userAgent || '';
    var isMedian = ua.indexOf('gonative') !== -1 || ua.indexOf('median') !== -1;
    var isAndroid = /android/i.test(ua);
    var isIOS = /iphone|ipad|ipod/i.test(ua);
    var isNative = isMedian || (isAndroid && /wv/i.test(ua));

    window.AQSMedian = {
        isMedian: isMedian,
        isNative: isNative,
        isAndroid: isAndroid,
        isIOS: isIOS
    };

    /* ── Shared AudioContext (reused by all voice/TTS code) ────────────── */
    var _sharedCtx = null;
    var _audioUnlocked = false;

    function getSharedAudioCtx() {
        if (_sharedCtx && _sharedCtx.state !== 'closed') return _sharedCtx;
        try {
            _sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {}
        return _sharedCtx;
    }

    /* Expose globally so challenge.js / tts.js can reuse the same context */
    window.AQSGetAudioCtx = getSharedAudioCtx;

    /* ── Unlock audio + microphone on first user gesture ──────────────── */
    function unlockAll() {
        if (_audioUnlocked) return;
        _audioUnlocked = true;

        /* 1. Unlock Web Audio API (AudioContext) */
        try {
            var ctx = getSharedAudioCtx();
            if (ctx) {
                var buf = ctx.createBuffer(1, 1, 22050);
                var src = ctx.createBufferSource();
                src.buffer = buf;
                src.connect(ctx.destination);
                src.start(0);
                ctx.resume().catch(function () {});
            }
        } catch (e) {}

        /* 2. Unlock HTML <audio> element (Android blocks these separately) */
        try {
            /* Silent 1-frame WAV */
            var sil = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
            sil.volume = 0;
            sil.play().catch(function () {});
        } catch (e) {}

        /* 3. Request microphone permission — triggers native dialog in Median */
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                .then(function (stream) {
                    stream.getTracks().forEach(function (t) { t.stop(); });
                    window._aqsMicGranted = true;
                })
                .catch(function (err) {
                    window._aqsMicGranted = false;
                    console.warn('[Median Bridge] Mic permission denied:', err.message);
                    _showMicBanner();
                });
        }

        window._aqsAudioUnlocked = true;
        window._aqsSharedAudioCtx = _sharedCtx;
    }

    /* Trigger unlock on ANY first user interaction */
    ['touchstart', 'touchend', 'mousedown', 'keydown'].forEach(function (evt) {
        document.addEventListener(evt, unlockAll, { once: true, passive: true });
    });

    /* ── Mic blocked banner ────────────────────────────────────────────── */
    function _showMicBanner() {
        if (document.getElementById('_aqsMicBanner')) return;
        var banner = document.createElement('div');
        banner.id = '_aqsMicBanner';
        banner.style.cssText = [
            'position:fixed;bottom:0;left:0;right:0;z-index:99999',
            'background:#c0392b;color:#fff;padding:12px 14px;font-size:13px',
            'font-family:sans-serif;display:flex;align-items:center',
            'justify-content:space-between;box-shadow:0 -2px 8px rgba(0,0,0,.3)'
        ].join(';');
        banner.innerHTML =
            '<span>&#127908; Microphone blocked &mdash; open your phone <b>Settings &rarr; Apps &rarr; ' +
            (document.title || 'App') + ' &rarr; Permissions</b> and allow Microphone</span>' +
            '<button id="_aqsMicRetry" style="margin-left:10px;background:#fff;color:#c0392b;' +
            'border:none;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer">Retry</button>';
        document.body.appendChild(banner);

        document.getElementById('_aqsMicRetry').addEventListener('click', function () {
            banner.remove();
            _audioUnlocked = false;
            window._aqsMicGranted = false;
            unlockAll();
        });
    }

    /* ── Fix: patch challenge.js getVoiceCtx to use shared context ───── */
    /* challenge.js calls new AudioContext() independently — we intercept
       AudioContext constructor to always return the shared unlocked one.  */
    var _OrigAudioContext = window.AudioContext || window.webkitAudioContext;
    if (_OrigAudioContext) {
        var _patchedCtx = null;
        function PatchedAudioContext() {
            /* First call: create and cache shared context */
            if (!_patchedCtx || _patchedCtx.state === 'closed') {
                _patchedCtx = new _OrigAudioContext();
                _sharedCtx = _patchedCtx;
                window._aqsSharedAudioCtx = _patchedCtx;
            }
            /* All subsequent calls return the same context */
            return _patchedCtx;
        }
        PatchedAudioContext.prototype = _OrigAudioContext.prototype;
        PatchedAudioContext.isTypeSupported = _OrigAudioContext.isTypeSupported
            ? _OrigAudioContext.isTypeSupported.bind(_OrigAudioContext)
            : function () { return false; };

        try {
            window.AudioContext = PatchedAudioContext;
            window.webkitAudioContext = PatchedAudioContext;
        } catch (e) {}
    }

    /* ── Offline banner ────────────────────────────────────────────────── */
    function _showOffline(show) {
        var b = document.getElementById('_aqsOfflineBanner');
        if (!b) {
            b = document.createElement('div');
            b.id = '_aqsOfflineBanner';
            b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99998;' +
                'background:#c0392b;color:#fff;text-align:center;padding:8px 16px;' +
                'font-size:14px;font-family:sans-serif;display:none;box-shadow:0 2px 6px rgba(0,0,0,.3)';
            b.textContent = '\u26a0 No internet connection';
            document.body.appendChild(b);
        }
        b.style.display = show ? 'block' : 'none';
        document.body.style.paddingTop = show ? '38px' : '';
    }
    window.addEventListener('offline', function () { _showOffline(true); });
    window.addEventListener('online', function () { _showOffline(false); });
    if (!navigator.onLine) {
        document.addEventListener('DOMContentLoaded', function () { _showOffline(true); });
    }

    /* ── MediaRecorder MIME — pick best format for this WebView ───────── */
    window.AQSBestAudioMime = (function () {
        var types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg',
            'audio/mp4'
        ];
        if (typeof MediaRecorder === 'undefined') return 'audio/webm';
        for (var i = 0; i < types.length; i++) {
            if (MediaRecorder.isTypeSupported(types[i])) return types[i];
        }
        return '';
    }());

})();
