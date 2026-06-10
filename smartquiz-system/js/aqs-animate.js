/* AI Quiz System — AI Animate JS
   Developed by Omomo Excellence in corporation with Darapet Technology
   Upload image → animate with CSS → generate AI frames via Pollinations FLUX */

(function () {
    'use strict';

    var $wrap = document.getElementById('aqs-anim-wrap');
    if (!$wrap) return;

    /* ── DOM refs ── */
    var $dropzone       = document.getElementById('aqs-anim-dropzone');
    var $fileInput      = document.getElementById('aqs-anim-file');
    var $browseBtn      = document.getElementById('aqs-anim-browse-btn');
    var $uploadCard     = document.getElementById('aqs-anim-upload-card');
    var $previewCard    = document.getElementById('aqs-anim-preview-card');
    var $previewImg     = document.getElementById('aqs-anim-preview-img');
    var $previewWrap    = document.getElementById('aqs-anim-preview-wrap');
    var $playBtn        = document.getElementById('aqs-anim-play-btn');
    var $previewBadge   = document.getElementById('aqs-anim-preview-badge');
    var $fileName       = document.getElementById('aqs-anim-file-name');
    var $changeBtn      = document.getElementById('aqs-anim-change-btn');
    var $promptTA       = document.getElementById('aqs-anim-prompt');
    var $enhBtn         = document.getElementById('aqs-anim-enhance-btn');
    var $styleBtns      = document.querySelectorAll('.aqs-anim-style');
    var $previewBtn     = document.getElementById('aqs-anim-preview-btn');
    var $genBtn         = document.getElementById('aqs-anim-generate-btn');
    var $status         = document.getElementById('aqs-anim-status');
    var $statusTxt      = document.getElementById('aqs-anim-status-text');
    var $error          = document.getElementById('aqs-anim-error');
    var $empty          = document.getElementById('aqs-anim-empty');
    var $framesGrid     = document.getElementById('aqs-anim-frames-grid');
    var $regenFramesBtn = document.getElementById('aqs-anim-regen-frames-btn');

    /* ── State ── */
    var uploadedDataUrl = null;
    var uploadedName    = '';
    var isPlaying       = false;
    var activeStyle     = 'cinematic';
    var activeCss       = 'aqs-anim-css-cinematic';

    /* ── Prompt enhancer suffixes ── */
    var ENHANCE_SUFFIXES = [
        'cinematic motion, smooth animation, professional quality, film grain, depth of field',
        'dynamic energy, vivid colors, high contrast, dramatic lighting, motion blur, 4K quality',
        'slow motion, golden hour light, dreamy bokeh, ethereal atmosphere, smooth transitions',
        'action energy, explosive visual effects, sharp detail, vibrant saturation, epic composition',
        'neon glow, futuristic energy, vivid chromatic shifts, dark atmospheric mood, cinematic',
    ];

    /* ── Style → Pollinations suffix map ── */
    var STYLE_AI_SUFFIX = {
        cinematic: 'cinematic film still, dramatic lighting, motion blur, professional cinematography, anamorphic lens',
        pulse:     'energy pulse visual, glowing aura, vibrant power effect, dynamic particle effects, vivid',
        float:     'floating ethereal scene, soft bokeh background, dreamy atmosphere, gentle motion, aerial',
        kenburns:  'stunning landscape photography, documentary style, epic wide shot, detailed environment, golden hour',
        glitch:    'glitch art digital distortion, cyberpunk fragments, neon color aberration, visual corruption effect',
        neon:      'neon glow vibrant scene, dark background, futuristic neon lights, vivid chromatic colors, cinematic',
        reveal:    'dramatic cinematic reveal, high contrast composition, bold visual impact, cinematic moment',
        vortex:    'hypnotic vortex abstract, swirling surreal digital art, vivid spiral motion, psychedelic',
    };

    /* ── File handling ── */
    function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        var reader = new FileReader();
        reader.onload = function (e) {
            uploadedDataUrl = e.target.result;
            uploadedName    = file.name;
            $previewImg.src = uploadedDataUrl;
            $fileName.textContent = file.name;
            $uploadCard.style.display = 'none';
            $previewCard.style.display = 'block';
            $previewBtn.disabled = false;
            stopAnimation();
        };
        reader.readAsDataURL(file);
    }

    if ($browseBtn) $browseBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        $fileInput.click();
    });
    if ($fileInput)  $fileInput.addEventListener('change', function () {
        if (this.files && this.files[0]) handleFile(this.files[0]);
    });
    if ($changeBtn)  $changeBtn.addEventListener('click', function () {
        stopAnimation();
        $uploadCard.style.display = 'block';
        $previewCard.style.display = 'none';
        uploadedDataUrl = null;
        $fileInput.value = '';
        $previewBtn.disabled = true;
    });

    /* Drag & drop */
    if ($dropzone) {
        $dropzone.addEventListener('click', function () { $fileInput.click(); });
        $dropzone.addEventListener('dragover', function (e) {
            e.preventDefault();
            $dropzone.classList.add('dragover');
        });
        $dropzone.addEventListener('dragleave', function () {
            $dropzone.classList.remove('dragover');
        });
        $dropzone.addEventListener('drop', function (e) {
            e.preventDefault();
            $dropzone.classList.remove('dragover');
            var file = e.dataTransfer.files && e.dataTransfer.files[0];
            if (file) handleFile(file);
        });
    }

    /* ── Animation playback ── */
    function stopAnimation() {
        isPlaying = false;
        $previewImg.className = 'aqs-anim-preview-img';
        $previewBadge.textContent = 'Paused';
        $playBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        if ($previewBtn) $previewBtn.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Preview';
    }
    function startAnimation() {
        isPlaying = true;
        $previewImg.className = 'aqs-anim-preview-img ' + activeCss;
        $previewBadge.textContent = getStyleLabel(activeStyle);
        $playBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        if ($previewBtn) $previewBtn.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause';
    }
    function toggleAnimation() {
        if (!uploadedDataUrl) return;
        if (isPlaying) stopAnimation(); else startAnimation();
    }
    function getStyleLabel(s) {
        var btn = document.querySelector('.aqs-anim-style[data-style="' + s + '"]');
        return btn ? btn.querySelector('.aqs-anim-style-name').textContent : s;
    }

    if ($playBtn)    $playBtn.addEventListener('click', toggleAnimation);
    if ($previewBtn) $previewBtn.addEventListener('click', toggleAnimation);

    /* ── Style selection ── */
    $styleBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            $styleBtns.forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            activeStyle = btn.getAttribute('data-style') || 'cinematic';
            activeCss   = btn.getAttribute('data-css') || 'aqs-anim-css-cinematic';
            if (isPlaying) {
                $previewImg.className = 'aqs-anim-preview-img';
                setTimeout(function () { $previewImg.className = 'aqs-anim-preview-img ' + activeCss; }, 30);
                $previewBadge.textContent = getStyleLabel(activeStyle);
            }
        });
    });

    /* ── Prompt enhancer ── */
    if ($enhBtn) {
        $enhBtn.addEventListener('click', function () {
            var raw = ($promptTA.value || '').trim();
            $enhBtn.disabled = true;
            $enhBtn.textContent = 'Enhancing...';

            if (typeof window.groqFetch === 'function' && raw) {
                window.groqFetch({
                    model: 'llama-3.1-8b-instant',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an AI animation prompt engineer. Enhance the user\'s animation prompt with professional motion, lighting, and cinematic quality descriptors. Return only the enhanced prompt, nothing else. Keep it under 150 words.'
                        },
                        { role: 'user', content: 'Enhance this animation prompt: ' + raw }
                    ],
                    max_tokens: 200,
                    temperature: 0.7
                }).then(function (res) { return res.json(); })
                .then(function (data) {
                    var enhanced = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
                    if (enhanced) $promptTA.value = enhanced.trim();
                    else localEnhance(raw);
                })
                .catch(function () { localEnhance(raw); })
                .finally(resetEnhBtn);
            } else {
                setTimeout(function () {
                    localEnhance(raw);
                    resetEnhBtn();
                }, 600);
            }
        });
    }

    function localEnhance(raw) {
        var suffix = ENHANCE_SUFFIXES[Math.floor(Math.random() * ENHANCE_SUFFIXES.length)];
        if (!raw) {
            $promptTA.value = 'Animate this image with ' + suffix;
        } else {
            $promptTA.value = raw.replace(/,\s*$/, '') + ', ' + suffix;
        }
    }
    function resetEnhBtn() {
        $enhBtn.disabled = false;
        $enhBtn.innerHTML =
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Enhance';
    }

    /* ── Generate AI frames ── */
    function generateFrames() {
        var raw = ($promptTA.value || '').trim();
        if (!raw && !uploadedDataUrl) return;

        hideError();
        var styleSuffix = STYLE_AI_SUFFIX[activeStyle] || '';
        var base = raw || ('animated ' + (uploadedName ? uploadedName.replace(/\.\w+$/, '') : 'visual'));
        var full = base + (styleSuffix ? ', ' + styleSuffix : '') + ', no text, no watermark, ultra detailed, professional quality, 8K';

        $genBtn.disabled = true;
        $empty.style.display = 'none';
        $framesGrid.style.display = 'grid';
        $regenFramesBtn.style.display = 'inline-flex';
        $framesGrid.innerHTML = '';
        setStatus('Generating 4 AI animation frames\u2026 (10\u201320 seconds each)');

        var seeds = [
            Math.floor(Math.random() * 9999999),
            Math.floor(Math.random() * 9999999),
            Math.floor(Math.random() * 9999999),
            Math.floor(Math.random() * 9999999),
        ];

        /* Create 4 skeleton frame cards */
        var cards = [];
        var i;
        for (i = 0; i < 4; i++) {
            var card = document.createElement('div');
            card.className = 'aqs-anim-frame-card loading';
            card.innerHTML =
                '<div class="aqs-anim-frame-spinner">' +
                    '<div class="aqs-anim-frame-spinner-ring"></div>' +
                    '<span>Generating\u2026</span>' +
                '</div>' +
                '<span class="aqs-anim-frame-label">Frame ' + (i + 1) + '</span>';
            $framesGrid.appendChild(card);
            cards.push(card);
        }

        var settled = 0;

        for (var idx = 0; idx < 4; idx++) {
            (function (cardEl, frameIdx, seed) {
                var delay = frameIdx * 3500;
                var url = 'https://image.pollinations.ai/prompt/' +
                    encodeURIComponent(full) +
                    '?width=960&height=540&model=flux&seed=' + seed +
                    '&enhance=true&nologo=true';

                setTimeout(function () {
                    if (frameIdx > 0) setStatus('Generating frame ' + (frameIdx + 1) + ' of 4\u2026');
                    var imgEl = document.createElement('img');
                    imgEl.onload = function () {
                        settled++;
                        cardEl.className = 'aqs-anim-frame-card loaded';
                        cardEl.innerHTML =
                            '<img src="' + url + '" alt="AI frame ' + (frameIdx + 1) + '" loading="lazy">' +
                            '<div class="aqs-anim-frame-actions">' +
                                '<a class="aqs-btn aqs-btn-sm aqs-btn-primary" href="' + url + '" download="xzily-frame-' + (frameIdx + 1) + '.jpg" target="_blank">\u2b07 Download</a>' +
                                '<button class="aqs-btn aqs-btn-sm aqs-anim-regen-one" data-idx="' + frameIdx + '">\u21ba</button>' +
                            '</div>' +
                            '<span class="aqs-anim-frame-label">Frame ' + (frameIdx + 1) + '</span>';
                        cardEl.querySelector('.aqs-anim-regen-one').addEventListener('click', function () {
                            regenOneFrame(cardEl, frameIdx, full);
                        });
                        if (settled === 4) finishFrames();
                    };
                    imgEl.onerror = function () {
                        settled++;
                        cardEl.className = 'aqs-anim-frame-card error';
                        cardEl.innerHTML =
                            '<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:12px;text-align:center;font-size:0.75rem;color:#ef4444;line-height:1.4;">' +
                            '\u26a0\ufe0f Failed.<br><small>Try again.</small></div>' +
                            '<span class="aqs-anim-frame-label">Frame ' + (frameIdx + 1) + '</span>';
                        if (settled === 4) finishFrames();
                    };
                    imgEl.src = url;
                }, delay);
            })(cards[idx], idx, seeds[idx]);
        }
    }

    function regenOneFrame(cardEl, frameIdx, fullPrompt) {
        var seed = Math.floor(Math.random() * 9999999);
        var url  = 'https://image.pollinations.ai/prompt/' +
            encodeURIComponent(fullPrompt) +
            '?width=960&height=540&model=flux&seed=' + seed +
            '&enhance=true&nologo=true';
        cardEl.className = 'aqs-anim-frame-card loading';
        cardEl.innerHTML =
            '<div class="aqs-anim-frame-spinner">' +
                '<div class="aqs-anim-frame-spinner-ring"></div>' +
                '<span>Regenerating\u2026</span>' +
            '</div>' +
            '<span class="aqs-anim-frame-label">Frame ' + (frameIdx + 1) + '</span>';
        var imgEl = document.createElement('img');
        imgEl.onload = function () {
            cardEl.className = 'aqs-anim-frame-card loaded';
            cardEl.innerHTML =
                '<img src="' + url + '" alt="" loading="lazy">' +
                '<div class="aqs-anim-frame-actions">' +
                    '<a class="aqs-btn aqs-btn-sm aqs-btn-primary" href="' + url + '" download="xzily-frame-' + (frameIdx + 1) + '.jpg" target="_blank">\u2b07 Download</a>' +
                    '<button class="aqs-btn aqs-btn-sm aqs-anim-regen-one" data-idx="' + frameIdx + '">\u21ba</button>' +
                '</div>' +
                '<span class="aqs-anim-frame-label">Frame ' + (frameIdx + 1) + '</span>';
            cardEl.querySelector('.aqs-anim-regen-one').addEventListener('click', function () {
                regenOneFrame(cardEl, frameIdx, fullPrompt);
            });
        };
        imgEl.onerror = function () {
            cardEl.className = 'aqs-anim-frame-card error';
            cardEl.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:12px;text-align:center;font-size:0.75rem;color:#ef4444;">' +
                '\u26a0\ufe0f Failed.<br><small>Try again.</small></div>' +
                '<span class="aqs-anim-frame-label">Frame ' + (frameIdx + 1) + '</span>';
        };
        imgEl.src = url;
    }

    function finishFrames() {
        $status.style.display = 'none';
        $genBtn.disabled = false;
        $genBtn.innerHTML =
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
            '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Generate AI Frames';
    }

    if ($genBtn)         $genBtn.addEventListener('click', generateFrames);
    if ($regenFramesBtn) $regenFramesBtn.addEventListener('click', generateFrames);

    /* ── Prompt textarea auto-resize ── */
    if ($promptTA) {
        $promptTA.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });
    }

    /* ── Helpers ── */
    function setStatus(txt) {
        if ($status)    $status.style.display = 'flex';
        if ($statusTxt) $statusTxt.textContent = txt;
    }
    function hideError() { if ($error) $error.style.display = 'none'; }

})();
