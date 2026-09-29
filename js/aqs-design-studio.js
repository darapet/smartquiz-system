/* AI Quiz System — Design Studio JS v2
   Developed by Omomo Excellence in corporation with Darapet Technology
   Powered by Gemini image generation + Groq prompt enhancement */

(function () {
    'use strict';

    var $wrap = document.getElementById('aqs-ds-wrap');
    if (!$wrap) return;

    /* ── DOM refs ── */
    var $promptTA   = document.getElementById('aqs-ds-prompt');
    var $genBtn     = document.getElementById('aqs-ds-generate-btn');
    var $enhBtn     = document.getElementById('aqs-ds-enhance-btn');
    var $clearBtn   = document.getElementById('aqs-ds-clear-btn');
    var $regenBtn   = document.getElementById('aqs-ds-regen-btn');
    var $status     = document.getElementById('aqs-ds-status');
    var $statusTxt  = document.getElementById('aqs-ds-status-text');
    var $error      = document.getElementById('aqs-ds-error');
    var $results    = document.getElementById('aqs-ds-results');
    var $grid       = document.getElementById('aqs-ds-grid');
    var $dlAll      = document.getElementById('aqs-ds-download-all');
    var $histSec    = document.getElementById('aqs-ds-history-section');
    var $histGrid   = document.getElementById('aqs-ds-history-grid');
    var $clrHist    = document.getElementById('aqs-ds-clear-history');
    var $lb         = document.getElementById('aqs-ds-lightbox');
    var $lbOvr      = document.getElementById('aqs-ds-lb-overlay');
    var $lbImg      = document.getElementById('aqs-ds-lb-img');
    var $lbDl       = document.getElementById('aqs-ds-lb-download');
    var $lbRegen    = document.getElementById('aqs-ds-lb-regen');
    var $lbPrompt   = document.getElementById('aqs-ds-lb-prompt');
    var $lbClose    = document.getElementById('aqs-ds-lb-close');
    var $tabs       = document.querySelectorAll('.aqs-ds-tab');
    var $presetsRow = document.getElementById('aqs-ds-presets');
    var $sizeEl     = document.getElementById('aqs-ds-size');
    var $qualEl     = document.getElementById('aqs-ds-quality');
    var $countEl    = document.getElementById('aqs-ds-count');

    /* ── State ── */
    var activeCategory = 'general';
    var activeStyle    = '';
    var lastPrompt     = '';
    var history        = [];
    var DS_HISTORY_KEY = 'aqs_ds_history';

    /* ── localStorage helpers ── */
    function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
    function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

    /* ══════════════════════════════════════════════════════════════
       DESIGN DETECTOR — same regex as aqs-imagegen.js
    ══════════════════════════════════════════════════════════════ */
    var DESIGN_RE = /\b(flyer|flier|banner|poster|obituar|memorial|tribute|funeral|invitation|invite|greeting.?card|birthday.?card|card|thumbnail|youtube|logo|certificate|brochure|menu|social.?media|instagram|facebook|twitter|tiktok|print|leaflet|handout|signage|billboard|coupon|voucher|\bad\b|advert|promotional|event.?graphic|cover.?page|announcement|pamphlet|booklet|backdrop|background.?design|infographic|timeline|chart.?design|report.?cover|album.?cover|book.?cover|magazine|newsletter|label|sticker|packaging|business.?card|id.?card|name.?card|profile.?picture|display.?picture|dp|graphic|design|template|mockup|layout|typograph|t.?shirt|hoodie|merch|apparel|jersey|uniform|mug.?design|cap.?design|bag.?design|icon.?set|ui.?design|app.?screen|website.?design|landing.?page|brand|identity)\b/i;
    var ART_RE    = /\b(watercolor|watercolour|painting|illustration|anime|cartoon|sketch|drawing|comic|oil.?paint|acrylic|pastel|charcoal|ink|3d.?render|digital.?art|concept.?art|neon|cyberpunk|pixel.?art|mosaic|stained.?glass|graffiti|street.?art|pop.?art|abstract)\b/i;

    /* ── Design suffix (generic fallback) ── */
    var DESIGN_SUFFIX = [
        'professional commercial graphic design',
        'print-ready 300 DPI output',
        'clean structured layout with clear visual hierarchy',
        'bold impactful typographic treatment',
        'crisp sharp legible text, perfectly readable typography',
        'vibrant perfectly harmonised color palette',
        'sharp vector-quality crisp edges',
        'premium high-resolution commercial finish',
        'no photographic elements, pure graphic design',
        'no people, no human faces, no figures'
    ].join(', ');

    /* ── Per design-type specialist suffixes ── */
    var DESIGN_TYPE_SUFFIX = {
        logo:            'clean professional logo design, vector art, no people no faces no humans no figures, solid white or transparent background, scalable brand mark, geometric or lettermark concept, bold sharp typography, flat vector quality, no photography',
        brand:           'comprehensive brand identity design, cohesive logo and typography system, professional color palette, no people no faces, clean presentation layout',
        'business.card': 'professional business card design, elegant layout, clear name and contact hierarchy, all text crisp and readable, brand color accents, no people no faces, premium finish',
        flyer:           'professional A5 promotional flyer design, bold headline, strong visual hierarchy, vivid accent colors, clear body text zones, all text crisp and legible, print-ready, no real photography, no random people',
        banner:          'wide-format professional banner design, bold high-contrast text, all words perfectly readable, powerful imagery, strong brand presence, horizontal layout, print-quality finish',
        poster:          'dramatic large-format A2 poster design, cinematic full-bleed background, powerful display typeface, sharp readable title text, strong visual focal point, all text clear and legible, gallery-quality',
        thumbnail:       'high-impact YouTube thumbnail design, bold oversized sharp readable text overlay, all words clearly legible, vivid contrasting colors, strong emotion-driven composition',
        instagram:       'professional Instagram post design, square format, bold visual content, strong sharp typography, all text readable, on-brand color palette, eye-catching composition',
        certificate:     'formal official certificate design, ornate classical border, embossed seal area, authoritative serif typography, all text crisp and perfectly readable, gold accent elements, premium parchment-style background, no people',
        brochure:        'professional tri-fold brochure design, organised information sections, clean professional typography, all text sharp and perfectly legible, strong cover visual, balanced color use, print-ready',
        invitation:      'luxury event invitation design, elegant decorative border, refined script and serif typography combination, all text crisp and readable, premium textured card feel, sophisticated color palette',
        obituary:        'dignified obituary memorial design, soft warm muted tones, classical elegant serif typography, all text perfectly readable, gentle floral or dove motif, respectful solemn layout, tasteful ornate border',
        memorial:        'dignified memorial tribute design, soft muted elegant tones, classical serif typography, all text crisp and legible, gentle symbolic motifs, respectful layout, tasteful ornate border',
        't.shirt':       'professional t-shirt graphic design, bold centered artwork, strong typographic or illustrative element, works on light and dark fabric, print-ready vector style, no realistic people',
        infographic:     'professional infographic design, clear data visualisation, icon-supported sections, logical flow, vibrant color-coded elements, all text crisp and readable, clean typography',
        'app.screen':    'professional mobile app UI screen design, clean modern interface, clear navigation, on-brand color system, crisp icons, all text sharp and readable, pixel-perfect layout',
    };

    /* ── Build full prompt ── */
    function buildPrompt(raw, styleSuffix, isHD) {
        var p = (raw || '').trim();
        if (styleSuffix) p += ', ' + styleSuffix;

        var isDesign = DESIGN_RE.test(raw) || DESIGN_RE.test(styleSuffix);
        var isArt    = ART_RE.test(raw)    || ART_RE.test(styleSuffix);

        if (isDesign) {
            var specificSuffix = '';
            for (var dtype in DESIGN_TYPE_SUFFIX) {
                var dtRx = new RegExp('\\b' + dtype.replace('.', '.?') + '\\b', 'i');
                if (dtRx.test(raw) || dtRx.test(styleSuffix)) {
                    specificSuffix = DESIGN_TYPE_SUFFIX[dtype];
                    break;
                }
            }
            p += ', ' + (specificSuffix || DESIGN_SUFFIX);
        } else if (isArt) {
            p += ', highly detailed, professional quality, vibrant rich colors, sharp crisp lines, award-winning artwork, 8K resolution';
        } else {
            p += ', ultra-realistic professional photography, shot on Sony A7R V, natural cinematic lighting, razor-sharp focus, 8K RAW photo, award-winning color grading';
        }

        if (isHD) p += ', ultra-high-definition, intricate fine details, maximum resolution, zero artifacts, pristine commercial quality';
        return p;
    }

    /* ── Build negative prompt ── */
    function buildNegative(raw, styleSuffix) {
        var isDesign = DESIGN_RE.test(raw) || DESIGN_RE.test(styleSuffix);
        var isArt    = ART_RE.test(raw)    || ART_RE.test(styleSuffix);

        var baseNeg = [
            'blurry', 'blur', 'out of focus', 'motion blur',
            'noise', 'grainy', 'film grain', 'jpeg artifacts',
            'low quality', 'bad quality', 'poor quality', 'draft',
            'distorted', 'deformed', 'warped',
            'watermark', 'copyright text',
            'overexposed', 'underexposed',
            'mutated', 'disfigured', 'malformed', 'ugly',
            'duplicate', 'tiling',
            'poorly drawn', 'amateur', 'amateurish',
            'cropped', 'cut off', 'incomplete',
            'pixelated', 'low resolution', 'low res'
        ];

        if (isDesign) {
            baseNeg = baseNeg.concat([
                'photograph', 'photo', 'camera', 'lens flare', 'bokeh',
                'depth of field', 'DSLR', 'RAW photo', 'realistic skin',
                'real person', 'candid shot', 'studio photo',
                'harsh shadows', 'overlit', 'underlit',
                'blurry text', 'illegible text', 'unreadable text',
                'distorted letters', 'warped typography', 'misspelled words',
                'garbled text', 'scrambled letters', 'wrong spelling',
                'fuzzy text', 'smeared text', 'broken letters',
                'people', 'person', 'human', 'woman', 'man', 'girl', 'boy',
                'face', 'faces', 'body', 'figure', 'figures', 'portrait',
                'nude', 'naked', 'crowd', 'model', 'selfie'
            ]);
        } else if (!isArt) {
            baseNeg = baseNeg.concat([
                'cartoon', 'anime', 'manga', 'illustration',
                'painting', 'drawing', 'sketch', 'digital art',
                'plastic', 'artificial', 'fake', 'unrealistic skin',
                'flat lighting', 'harsh shadows'
            ]);
        }

        return encodeURIComponent(baseNeg.join(', '));
    }

    /* Gemini is the only image provider. No public image fallback is used. */
    function parseSize(sizeStr) {
        var parts = (sizeStr || '1024x1024').split('x');
        return { w: parseInt(parts[0]) || 1024, h: parseInt(parts[1]) || 1024 };
    }
    function _creatorAspectRatio(width, height) {
        if (width === height) return 'square';
        return width > height ? 'landscape' : 'portrait';
    }
    async function loadImageDirect(prompt, width, height) {
        if (typeof window.aqsCreatorImageGenerate !== 'function') throw new Error('Gemini image generation is not available on this page.');
        var generated = await window.aqsCreatorImageGenerate({ prompt: prompt, aspectRatio: _creatorAspectRatio(width, height) });
        if (!generated || !generated.url) throw new Error('Gemini returned no image.');
        return { url: generated.url };
    }
    async function raceImage(prompt, width, height) {
        return loadImageDirect(prompt, width, height);
    }

    /* ══════════════════════════════════════════════════════════════
       AI TEXT — Groq prompt enhancement
    ══════════════════════════════════════════════════════════════ */
    async function callAI(messages) {
        if (typeof window.groqFetch === 'function') {
            try {
                var ctrl = new AbortController();
                var tid  = setTimeout(function () { ctrl.abort(); }, 15000);
                var res  = await window.groqFetch({
                    model: 'llama-3.1-8b-instant',
                    messages: messages,
                    max_tokens: 400,
                    temperature: 0.85
                }, { signal: ctrl.signal });
                clearTimeout(tid);
                if (res.ok) {
                    var data = await res.json();
                    var text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
                    if (text.trim().length > 10) return text.trim();
                }
            } catch (e) { /* fall through */ }
        }
        return null;
    }

    /* ── Build preset buttons ── */
    function buildPresets(cat) {
        var presets = CAT_PRESETS[cat] || CAT_PRESETS['general'];
        $presetsRow.innerHTML = '<span class="aqs-ds-preset-label">Style:</span>';
        activeStyle = '';
        presets.forEach(function (p, i) {
            var btn = document.createElement('button');
            btn.className = 'aqs-ig-preset' + (i === 0 ? ' active' : '');
            btn.setAttribute('data-style', p.val);
            btn.textContent = p.label;
            if (i === 0) activeStyle = p.val;
            btn.addEventListener('click', function () {
                $presetsRow.querySelectorAll('.aqs-ig-preset').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                activeStyle = p.val;
            });
            $presetsRow.appendChild(btn);
        });
    }
    buildPresets('general');

    /* ── Tab switching ── */
    $tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            $tabs.forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            activeCategory = tab.getAttribute('data-cat') || 'general';
            buildPresets(activeCategory);
        });
    });

    /* ══════════════════════════════════════════════════════════════
       ENHANCE PROMPT
    ══════════════════════════════════════════════════════════════ */
    if ($enhBtn) {
        $enhBtn.addEventListener('click', async function () {
            var raw = ($promptTA.value || '').trim();
            if (!raw) { $promptTA.focus(); return; }

            $enhBtn.disabled = true;
            $enhBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Enhancing\u2026';

            var isDesign = DESIGN_RE.test(raw) || DESIGN_RE.test(activeStyle);
            var isArt    = ART_RE.test(raw)    || ART_RE.test(activeStyle);

            var styleHint;
            if (isDesign) {
                styleHint = 'The user wants a GRAPHIC DESIGN or PRINT DESIGN piece. Enhance the prompt to describe a stunning, commercially professional graphic design. Include: design type, color palette, typography style, layout structure, key visual elements, mood/tone. STRICTLY FORBIDDEN: any camera, lens, bokeh, photograph, realistic person, face, woman, man, human terms. Output must read like a designer brief, NOT a photography brief. NO PEOPLE unless specifically a fashion or social media design.';
            } else if (isArt) {
                styleHint = 'The user wants ARTISTIC or ILLUSTRATED content. Enhance with rich artistic details: medium, brushwork, color palette mood, artistic style, lighting, composition. FORBIDDEN: camera, lens, photograph terms.';
            } else {
                styleHint = 'The user wants a REALISTIC PHOTOGRAPH. Enhance with professional photography details: subject, lighting setup, camera angle, background, mood, color temperature, depth of field. Be cinematic, specific, and vivid.';
            }

            var enhanced = await callAI([
                {
                    role: 'system',
                    content: 'You are an elite commercial AI image prompt engineer for XZILY AI Studio. ' + styleHint +
                             ' Transform the rough idea into a richly detailed prompt that produces stunning commercial-quality output. ' +
                             'Output ONLY the enhanced prompt text — no preamble, no explanation, no quotes, no markdown. Maximum 200 words.'
                },
                { role: 'user', content: 'Enhance this design prompt: ' + raw }
            ]);

            $enhBtn.disabled = false;
            $enhBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Enhance Prompt';

            if (enhanced) {
                $promptTA.value = enhanced.replace(/^["']|["']$/g, '').trim();
            } else {
                showError('Could not enhance prompt. Please try again.');
            }
        });
    }

    /* ══════════════════════════════════════════════════════════════
       GENERATE DESIGNS
    ══════════════════════════════════════════════════════════════ */
    async function generateDesigns() {
        var raw = ($promptTA.value || '').trim();
        if (!raw && !activeStyle) { $promptTA.focus(); return; }

        hideError();
        lastPrompt = raw;

        var isHD       = $qualEl && $qualEl.value === 'hd';
        var fullPrompt = buildPrompt(raw, activeStyle, isHD);
        var negative   = buildNegative(raw, activeStyle);
        var size       = parseSize($sizeEl ? $sizeEl.value : '1024x1024');
        var count      = parseInt($countEl ? $countEl.value : '1') || 1;

        $genBtn.disabled = true;
        $results.style.display = 'block';
        $grid.innerHTML = '';
        setStatus('Generating ' + count + ' professional design' + (count > 1 ? 's' : '') + '\u2026 ' + (isHD ? 'HD mode — using best quality AI model' : 'please wait'));
        $dlAll.style.display = count > 1 ? 'inline-flex' : 'none';

        var seeds = [];
        var cards = [];
        var i;
        for (i = 0; i < count; i++) {
            seeds.push(Math.floor(Math.random() * 9999999));
            var card = document.createElement('div');
            card.className = 'aqs-ds-card-item loading';
            card.innerHTML =
                '<div class="aqs-ds-card-img-wrap">' +
                    '<div class="aqs-ds-card-shimmer">' +
                        '<div class="aqs-ds-card-spinner"></div>' +
                        '<span>' + (isHD ? '\ud83c\udfa8 HD Quality\u2026' : 'Generating\u2026') + '</span>' +
                    '</div>' +
                '</div>';
            $grid.appendChild(card);
            cards.push(card);
        }

        var settled     = 0;
        var successUrls = [];

        for (var idx = 0; idx < count; idx++) {
            (function (cardEl, imgIdx, seed) {
                var delay = imgIdx * 3500;
                setTimeout(async function () {
                    if (imgIdx > 0) setStatus('Generating design ' + (imgIdx + 1) + ' of ' + count + '\u2026' + (isHD ? ' (HD)' : ''));
                    try {
                        var result = await raceImage(fullPrompt, size.w, size.h, seed, isHD, negative);
                        settled++;
                        successUrls.push(result.url);

                        var finalUrl = result.url;
                        cardEl.className = 'aqs-ds-card-item loaded';
                        cardEl.innerHTML =
                            '<div class="aqs-ds-card-img-wrap">' +
                                '<img src="' + finalUrl + '" alt="' + escHtml(raw) + '" loading="lazy">' +
                                '<div class="aqs-ds-card-actions">' +
                                    '<button class="aqs-btn aqs-btn-sm aqs-ds-view-btn">View Full</button>' +
                                    '<a class="aqs-btn aqs-btn-sm aqs-btn-primary aqs-ds-dl-btn" href="' + finalUrl + '" download="xzily-design-' + (imgIdx + 1) + '.jpg" target="_blank">\u2b07 Download HD</a>' +
                                '</div>' +
                            '</div>' +
                            '<div class="aqs-ds-card-footer">' +
                                '<span class="aqs-ds-card-footer-prompt">' + escHtml(raw || activeStyle) + '</span>' +
                                '<span class="aqs-ds-card-footer-size">' + size.w + '\xd7' + size.h + '</span>' +
                            '</div>';
                        cardEl.querySelector('.aqs-ds-view-btn').addEventListener('click', function () {
                            openLightbox(finalUrl, raw);
                        });
                    } catch (err) {
                        settled++;
                        cardEl.className = 'aqs-ds-card-item error';
                        cardEl.innerHTML =
                            '<div class="aqs-ds-card-img-wrap" style="aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;">' +
                                '<p style="color:#ef4444;font-size:0.85rem;line-height:1.5;">\u26a0\ufe0f Image failed to load.<br><small>Server may be busy. Please try again.</small></p>' +
                            '</div>';
                    }
                    if (settled === count) finishGeneration(fullPrompt, successUrls);
                }, delay);
            })(cards[idx], idx, seeds[idx]);
        }
    }

    function finishGeneration(prompt, urls) {
        $status.style.display = 'none';
        $genBtn.disabled = false;
        $genBtn.innerHTML =
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/>' +
            '<path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/>' +
            '<path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg> Generate Design';
        if (urls.length > 0) {
            history.unshift({ prompt: prompt, rawPrompt: lastPrompt, urls: urls, ts: Date.now() });
            if (history.length > 20) history = history.slice(0, 20);
            lsSet(DS_HISTORY_KEY, history);
            renderHistory();
        }
    }

    /* ── Button events ── */
    if ($genBtn)   $genBtn.addEventListener('click', generateDesigns);
    if ($regenBtn) $regenBtn.addEventListener('click', generateDesigns);
    if ($clearBtn) $clearBtn.addEventListener('click', function () {
        $promptTA.value = '';
        $results.style.display = 'none';
        $grid.innerHTML = '';
        hideError();
        $promptTA.focus();
    });
    if ($dlAll) $dlAll.addEventListener('click', function () {
        $grid.querySelectorAll('.aqs-ds-dl-btn').forEach(function (a) {
            setTimeout(function () { a.click(); }, 200);
        });
    });
    if ($promptTA) {
        $promptTA.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') generateDesigns();
        });
        $promptTA.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 220) + 'px';
        });
    }

    /* ── Lightbox ── */
    function openLightbox(url, prompt) {
        $lbImg.src = url;
        $lbDl.href = url;
        $lbDl.download = 'xzily-design.jpg';
        $lbPrompt.textContent = prompt;
        if ($lbRegen) $lbRegen.dataset.prompt = prompt;
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
    if ($lbClose) $lbClose.addEventListener('click', closeLightbox);
    if ($lbOvr)   $lbOvr.addEventListener('click', closeLightbox);
    if ($lbRegen) $lbRegen.addEventListener('click', function () {
        closeLightbox();
        generateDesigns();
    });

    /* ── History ── */
    history = lsGet(DS_HISTORY_KEY, []);
    renderHistory();

    function renderHistory() {
        if (!history.length) { $histSec.style.display = 'none'; return; }
        $histSec.style.display = 'block';
        $histGrid.innerHTML = '';
        history.slice(0, 12).forEach(function (item) {
            var url = item.urls && item.urls[0];
            if (!url) return;
            var card = document.createElement('div');
            card.className = 'aqs-ds-card-item';
            card.innerHTML =
                '<div class="aqs-ds-card-img-wrap">' +
                    '<img src="' + url + '" alt="" loading="lazy">' +
                    '<div class="aqs-ds-card-actions">' +
                        '<button class="aqs-btn aqs-btn-sm aqs-ds-view-btn">View</button>' +
                        '<a class="aqs-btn aqs-btn-sm aqs-btn-primary" href="' + url + '" download="xzily-design.jpg" target="_blank">\u2b07 HD</a>' +
                    '</div>' +
                '</div>' +
                '<div class="aqs-ds-card-footer">' +
                    '<span class="aqs-ds-card-footer-prompt">' + escHtml(item.rawPrompt || item.prompt || '') + '</span>' +
                '</div>';
            card.querySelector('.aqs-ds-view-btn').addEventListener('click', function () {
                openLightbox(url, item.rawPrompt || item.prompt || '');
            });
            $histGrid.appendChild(card);
        });
    }

    if ($clrHist) $clrHist.addEventListener('click', function () {
        if (!confirm('Clear all design history?')) return;
        history = [];
        lsSet(DS_HISTORY_KEY, []);
        renderHistory();
    });

    /* ── Helpers ── */
    function setStatus(txt) {
        if ($status)    $status.style.display = 'flex';
        if ($statusTxt) $statusTxt.textContent = txt;
    }
    function showError(msg) {
        if (!$error) return;
        $error.textContent = msg;
        $error.style.display = 'block';
        setTimeout(function () { $error.style.display = 'none'; }, 7000);
    }
    function hideError() { if ($error) $error.style.display = 'none'; }
    function escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

})();
