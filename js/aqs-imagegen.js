/* AI Quiz System — Image Generator v2 (Professional Edition)
     Powered by Pollinations AI + Groq Prompt Engine
     Developed by Omomo Excellence in corporation with Darapet Technology */
  (function () {
      'use strict';

      var selectedStyle    = '';
      var selectedStyleKey = '';   /* tracks which preset is active for dynamic negative prompt */
      var lastPrompt       = '';
      var history          = [];

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
              selectedStyle    = btn.getAttribute('data-style') || '';
              selectedStyleKey = btn.getAttribute('data-style-key') || '';
          });
      });

      /* ── Load history ── */
      history = lsGet(IG_HISTORY_KEY, []);
      renderHistory();

      /* ═══════════════════════════════════════════════════════════════
         SMART PROMPT BUILDER — professional quality suffixes
         Detects photograph vs. graphic design vs. art styles, applies
         the right quality tokens, and never mixes conflicting modifiers.
      ═══════════════════════════════════════════════════════════════ */

      var DESIGN_RE = /\b(flyer|flier|banner|poster|obituar|memorial|tribute|funeral|invitation|invite|card|thumbnail|logo|certificate|brochure|menu|social.?media|instagram|facebook|print|leaflet|handout|signage|billboard|coupon|voucher|\bad\b|advert|promotional|event.?graphic|cover.?page|announcement|pamphlet|booklet)\b/i;
      var ART_RE    = /\b(watercolor|watercolour|painting|illustration|anime|cartoon|sketch|drawing|comic|oil.?paint|acrylic|pastel|charcoal|ink|3d.?render|digital.?art|concept.?art|neon|cyberpunk)\b/i;

      /* Quality suffix for realistic photography */
      var PHOTO_SUFFIX = [
          'ultra-realistic professional photography',
          'shot on Sony A7R V with 85mm f\/1.4 prime lens',
          'natural cinematic lighting with perfect exposure',
          'razor-sharp focus, tack-sharp fine detail',
          '8K RAW photo, HDR tone-mapped',
          'award-winning studio-quality color grading',
          'masterclass composition following rule of thirds'
      ].join(', ');

      /* Quality suffix for graphic design work */
      var DESIGN_SUFFIX = [
          'professional graphic design',
          'print-ready 300 DPI quality',
          'clean crisp layout with intentional whitespace',
          'bold impactful typography hierarchy',
          'vibrant perfectly balanced color palette',
          'sharp vector-quality crisp edges',
          'premium high-resolution commercial output'
      ].join(', ');

      /* Quality suffix for HD quality selector */
      var HD_SUFFIX = 'ultra-high-definition, intricate fine details, maximum resolution, no artifacts, pristine quality';

      /* Per design-type specialist suffix */
      var DESIGN_TYPE_SUFFIX = {
          flyer:       'eye-catching promotional flyer, bold headline hierarchy, vivid colors, clear call-to-action layout, print-quality',
          banner:      'professional banner design, bold high-contrast imagery, strong text legibility, wide-format print layout, premium finish',
          poster:      'dramatic large-format poster, cinematic composition, powerful typography, high visual impact, gallery-quality print',
          obituary:    'dignified memorial design, soft muted elegant tones, classical serif typography, respectful solemn layout, tasteful ornate border',
          memorial:    'dignified memorial design, soft muted elegant tones, classical serif typography, respectful solemn layout, tasteful ornate border',
          tribute:     'heartfelt tribute design, warm golden tones, elegant script typography, emotive composition, premium paper texture',
          funeral:     'formal funeral program design, dark muted tones, dignified serif font, respectful solemn layout, tasteful understated border',
          invitation:  'elegant invitation design, decorative flourishes, refined calligraphy typography, premium card texture, luxury finish',
          card:        'professional greeting card design, clean balanced layout, crisp typography, generous whitespace, premium finish',
          thumbnail:   'high-impact YouTube thumbnail design, bold readable text, vivid eye-catching colors, strong contrast, designed for digital screens',
          logo:        'clean professional logo design, vector-style crisp geometric forms, scalable mark, strong memorable brand identity, solid background',
          certificate: 'formal official certificate design, ornate decorative border, authoritative typography, embossed seal, premium aged parchment texture',
          brochure:    'tri-fold brochure layout, organised content sections, clean professional typography, high-quality print design, rich color photos',
          menu:        'upscale restaurant menu design, appetising food photography layout, premium serif typography, elegant elegant styling, fine dining aesthetic'
      };

      function buildPrompt(raw, isHD) {
          var p = raw.trim();
          if (selectedStyle) p = p + ', ' + selectedStyle;

          var isDesign = DESIGN_RE.test(raw);
          var isArt    = ART_RE.test(raw) || ART_RE.test(selectedStyle);

          if (isDesign) {
              var specificSuffix = '';
              for (var dtype in DESIGN_TYPE_SUFFIX) {
                  if (new RegExp('\\b' + dtype + '\\b', 'i').test(raw)) {
                      specificSuffix = DESIGN_TYPE_SUFFIX[dtype];
                      break;
                  }
              }
              p += ', ' + (specificSuffix || DESIGN_SUFFIX);
          } else if (!isArt) {
              /* Pure photorealistic — add full photography suffix */
              p += ', ' + PHOTO_SUFFIX;
          } else {
              /* Art / illustration style — just add resolution quality, not camera terms */
              p += ', highly detailed, professional quality, vibrant rich colors, sharp crisp lines, award-winning artwork, 8K resolution';
          }

          if (isHD) p += ', ' + HD_SUFFIX;

          return p;
      }

      /* ── Dynamic negative prompt — excludes art-style terms only for photorealistic ── */
      function buildNegative(raw) {
          var isArt = ART_RE.test(raw) || ART_RE.test(selectedStyle);

          var baseNeg = [
              'blurry', 'blur', 'out of focus', 'motion blur',
              'noise', 'grainy', 'film grain', 'jpeg artifacts',
              'low quality', 'bad quality', 'poor quality', 'draft quality',
              'distorted', 'deformed', 'warped', 'morphed',
              'watermark', 'signature', 'copyright text', 'logo overlay',
              'overexposed', 'underexposed', 'blown highlights',
              'bad anatomy', 'extra limbs', 'missing limbs', 'fused fingers',
              'mutated', 'disfigured', 'malformed', 'ugly',
              'duplicate', 'tiling', 'repeating pattern',
              'poorly drawn', 'amateur', 'amateurish',
              'cropped', 'cut off', 'incomplete',
              'pixelated', 'low resolution', 'low res',
              'flat lighting', 'harsh shadows', 'dark'
          ];

          /* Only block art styles if the user is NOT asking for art */
          if (!isArt) {
              baseNeg = baseNeg.concat([
                  'cartoon', 'anime', 'manga', 'illustration',
                  'painting', 'drawing', 'sketch', 'digital art',
                  'plastic', 'artificial looking', 'fake', 'unrealistic skin'
              ]);
          }

          return encodeURIComponent(baseNeg.join(', '));
      }

      /* ── Pollinations image URL builder ── */
      function pollinationsImgUrl(prompt, width, height, seed, model, negative) {
          var encoded = encodeURIComponent(prompt);
          var s = seed || Math.floor(Math.random() * 9999999);
          var m = model || 'flux-pro';
          return 'https://image.pollinations.ai/prompt/' + encoded +
                 '?width=' + width + '&height=' + height +
                 '&model=' + m + '&seed=' + s +
                 '&nologo=true&private=true&enhance=true' +
                 '&negative=' + (negative || '');
      }

      /* ── Parse size string ── */
      function parseSize(sizeStr) {
          var parts = (sizeStr || '1024x1024').split('x');
          return { w: parseInt(parts[0]) || 1024, h: parseInt(parts[1]) || 1024 };
      }

      /* ═══════════════════════════════════════════════════════════════
         IMAGE LOADING — model priority:
           HD  quality → flux-pro → flux → turbo
           STD quality → flux → flux-pro → turbo
         Each model gets 55 s before timeout.
      ═══════════════════════════════════════════════════════════════ */
      function loadImageDirect(prompt, width, height, seed, model, negative) {
          return new Promise(function (resolve, reject) {
              var url = pollinationsImgUrl(prompt, width, height, seed, model, negative);
              var img = new Image();
              img.crossOrigin = 'anonymous';
              var tid = setTimeout(function () { img.src = ''; reject(new Error('timeout')); }, 60000);
              img.onload  = function () { clearTimeout(tid); resolve({ url: url, img: img }); };
              img.onerror = function () { clearTimeout(tid); reject(new Error('load error ' + model)); };
              img.src = url;
          });
      }

      async function raceImage(prompt, width, height, seed, isHD, negative) {
          /* HD: try best quality model first; Standard: speed-first */
          var models = isHD
              ? ['flux-pro', 'flux', 'turbo']
              : ['flux', 'flux-pro', 'turbo'];
          var lastErr;
          for (var i = 0; i < models.length; i++) {
              if (i > 0) await new Promise(function (r) { setTimeout(r, 2500 * i); });
              try {
                  return await loadImageDirect(prompt, width, height, seed, models[i], negative);
              } catch (e) {
                  lastErr = e;
                  console.warn('[ImageGen] Model ' + models[i] + ' failed:', e.message);
              }
          }
          throw lastErr || new Error('All models failed');
      }

      /* ═══════════════════════════════════════════════════════════════
         AI TEXT CALL — Groq primary, Pollinations fallback
      ═══════════════════════════════════════════════════════════════ */
      async function callAI(messages) {
          /* 1. Try Groq first — fastest, highest quality */
          if (typeof window.groqFetch === 'function') {
              try {
                  var ctrl = new AbortController();
                  var tid  = setTimeout(function () { ctrl.abort(); }, 15000);
                  var res  = await window.groqFetch({
                      model:       'llama-3.1-8b-instant',
                      messages:    messages,
                      max_tokens:  400,
                      temperature: 0.85
                  }, { signal: ctrl.signal });
                  clearTimeout(tid);
                  if (res.ok) {
                      var data = await res.json();
                      var text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
                      if (text.trim().length > 10) return text.trim();
                  }
              } catch (e) { /* fall through to Pollinations */ }
          }

          /* 2. Pollinations fallback */
          try {
              var ctrl2 = new AbortController();
              var tid2  = setTimeout(function () { ctrl2.abort(); }, 20000);
              var res2  = await fetch('https://text.pollinations.ai/openai', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  referrerPolicy: 'no-referrer',
                  signal: ctrl2.signal,
                  body: JSON.stringify({
                      messages: messages, model: 'openai',
                      max_tokens: 400, temperature: 0.85, private: true
                  })
              });
              clearTimeout(tid2);
              if (!res2.ok) return null;
              var data2 = await res2.json();
              var text2 = (data2.choices && data2.choices[0] &&
                           data2.choices[0].message && data2.choices[0].message.content) || '';
              return text2.trim() || null;
          } catch (e) { return null; }
      }

      /* ── Enhance Prompt ── */
      $enhBtn.addEventListener('click', async function () {
          var raw = $promptTA.value.trim();
          if (!raw) { showError('Please enter a prompt first.'); return; }

          $enhBtn.disabled = true;
          $enhBtn.textContent = '✦ Enhancing…';

          var isDesign = DESIGN_RE.test(raw);
          var isArt    = ART_RE.test(raw) || ART_RE.test(selectedStyle);

          var styleHint;
          if (isDesign) {
              styleHint = 'The user wants a GRAPHIC DESIGN (flyer, banner, poster, etc.). Enhance the prompt to produce a stunning, high-quality graphic design. Include details about typography style, color scheme, layout, mood, and intended audience. DO NOT add any camera, lens, or photography terms.';
          } else if (isArt) {
              styleHint = 'The user wants ARTISTIC or ILLUSTRATED content. Enhance the prompt with rich artistic details: brushwork style, color palette, lighting mood, artistic influences, texture. DO NOT add camera/photography terms.';
          } else {
              styleHint = 'The user wants a REALISTIC PHOTOGRAPH. Enhance the prompt with professional photography details: subject description, lighting setup, camera angle, background, mood, color temperature, depth of field. Be vivid and specific.';
          }

          var messages = [
              {
                  role: 'system',
                  content: 'You are an elite AI image prompt engineer for XZILY AI Studio. ' + styleHint +
                           ' Transform the user\'s rough idea into a richly detailed, professional-grade image generation prompt that will produce stunning commercial-quality results. ' +
                           'Be specific, evocative, and precise. Output ONLY the enhanced prompt — no intro, no explanation, no quotes. Maximum 180 words.'
              },
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

      /* ═══════════════════════════════════════════════════════════════
         GENERATE IMAGES — staggered launch to avoid rate limits.
         HD quality uses flux-pro model with stronger quality suffix.
      ═══════════════════════════════════════════════════════════════ */
      $genBtn.addEventListener('click', generateImages);
      $promptTA.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generateImages();
      });

      async function generateImages() {
          var raw = $promptTA.value.trim();
          if (!raw) { showError('Please enter a description for the image.'); return; }

          hideError();
          lastPrompt = raw;

          var isHD      = ($qualEl && $qualEl.value === 'hd');
          var fullPrompt = buildPrompt(raw, isHD);
          var negative   = buildNegative(raw);
          var size       = parseSize($sizeEl ? $sizeEl.value : '1024x1024');
          var count      = parseInt($countEl ? $countEl.value : '1') || 1;

          $genBtn.disabled = true;
          $results.style.display = 'block';
          $grid.innerHTML = '';

          setStatus('Generating ' + count + ' professional image' + (count > 1 ? 's' : '') + '… ' +
                    (isHD ? 'HD mode — using best quality AI model' : 'please wait'));

          $dlAll.style.display = count > 1 ? 'inline-flex' : 'none';

          /* Pre-create placeholder skeleton cards */
          var seeds = [];
          var cards = [];
          for (var i = 0; i < count; i++) {
              seeds.push(Math.floor(Math.random() * 9999999));
              var card = document.createElement('div');
              card.className = 'aqs-ig-card loading';
              card.innerHTML =
                  '<div class="aqs-ig-card-shimmer">' +
                      '<div class="aqs-ig-card-spinner"></div>' +
                      '<span>' + (isHD ? '🎨 HD Quality…' : 'Generating…') + '</span>' +
                  '</div>';
              $grid.appendChild(card);
              cards.push(card);
          }

          var successUrls = [];
          var settled     = 0;

          /* Staggered launch — 3.5 s gap prevents Pollinations rate-limiting */
          for (var idx = 0; idx < count; idx++) {
              (function (cardEl, imgIdx, seed) {
                  var delay = imgIdx * 3500;
                  setTimeout(async function () {
                      if (imgIdx > 0) {
                          setStatus('Generating image ' + (imgIdx + 1) + ' of ' + count + '…' +
                                    (isHD ? ' (HD mode)' : ''));
                      }
                      try {
                          var result = await raceImage(fullPrompt, size.w, size.h, seed, isHD, negative);
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
                              '<a class="aqs-btn aqs-btn-sm aqs-btn-primary aqs-ig-dl-btn" href="' +
                              finalUrl + '" download="xzily-ai-' + (imgIdx + 1) + '.jpg" target="_blank">⬇ Download HD</a>';
                          cardEl.appendChild(actions);

                          cardEl.querySelector('.aqs-ig-view-btn').addEventListener('click', function () {
                              openLightbox(finalUrl, raw);
                          });
                      } catch (_) {
                          settled++;
                          cardEl.className = 'aqs-ig-card error';
                          cardEl.innerHTML =
                              '<div class="aqs-ig-card-err">' +
                                  '⚠️ Image failed to load.<br>' +
                                  '<small>Server may be busy. Please try again.</small>' +
                                  '<button class="aqs-btn aqs-btn-sm" style="margin-top:10px" onclick="this.closest('.aqs-ig-card\').dispatchEvent(new Event(\'retry\'))">Retry</button>' +
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
              '<path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg> Generate Image';

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
          $lbDl.download = 'xzily-ai-image.jpg';
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
      if ($lbClose) $lbClose.addEventListener('click', closeLightbox);
      if ($lbOvr)   $lbOvr.addEventListener('click', closeLightbox);
      if ($lbRegen) $lbRegen.addEventListener('click', function () {
          closeLightbox();
          var p = $lbRegen.dataset.prompt || '';
          if (p) { $promptTA.value = lastPrompt || p; generateImages(); }
      });

      /* ── Download All ── */
      if ($dlAll) $dlAll.addEventListener('click', function () {
          $grid.querySelectorAll('.aqs-ig-dl-btn').forEach(function (a) {
              setTimeout(function () { a.click(); }, 200);
          });
      });

      /* ── Clear ── */
      if ($clearBtn) $clearBtn.addEventListener('click', function () {
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
              card.innerHTML =
                  '<img src="' + url + '" alt="" loading="lazy">' +
                  '<div class="aqs-ig-card-actions">' +
                      '<span class="aqs-ig-hist-prompt">' + escHtml(item.rawPrompt || '') + '</span>' +
                      '<button class="aqs-btn aqs-btn-sm aqs-ig-view-btn">View</button>' +
                  '</div>';
              card.querySelector('.aqs-ig-view-btn').addEventListener('click', function () {
                  openLightbox(url, item.rawPrompt || '');
              });
              $histGrid.appendChild(card);
          });
      }

      if ($clrHist) $clrHist.addEventListener('click', function () {
          if (!confirm('Clear all image history?')) return;
          history = [];
          lsSet(IG_HISTORY_KEY, []);
          renderHistory();
      });

      /* ── Status / Error ── */
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

      /* ── Auto-resize textarea ── */
      if ($promptTA) $promptTA.addEventListener('input', function () {
          this.style.height = 'auto';
          this.style.height = Math.min(this.scrollHeight, 200) + 'px';
      });

      function escHtml(s) {
          return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

  })();
  
