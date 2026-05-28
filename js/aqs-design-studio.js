/* AI Quiz System — Design Studio JS
   Developed by Omomo Excellence in corporation with Darapet Technology
   Powered by Pollinations AI FLUX + Groq Prompt Enhancer */

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
    var lastFullPrompt = '';
    var history        = [];
    var DS_HISTORY_KEY = 'aqs_ds_history';

    /* ── localStorage helpers ── */
    function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
    function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

    /* ── Category preset definitions ── */
    var CAT_PRESETS = {
        general: [
            { label: 'Auto',          val: '' },
            { label: 'Minimalist',    val: 'minimalist clean design, white space, simple elegant layout' },
            { label: 'Bold Modern',   val: 'bold modern design, strong typography, high contrast, striking' },
            { label: 'Vintage',       val: 'vintage retro aesthetic, muted colors, textured feel, classic typography' },
            { label: 'Dark Luxury',   val: 'dark luxury design, gold accents, premium feel, deep blacks' },
        ],
        logo: [
            { label: 'Auto',          val: '' },
            { label: 'Wordmark',      val: 'professional wordmark logo, clean bold typography, simple, vector style, white background' },
            { label: 'Lettermark',    val: 'lettermark monogram logo, geometric, clean vector, professional branding' },
            { label: 'Emblem',        val: 'emblem badge logo, circular design, detailed crest, professional quality' },
            { label: 'Minimal Icon',  val: 'minimal icon logo, single color mark, flat vector, scalable, modern' },
            { label: 'Gradient',      val: 'gradient logo design, vibrant colors, modern tech brand, clean' },
        ],
        social: [
            { label: 'Auto',          val: '' },
            { label: 'Instagram',     val: 'Instagram post design, square format, bold visual, on-brand colors, eye-catching' },
            { label: 'YouTube Thumb', val: 'YouTube thumbnail design, bold oversized text, high contrast, strong emotion, vivid colors' },
            { label: 'Facebook',      val: 'Facebook post cover design, clear headline, engaging visual, brand colors' },
            { label: 'Story / Reel',  val: 'vertical story or reel graphic, 9:16 format, bold center text, mobile-optimized' },
            { label: 'Twitter/X',     val: 'Twitter X banner or post graphic, clean bold design, high readability' },
        ],
        poster: [
            { label: 'Auto',          val: '' },
            { label: 'Event Flyer',   val: 'professional event flyer design, bold headline, vivid colors, clear layout, all text readable' },
            { label: 'Movie Poster',  val: 'dramatic cinematic movie poster, full-bleed art, powerful typography, all text sharp' },
            { label: 'Music Poster',  val: 'vibrant music event poster, energetic design, bold artist name, striking visuals' },
            { label: 'Sale Banner',   val: 'promotional sale banner design, bold discount text, vivid colors, urgent feeling' },
            { label: 'Memorial',      val: 'dignified memorial tribute design, soft tones, elegant serif typography, respectful layout' },
        ],
        '3d': [
            { label: 'Auto',          val: '' },
            { label: 'Product',       val: '3D product render, studio lighting, photorealistic, clean background, high detail' },
            { label: 'Abstract',      val: '3D abstract render, sculptural form, octane render, dramatic lighting, vivid' },
            { label: 'Character',     val: '3D character model render, stylized, cinematic lighting, high detail' },
            { label: 'Architecture',  val: '3D architectural visualization, photorealistic render, professional CGI' },
            { label: 'Logo 3D',       val: '3D logo render, chrome metallic or glass material, studio lighting, professional' },
        ],
        illustration: [
            { label: 'Auto',          val: '' },
            { label: 'Flat Art',      val: 'professional flat design illustration, clean vector, vibrant colors, modern editorial' },
            { label: 'Watercolor',    val: 'delicate watercolor illustration, soft brushstrokes, artistic, pastel tones' },
            { label: 'Ink / Line',    val: 'detailed ink line art illustration, precise strokes, professional sketch quality' },
            { label: 'Cartoon',       val: 'bold cartoon illustration style, vivid colors, clean outlines, expressive character' },
            { label: 'Concept Art',   val: 'professional concept art, detailed environment or character, cinematic mood, epic' },
        ],
        photo: [
            { label: 'Auto',          val: '' },
            { label: 'Portrait',      val: 'professional portrait photography, natural light, shallow depth of field, sharp detail' },
            { label: 'Product Photo', val: 'professional product photography, studio lighting, white background, sharp, commercial' },
            { label: 'Landscape',     val: 'stunning landscape photography, golden hour light, dramatic sky, epic scale' },
            { label: 'Street',        val: 'urban street photography, candid, dramatic light and shadow, film aesthetic' },
            { label: 'Fashion',       val: 'editorial fashion photography, model, dramatic lighting, magazine quality' },
        ],
        neon: [
            { label: 'Auto',          val: '' },
            { label: 'Cyberpunk',     val: 'cyberpunk aesthetic, neon lights, dark rainy city, vivid neon colors, futuristic' },
            { label: 'Neon Sign',     val: 'glowing neon sign design, vibrant neon tubes, dark background, retro futuristic' },
            { label: 'Synthwave',     val: 'synthwave retro aesthetic, neon grid, sunset gradient, 80s futurism' },
            { label: 'Dark Fantasy',  val: 'dark fantasy neon art, glowing mystical elements, ethereal atmosphere, dramatic' },
        ],
        ui: [
            { label: 'Auto',          val: '' },
            { label: 'Mobile App',    val: 'clean mobile app UI design, modern interface, clear navigation, on-brand colors, pixel-perfect' },
            { label: 'Dashboard',     val: 'professional SaaS dashboard UI design, data visualisation, clean layout, dark or light theme' },
            { label: 'Landing Page',  val: 'modern website landing page design, hero section, clear CTA, professional layout' },
            { label: 'E-commerce',    val: 'professional e-commerce product page UI, clean grid, clear pricing, conversion-focused' },
        ],
    };

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

    /* ── Parse size ── */
    function parseSize(val) {
        var p = (val || '1024x1024').split('x');
        return { w: parseInt(p[0]) || 1024, h: parseInt(p[1]) || 1024, label: val };
    }

    /* ── Build full Pollinations URL ── */
    function buildUrl(rawPrompt, styleSuffix, w, h, seed, isHD) {
        var base = (rawPrompt || 'abstract professional design').trim();
        var full = base + (styleSuffix ? ', ' + styleSuffix : '');
        full += ', professional quality, clean composition, no watermark, no text overlay';
        if (isHD) full += ', ultra high definition, intricate detail, maximum resolution';
        return 'https://image.pollinations.ai/prompt/' +
            encodeURIComponent(full) +
            '?width=' + w + '&height=' + h +
            '&model=flux&seed=' + seed +
            '&enhance=true&nologo=true';
    }

    /* ══════════════════════════════════════════════
       PROMPT ENHANCER — uses Groq if available,
       otherwise applies smart local enhancement
    ══════════════════════════════════════════════ */
    var ENHANCE_SUFFIXES = [
        'ultra high quality, professional studio lighting, sharp details, masterpiece, award-winning',
        'premium commercial quality, crisp details, vibrant harmonised colors, perfect composition',
        'highly detailed, professional grade, clean composition, striking visual impact, print-ready',
        'stunning professional artwork, perfect lighting, rich saturated colors, intricate detail',
        'award-winning design, bold visual hierarchy, expert color grading, pixel-perfect quality',
    ];

    if ($enhBtn) {
        $enhBtn.addEventListener('click', function () {
            var raw = ($promptTA.value || '').trim();
            if (!raw) { $promptTA.focus(); return; }
            $enhBtn.disabled = true;
            $enhBtn.textContent = 'Enhancing...';

            /* Try Groq first if available */
            if (typeof window.groqFetch === 'function') {
                window.groqFetch({
                    model: 'llama3-8b-8192',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a professional AI image prompt engineer. Enhance the user\'s design prompt to be more detailed, specific, and professional. Add relevant style, quality, lighting, and technical details. Return only the enhanced prompt, nothing else. Keep it under 200 words.'
                        },
                        { role: 'user', content: 'Enhance this design prompt: ' + raw }
                    ],
                    max_tokens: 250,
                    temperature: 0.7
                }).then(function (res) { return res.json(); })
                .then(function (data) {
                    var enhanced = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
                    if (enhanced) {
                        $promptTA.value = enhanced.trim();
                    } else {
                        localEnhance(raw);
                    }
                })
                .catch(function () { localEnhance(raw); })
                .finally(function () {
                    $enhBtn.disabled = false;
                    $enhBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Enhance Prompt';
                });
            } else {
                setTimeout(function () {
                    localEnhance(raw);
                    $enhBtn.disabled = false;
                    $enhBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Enhance Prompt';
                }, 500);
            }
        });
    }

    function localEnhance(raw) {
        var suffix = ENHANCE_SUFFIXES[Math.floor(Math.random() * ENHANCE_SUFFIXES.length)];
        $promptTA.value = raw.replace(/,\s*$/, '') + ', ' + suffix;
    }

    /* ── Generate ── */
    function generateDesigns() {
        var raw = ($promptTA.value || '').trim();
        if (!raw && !activeStyle) { $promptTA.focus(); return; }

        hideError();
        lastPrompt = raw;

        var isHD    = $qualEl && $qualEl.value === 'hd';
        var size    = parseSize($sizeEl ? $sizeEl.value : '1024x1024');
        var count   = parseInt($countEl ? $countEl.value : '1') || 1;
        var seeds   = [];
        var i;
        for (i = 0; i < count; i++) seeds.push(Math.floor(Math.random() * 9999999));

        var urls = seeds.map(function (seed) {
            return buildUrl(raw, activeStyle, size.w, size.h, seed, isHD);
        });

        $genBtn.disabled = true;
        $results.style.display = 'block';
        $grid.innerHTML = '';
        setStatus('Generating ' + count + ' design' + (count > 1 ? 's' : '') + '\u2026' + (isHD ? ' (HD mode)' : ''));
        $dlAll.style.display = count > 1 ? 'inline-flex' : 'none';

        /* Skeleton cards */
        var cards = [];
        for (i = 0; i < count; i++) {
            var card = document.createElement('div');
            card.className = 'aqs-ds-card-item loading';
            card.innerHTML =
                '<div class="aqs-ds-card-img-wrap">' +
                    '<div class="aqs-ds-card-shimmer">' +
                        '<div class="aqs-ds-card-spinner"></div>' +
                        '<span>' + (isHD ? 'HD Quality\u2026' : 'Generating\u2026') + '</span>' +
                    '</div>' +
                '</div>';
            $grid.appendChild(card);
            cards.push(card);
        }

        var settled    = 0;
        var successUrls = [];

        /* Stagger 3.5s between requests to avoid Pollinations rate-limit */
        for (var idx = 0; idx < count; idx++) {
            (function (cardEl, imgIdx, url, seed) {
                var delay = imgIdx * 3500;
                setTimeout(function () {
                    if (imgIdx > 0) setStatus('Generating design ' + (imgIdx + 1) + ' of ' + count + '\u2026');
                    var imgEl = document.createElement('img');
                    imgEl.onload = function () {
                        settled++;
                        successUrls.push(url);
                        cardEl.className = 'aqs-ds-card-item loaded';
                        cardEl.innerHTML =
                            '<div class="aqs-ds-card-img-wrap">' +
                                '<img src="' + url + '" alt="' + escHtml(raw) + '" loading="lazy">' +
                                '<div class="aqs-ds-card-actions">' +
                                    '<button class="aqs-btn aqs-btn-sm aqs-ds-view-btn">View Full</button>' +
                                    '<a class="aqs-btn aqs-btn-sm aqs-btn-primary aqs-ds-dl-btn" href="' + url + '" download="xzily-design-' + (imgIdx + 1) + '.jpg" target="_blank">\u2b07 Download HD</a>' +
                                '</div>' +
                            '</div>' +
                            '<div class="aqs-ds-card-footer">' +
                                '<span class="aqs-ds-card-footer-prompt">' + escHtml(raw || activeStyle) + '</span>' +
                                '<span class="aqs-ds-card-footer-size">' + size.label + '</span>' +
                            '</div>';
                        cardEl.querySelector('.aqs-ds-view-btn').addEventListener('click', function () {
                            openLightbox(url, raw);
                        });
                        if (settled === count) finishGeneration(raw, successUrls);
                    };
                    imgEl.onerror = function () {
                        settled++;
                        cardEl.className = 'aqs-ds-card-item error';
                        cardEl.innerHTML =
                            '<div class="aqs-ds-card-img-wrap" style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center;font-size:0.82rem;color:#ef4444;line-height:1.5;">' +
                            '\u26a0\ufe0f Image failed to load.<br><small>Server may be busy. Try again.</small></div>';
                        if (settled === count) finishGeneration(raw, successUrls);
                    };
                    imgEl.src = url;
                }, delay);
            })(cards[idx], idx, urls[idx], seeds[idx]);
        }
    }

    function finishGeneration(rawPrompt, urls) {
        $status.style.display = 'none';
        $genBtn.disabled = false;
        $genBtn.innerHTML =
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/>' +
            '<path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/>' +
            '<path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg> Generate Design';
        if (urls.length > 0) {
            history.unshift({ prompt: rawPrompt, urls: urls, ts: Date.now() });
            if (history.length > 20) history = history.slice(0, 20);
            lsSet(DS_HISTORY_KEY, history);
            renderHistory();
        }
    }

    /* ── Event listeners ── */
    if ($genBtn) $genBtn.addEventListener('click', generateDesigns);
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
                    '</div>' +
                '</div>' +
                '<div class="aqs-ds-card-footer">' +
                    '<span class="aqs-ds-card-footer-prompt">' + escHtml(item.prompt || '') + '</span>' +
                '</div>';
            card.querySelector('.aqs-ds-view-btn').addEventListener('click', function () {
                openLightbox(url, item.prompt || '');
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
