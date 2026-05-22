/* AI Quiz System — Image Generator
   Powered by Pollinations AI — no backend required
   Developed by Omomo Excellence in corporation with Darapet Technology */
(function () {
    'use strict';

    var selectedStyle = '';
    var lastPrompt    = '';
    var history       = [];

    var IG_HISTORY_KEY = 'aqs_ig_history';

    function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
    function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

    /* ── DOM refs ── */
    var $wrap      = document.getElementById('aqs-imagegen-wrap');
    if (!$wrap) return;

    var $promptTA  = document.getElementById('aqs-ig-prompt');
    var $genBtn    = document.getElementById('aqs-ig-generate-btn');
    var $enhBtn    = document.getElementById('aqs-ig-enhance-btn');
    var $clearBtn  = document.getElementById('aqs-ig-clear-btn');
    var $status    = document.getElementById('aqs-ig-status');
    var $statusTxt = document.getElementById('aqs-ig-status-text');
    var $error     = document.getElementById('aqs-ig-error');
    var $results   = document.getElementById('aqs-ig-results');
    var $grid      = document.getElementById('aqs-ig-grid');
    var $histSec   = document.getElementById('aqs-ig-history-section');
    var $histGrid  = document.getElementById('aqs-ig-history-grid');
    var $lb        = document.getElementById('aqs-ig-lightbox');
    var $lbOvr     = document.getElementById('aqs-ig-lb-overlay');
    var $lbImg     = document.getElementById('aqs-ig-lb-img');
    var $lbDl      = document.getElementById('aqs-ig-lb-download');
    var $lbRegen   = document.getElementById('aqs-ig-lb-regen');
    var $lbPrompt  = document.getElementById('aqs-ig-lb-prompt');
    var $lbClose   = document.getElementById('aqs-ig-lb-close');
    var $dlAll     = document.getElementById('aqs-ig-download-all');
    var $clrHist   = document.getElementById('aqs-ig-clear-history');
    var $presets   = document.querySelectorAll('.aqs-ig-preset');
    var $sizeEl    = document.getElementById('aqs-ig-size');
    var $qualEl    = document.getElementById('aqs-ig-quality');
    var $countEl   = document.getElementById('aqs-ig-count');

    /* ── Style preset selection ── */
    $presets.forEach(function (btn) {
        btn.addEventListener('click', function () {
            $presets.forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            selectedStyle = btn.getAttribute('data-style') || '';
        });
    });

    /* ── Load history ── */
    history = lsGet(IG_HISTORY_KEY, []);
    renderHistory();

    /* ─────────────────────────────────────────────────────────────
       SMART PROMPT BUILDER
       Detects whether the user wants a realistic photograph or a
       graphic design (flyer, banner, obituary, poster, etc.) and
       appends the right quality suffix.  Photography suffixes on
       design prompts produce wrong, blurry non-design results.
    ───────────────────────────────────────────────────────────── */

    var DESIGN_RE = /\b(flyer|flier|banner|poster|obituar|memorial|tribute|funeral|invitation|invite|card|thumbnail|logo|certificate|brochure|menu|social.?media|instagram|facebook|print|leaflet|handout|signage|billboard|coupon|voucher|ad\b|advert|promotional|event.?graphic|cover.?page|announcement|pamphlet|booklet)\b/i;

    var PHOTO_SUFFIX = [
        'ultra-realistic professional photography',
        'shot on Sony A7R V with 85mm f/1.4 lens',
        'natural cinematic lighting',
        'sharp focus tack-sharp detail',
        '8K RAW photo HDR',
        'studio-quality color grading',
        'masterpiece composition'
    ].join(', ');

    var DESIGN_SUFFIX = [
        'professional graphic design',
        'print-ready quality',
        'clean crisp layout',
        'bold typography',
        'vibrant well-balanced colors',
        'sharp vector-quality edges',
        'high-resolution output'
    ].join(', ');

    /* Per-design-type suffix for maximum quality */
    var DESIGN_TYPE_SUFFIX = {
        flyer:      'eye-catching flyer design, bold headline text, vivid colors, promotional layout, print-quality',
        banner:     'professional banner design, bold imagery, high-contrast text, wide-format layout, premium finish',
        poster:     'dramatic poster design, large-format print quality, impactful typography, cinematic composition',
        obituary:   'dignified memorial design, soft muted elegant tones, serif typography, respectful layout, tasteful border',
        memorial:   'dignified memorial design, soft muted elegant tones, serif typography, respectful layout, tasteful border',
        tribute:    'heartfelt tribute design, warm tones, elegant typography, emotive composition',
        funeral:    'dignified funeral program design, dark muted tones, formal serif font, respectful solemn layout',
        invitation: 'elegant invitation design, decorative flourishes, refined typography, premium card texture',
        card:       'professional card design, clean layout, crisp typography, balanced whitespace, premium finish',
        thumbnail:  'high-impact thumbnail, bold text overlay, vivid eye-catching colors, designed for digital screens',
        logo:       'clean minimalist logo design, vector style, crisp edges, scalable, strong brand identity',
        certificate:'formal certificate design, ornate border, official typography, premium aged paper texture',
        brochure:   'professional brochure layout, organised sections, clean typography, high-quality print design',
        menu:       'appetising restaurant menu design, clean food layout, premium typography, elegant styling'
    };

    function buildPrompt(raw) {
        var p = raw.trim();
        if (selectedStyle) p = p + ', ' + selectedStyle;

        /* Detect design request */
        var isDesign = DESIGN_RE.test(raw);

        if (isDesign) {
            /* Find the specific design type for a targeted suffix */
            var specificSuffix = '';
            for (var dtype in DESIGN_TYPE_SUFFIX) {
                if (new RegExp('\\b' + dtype + '\\b', 'i').test(raw)) {
                    specificSuffix = DESIGN_TYPE_SUFFIX[dtype];
                    break;
                }
            }
            p += ', ' + (specificSuffix || DESIGN_SUFFIX);
        } else {
            /* Realistic photograph / general image */
            p += ', ' + PHOTO_SUFFIX;
        }

        return p;
    }

    /* Negative prompt — eliminates common AI artefacts */
    var NEGATIVE = encodeURIComponent([
        'blurry','blur','out of focus','noise','grainy','low quality','bad quality',
        'distorted','deformed','watermark','text overlay','overexposed','underexposed',
        'amateur','cartoon','anime','illustration','painting','drawing','sketch',
        'plastic','artificial','fake','mutated','disfigured','bad anatomy',
        'extra limbs','duplicate','tiling','ugly','poorly drawn','low res','draft'
    ].join(','));

    /* ── Pollinations image URL ── */
    function pollinationsImgUrl(prompt, width, height, seed, model) {
        var encoded = encodeURIComponent(prompt);
        var s = seed || Math.floor(Math.random() * 9999999);
        var m = model || 'flux';
        return 'https://image.pollinations.ai/prompt/' + encoded +
               '?width=' + width + '&height=' + height +
               '&model=' + m + '&seed=' + s + '&nologo=true&private=true&enhance=true' +
               '&negative=' + NEGATIVE;
    }

    /* ── Parse size string ── */
    function parseSize(sizeStr) {
        var parts = (sizeStr || '1024x1024').split('x');
        return { w: parseInt(parts[0]) || 1024, h: parseInt(parts[1]) || 1024 };
    }

    /* ─────────────────────────────────────────────────────────────
       IMAGE LOAD — load a single image with retry across models
       Tries flux → turbo → flux-pro, with back-off between attempts.
    ───────────────────────────────────────────────────────────── */
    function loadImageDirect(prompt, width, height, seed, model) {
        return new Promise(function (resolve, reject) {
            var url = pollinationsImgUrl(prompt, width, height, seed, model);
            var img = new Image();
            img.crossOrigin = 'anonymous';
            var tid = setTimeout(function () { img.src = ''; reject(new Error('timeout')); }, 55000);
            img.onload  = function () { clearTimeout(tid); resolve({ url: url, img: img }); };
            img.onerror = function () { clearTimeout(tid); reject(new Error('load error')); };
            img.src = url;
        });
    }

    async function raceImage(prompt, width, height, seed) {
        var models = ['flux', 'turbo', 'flux-pro'];
        var lastErr;
        for (var i = 0; i < models.length; i++) {
            if (i > 0) {
                await new Promise(function (r) { setTimeout(r, 3000 * i); });
            }
            try {
                return await loadImageDirect(prompt, width, height, seed, models[i]);
            } catch (e) {
                lastErr = e;
            }
        }
        throw lastErr;
    }

    /* ─────────────────────────────────────────────────────────────
       AI TEXT CALL — for prompt enhancement
    ───────────────────────────────────────────────────────────── */
    async function callAI(messages) {
        try {
            var ctrl = new AbortController();
            var tid  = setTimeout(function () { ctrl.abort(); }, 18000);
            var res  = await fetch('https://text.pollinations.ai/openai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                referrerPolicy: 'no-referrer',
                signal: ctrl.signal,
                body: JSON.stringify({
                    messages: messages, model: 'openai-fast',
                    max_tokens: 300, temperature: 0.8, private: true
                })
            });
            clearTimeout(tid);
            if (!res.ok) return null;
            var data = await res.json();
            var text = (data.choices && data.choices[0] &&
                        data.choices[0].message && data.choices[0].message.content) || '';
            return text.trim() || null;
        } catch (e) { return null; }
    }

    /* ── Enhance Prompt ── */
    $enhBtn.addEventListener('click', async function () {
        var raw = $promptTA.value.trim();
        if (!raw) { showError('Please enter a prompt first.'); return; }

        $enhBtn.disabled = true;
        $enhBtn.textContent = '✦ Enhancing…';

        var isDesign = DESIGN_RE.test(raw);
        var styleHint = isDesign
            ? 'The user wants a graphic design (flyer, banner, poster, etc.). Enhance the prompt to produce a professional, high-quality graphic design. Do NOT add photography camera or lens terms.'
            : 'The user wants a realistic photograph. Enhance the prompt to produce cinematic, professional photography. Be specific about lighting, composition, and visual details.';

        var messages = [
            { role: 'system', content: 'You are an expert AI image prompt engineer for XZILY AI Studio. ' + styleHint + ' Take the user\'s rough description and rewrite it into a detailed, professional image generation prompt. Output ONLY the enhanced prompt text, max 150 words.' },
            { role: 'user', content: raw }
        ];
        var enhanced = await callAI(messages);

        $enhBtn.disabled = false;
        $enhBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Enhance Prompt';

        if (enhanced) {
            $promptTA.value = enhanced.replace(/^["']|["']$/g, '').trim();
            $promptTA.style.height = 'auto';
            $promptTA.style.height = $promptTA.scrollHeight + 'px';
        } else {
            showError('Could not enhance prompt. Please try again.');
        }
    });

    /* ─────────────────────────────────────────────────────────────
       GENERATE IMAGES — sequential with staggered starts to avoid
       Pollinations rate-limiting consecutive requests.
       Each image is started 4 seconds after the previous one to
       prevent all requests hitting simultaneously and throttling.
    ───────────────────────────────────────────────────────────── */
    $genBtn.addEventListener('click', generateImages);
    $promptTA.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generateImages();
    });

    async function generateImages() {
        var raw = $promptTA.value.trim();
        if (!raw) { showError('Please enter a description for the image.'); return; }

        hideError();
        lastPrompt = raw;

        var fullPrompt = buildPrompt(raw);
        var size  = parseSize($sizeEl ? $sizeEl.value : '1024x1024');
        var count = parseInt($countEl ? $countEl.value : '1') || 1;

        $genBtn.disabled = true;
        $genBtn.innerHTML = '<svg class="aqs-ig-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Generating…';
        $status.style.display = 'flex';
        $results.style.display = 'block';
        $grid.innerHTML = '';

        setStatus('Generating ' + count + ' image' + (count > 1 ? 's' : '') + '… please wait');

        $dlAll.style.display = count > 1 ? 'inline-flex' : 'none';

        /* Pre-create placeholder cards */
        var seeds = [];
        var cards = [];
        for (var i = 0; i < count; i++) {
            seeds.push(Math.floor(Math.random() * 9999999));
            var card = document.createElement('div');
            card.className = 'aqs-ig-card loading';
            card.innerHTML = '<div class="aqs-ig-card-shimmer"><div class="aqs-ig-card-spinner"></div><span>Generating…</span></div>';
            $grid.appendChild(card);
            cards.push(card);
        }

        var successUrls = [];
        var settled     = 0;

        /* ── Staggered sequential launch ──────────────────────────
           Image 0 starts immediately.
           Image 1 starts after 4 s.
           Image 2 starts after 8 s.
           This prevents Pollinations from receiving a burst of
           identical-time requests which triggers rate-limiting.  */
        for (var idx = 0; idx < count; idx++) {
            (function (cardEl, imgIdx, seed) {
                var delay = imgIdx * 4000; /* 4 s stagger between each image */
                setTimeout(async function () {
                    if (imgIdx > 0) {
                        setStatus('Generating image ' + (imgIdx + 1) + ' of ' + count + '…');
                    }
                    try {
                        var result = await raceImage(fullPrompt, size.w, size.h, seed);
                        settled++;
                        successUrls.push(result.url);

                        cardEl.className = 'aqs-ig-card loaded';
                        cardEl.innerHTML = '';

                        var imgEl = document.createElement('img');
                        imgEl.src = result.url;
                        imgEl.alt = raw;
                        imgEl.loading = 'lazy';
                        cardEl.appendChild(imgEl);

                        var finalUrl = result.url;
                        var actions  = document.createElement('div');
                        actions.className = 'aqs-ig-card-actions';
                        actions.innerHTML =
                            '<button class="aqs-btn aqs-btn-sm aqs-ig-view-btn">View Full</button>' +
                            '<a class="aqs-btn aqs-btn-sm aqs-btn-primary aqs-ig-dl-btn" href="' + finalUrl + '" download="darapet-ai-' + (imgIdx + 1) + '.jpg" target="_blank">Download</a>';
                        cardEl.appendChild(actions);

                        cardEl.querySelector('.aqs-ig-view-btn').addEventListener('click', function () {
                            openLightbox(finalUrl, raw);
                        });
                    } catch (_) {
                        settled++;
                        cardEl.className = 'aqs-ig-card error';
                        cardEl.innerHTML = '<div class="aqs-ig-card-err">Image failed to load.<br><small>Check connection or try again.</small></div>';
                    }

                    if (settled === count) finishGeneration(fullPrompt, successUrls);
                }, delay);
            })(cards[idx], idx, seeds[idx]);
        }
    }

    function finishGeneration(prompt, urls) {
        $status.style.display = 'none';
        $genBtn.disabled = false;
        $genBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg> Generate Image';

        if (urls.length > 0) {
            history.unshift({ prompt: prompt, rawPrompt: lastPrompt, urls: urls, ts: Date.now() });
            if (history.length > 20) history = history.slice(0, 20);
            lsSet(IG_HISTORY_KEY, history);
            renderHistory();
        }
    }

    /* ── Lightbox ── */
    function openLightbox(url, prompt) {
        $lbImg.src = url;
        $lbDl.href = url;
        $lbDl.download = 'darapet-ai-image.jpg';
        $lbPrompt.textContent = prompt;
        $lbRegen.dataset.prompt = prompt;
        $lb.style.display = 'flex';
        $lbOvr.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
    function closeLightbox() {
        $lb.style.display = 'none';
        $lbOvr.style.display = 'none';
        document.body.style.overflow = '';
        $lbImg.src = '';
    }
    $lbClose.addEventListener('click', closeLightbox);
    $lbOvr.addEventListener('click', closeLightbox);
    $lbRegen.addEventListener('click', function () {
        closeLightbox();
        var p = $lbRegen.dataset.prompt || '';
        if (p) { $promptTA.value = lastPrompt || p; generateImages(); }
    });

    /* ── Download All ── */
    $dlAll.addEventListener('click', function () {
        $grid.querySelectorAll('.aqs-ig-dl-btn').forEach(function (a) {
            setTimeout(function () { a.click(); }, 200);
        });
    });

    /* ── Clear ── */
    $clearBtn.addEventListener('click', function () {
        $promptTA.value = '';
        $results.style.display = 'none';
        $grid.innerHTML = '';
        hideError();
        $promptTA.focus();
    });

    /* ── History ── */
    function renderHistory() {
        if (!history.length) { $histSec.style.display = 'none'; return; }
        $histSec.style.display = 'block';
        $histGrid.innerHTML = '';
        history.slice(0, 12).forEach(function (item) {
            var url = item.urls && item.urls[0];
            if (!url) return;
            var card = document.createElement('div');
            card.className = 'aqs-ig-card aqs-ig-hist-card';
            card.innerHTML = '<img src="' + url + '" alt="" loading="lazy">' +
                '<div class="aqs-ig-card-actions"><span class="aqs-ig-hist-prompt">' + escHtml(item.rawPrompt || '') + '</span><button class="aqs-btn aqs-btn-sm aqs-ig-view-btn">View</button></div>';
            card.querySelector('.aqs-ig-view-btn').addEventListener('click', function () {
                openLightbox(url, item.rawPrompt || '');
            });
            $histGrid.appendChild(card);
        });
    }

    $clrHist.addEventListener('click', function () {
        if (!confirm('Clear all image history?')) return;
        history = [];
        lsSet(IG_HISTORY_KEY, []);
        renderHistory();
    });

    /* ── Status / Error ── */
    function setStatus(txt) { if ($statusTxt) $statusTxt.textContent = txt; }
    function showError(msg) {
        if (!$error) return;
        $error.textContent = msg;
        $error.style.display = 'block';
        setTimeout(function () { $error.style.display = 'none'; }, 7000);
    }
    function hideError() { if ($error) $error.style.display = 'none'; }

    /* ── Auto-resize textarea ── */
    $promptTA.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    });

    function escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

})();
