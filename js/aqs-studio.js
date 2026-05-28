ce of a mid-sentence network timeout)             */
        var chunks = splitSpeechChunks(spoken, 200);
        var idx    = 0;
        var doneCalled = false;
        function finish() {
            if (doneCalled) return; doneCalled = true;
            currentStudioAudio = null;
            voiceAiTalking     = false;
            if (onDone) onDone();
        }

        function fallbackRemaining() {
            if (!voiceAiTalking) { finish(); return; }
            /* Try to continue playing remaining chunks via Pollinations.
               If a chunk still fails, use browser TTS for just that chunk. */
            var remaining = chunks.slice(idx - 1).join(' ');
            if (!remaining.trim()) { finish(); return; }
            /* For remaining, try Pollinations first, browser TTS as last resort */
            fetchStudioAudioBlob(remaining.slice(0, 400), ['onyx', 'echo', 'shimmer'], 10000)
                .then(function(blob) {
                    if (!voiceAiTalking) { finish(); return; }
                    var blobUrl = URL.createObjectURL(blob);
                    var audio2  = new Audio();
                    audio2.setAttribute('playsinline', '');
                    audio2.src  = blobUrl;
                    audio2.addEventListener('ended', function() {
                        try { URL.revokeObjectURL(blobUrl); } catch(_) {}
                        /* Mark remaining as consumed then finish */
                        idx = chunks.length;
                        finish();
                    });
                    audio2.addEventListener('error', function() {
                        try { URL.revokeObjectURL(blobUrl); } catch(_) {}
                        speakWithBrowserFallback(remaining, finish);
                    });
                    audio2.play().catch(function() {
                        try { URL.revokeObjectURL(blobUrl); } catch(_) {}
                        speakWithBrowserFallback(remaining, finish);
                    });
                })
                .catch(function() {
                    speakWithBrowserFallback(remaining, finish);
                });
        }

        function playNext() {
            if (!voiceAiTalking || idx >= chunks.length) { finish(); return; }

            var chunk = chunks[idx++];

            fetchStudioAudioBlob(chunk, ['onyx', 'echo', 'shimmer'], 14000)
                .then(function(blob) {
                    if (!voiceAiTalking) { finish(); return; }

                    /* Force audio/mpeg type — Android Chrome sometimes fails to
                       decode untyped blobs fetched from audio.pollinations.ai    */
                    var typedBlob = new Blob([blob], { type: 'audio/mpeg' });
                    var blobUrl   = URL.createObjectURL(typedBlob);
                    var audio     = new Audio();
                    audio.setAttribute('playsinline', '');
                    audio.setAttribute('webkit-playsinline', '');
                    audio.preload  = 'auto';
                    audio.volume   = 1.0;
                    audio.src      = blobUrl;
                    currentStudioAudio = audio;

                    var stallTimer  = null;
                    var cleaned     = false;
                    var lastCurTime = -1;

                    function cleanup() {
                        if (cleaned) return; cleaned = true;
                        clearTimeout(stallTimer);
                        clearTimeout(hardCap);
                        try { URL.revokeObjectURL(blobUrl); } catch(_) {}
                        currentStudioAudio = null;
                    }

                    /* ── Android-safe stall watchdog ──────────────────────────
                       audio.duration is UNRELIABLE on Android Chrome for blob
                       URLs — often returns Infinity or NaN.

                       Instead: watch currentTime advance via timeupdate.
                       If currentTime stops moving for 4 s and audio hasn't
                       ended → genuine stall → skip to next chunk.

                       Hard cap is a flat 1-hour ceiling — never calculated
                       from blob size or text length.
                    ──────────────────────────────────────────────────────────── */
                    var hardCap = setTimeout(function() {
                        if (!cleaned) { cleanup(); playNext(); }
                    }, 60 * 60 * 1000); /* 1 hour — never calculated from blob size */

                    function armStallTimer() {
                        clearTimeout(stallTimer);
                        stallTimer = setTimeout(function() {
                            if (cleaned) return;
                            if (audio.currentTime > lastCurTime) {
                                lastCurTime = audio.currentTime;
                                armStallTimer();   /* still progressing — re-arm */
                            } else {
                                clearTimeout(hardCap);
                                cleanup();
                                playNext();         /* truly stalled — skip chunk */
                            }
                        }, 4000);
                    }

                    audio.addEventListener('timeupdate', function() {
                        lastCurTime = audio.currentTime;
                        armStallTimer();   /* reset stall clock on every tick */
                    });

                    audio.addEventListener('canplay', function() {
                        if (lastCurTime < 0) armStallTimer();
                    });

                    audio.addEventListener('ended', function() {
                        clearTimeout(hardCap);
                        cleanup();
                        playNext();
                    });

                    audio.addEventListener('error', function() {
                        clearTimeout(hardCap);
                        cleanup();
                        fallbackRemaining();
                    });

                    /* On mobile: retry play() once after 400 ms if first call
                       is rejected by Android autoplay policy                   */
                    audio.play().catch(function() {
                        setTimeout(function() {
                            if (!voiceAiTalking) { clearTimeout(hardCap); cleanup(); finish(); return; }
                            audio.play().catch(function() {
                                clearTimeout(hardCap);
                                cleanup();
                                fallbackRemaining();
                            });
                        }, 400);
                    });
                })
                .catch(function() {
                    if (!voiceAiTalking) { finish(); return; }
                    fallbackRemaining();
                });
        }

        playNext();
    }

    /* ── UI state helpers ── */
    function setVoiceState(state) {
        var orb      = document.getElementById('dts-voice-orb');
        var statusEl = document.getElementById('dts-voice-status');
        var togBtn   = document.getElementById('dts-voice-toggle');
        var micIcon  = document.getElementById('dts-voice-mic-icon');
        var waveIcon = document.getElementById('dts-voice-wave-icon');

        var labels = {
            idle:      'Tap "Start Listening" to begin',
            listening: 'Listening… speak now',
            thinking:  'XZILY is thinking…',
            speaking:  'XZILY is speaking…',
            error:     'Microphone error',
            closed:    ''
        };
        var togLabels = {
            idle:      'Start Listening',
            listening: 'Stop Listening',
            thinking:  'Please wait…',
            speaking:  'Interrupt',
            error:     'Retry',
            closed:    ''
        };

        if (statusEl) statusEl.textContent = labels[state] || state;
        if (orb)      orb.dataset.state    = state;
        if (togBtn)   togBtn.textContent   = togLabels[state] || state;

        /* Swap icon: mic ↔ wave */
        if (micIcon && waveIcon) {
            micIcon.style.display  = state === 'speaking' ? 'none'  : '';
            waveIcon.style.display = state === 'speaking' ? ''      : 'none';
        }
    }

    function setVoiceTranscript(text) {
        var el = document.getElementById('dts-voice-transcript');
        if (el) el.textContent = text;
    }

    /* =========================================================
       UTILITIES
    ========================================================= */
    function showTyping(show) {
        var el   = document.getElementById('dts-typing');
        var msgs = document.getElementById('dts-messages');
        if (!el) return;
        if (show) {
            /* Move indicator INSIDE the scrollable messages container
               so it appears directly below the last sent message */
            if (msgs && el.parentNode !== msgs) msgs.appendChild(el);
            el.style.display = 'flex';
            scrollToBottom();
        } else {
            el.style.display = 'none';
        }
    }
    function scrollToBottom(force) {
            var msgs = document.getElementById('dts-messages');
            if (!msgs) return;
            /* Only snap to bottom when user is already near it (within 150px)
               OR when explicitly forced — prevents page jumping while user reads above */
            var nearBottom = (msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight) < 150;
            if (!nearBottom && !force) return;
            requestAnimationFrame(function () {
                msgs.scrollTop = msgs.scrollHeight + 200;
            });
        }
    function escHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

})();
