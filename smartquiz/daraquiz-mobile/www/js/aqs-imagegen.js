/* DaraSmart — Image Generator v2 (Professional Edition)
     Powered by Groq Prompt Engine
     Developed by Darapet Technology */
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

      /* ── Design keyword detector — catches any graphic/print design request ── */
      var DESIGN_RE = /\b(flyer|flier|banner|poster|obituar|memorial|tribute|funeral|invitation|invite|greeting.?card|birthday.?card|card|thumbnail|youtube|logo|certificate|brochure|menu|social.?media|instagram|facebook|twitter|tiktok|print|leaflet|handout|signage|billboard|coupon|voucher|\bad\b|advert|promotional|event.?graphic|cover.?page|announcement|pamphlet|booklet|backdrop|background.?design|infographic|timeline|chart.?design|report.?cover|album.?cover|book.?cover|magazine|newsletter|label|sticker|packaging|business.?card|id.?card|name.?card|profile.?picture|display.?picture|dp|graphic|design|template|mockup|layout|typograph|t.?shirt|hoodie|merch|apparel|jersey|uniform|mug.?design|cap.?design|bag.?design|icon.?set|ui.?design|app.?screen|website.?design|landing.?page|brand|identity)\b/i;

      /* ── Art / illustration style detector ── */
      var ART_RE = /\b(watercolor|watercolour|painting|illustration|anime|cartoon|sketch|drawing|comic|oil.?paint|acrylic|pastel|charcoal|ink|3d.?render|digital.?art|concept.?art|neon|cyberpunk|pixel.?art|mosaic|stained.?glass|graffiti|street.?art|pop.?art|abstract)\b/i;

      /* ── Quality suffix for realistic photography ── */
      var PHOTO_SUFFIX = [
          'ultra-realistic professional photography',
          'shot on Sony A7R V with 85mm f/1.4 prime lens',
          'natural cinematic lighting with perfect exposure',
          'razor-sharp focus, tack-sharp fine detail',
          '8K RAW photo, HDR tone-mapped',
          'award-winning studio-quality color grading',
          'masterclass composition following rule of thirds'
      ].join(', ');

      /* ── Quality suffix for graphic design work ── */
      var DESIGN_SUFFIX = [
          'professional commercial graphic design',
          'print-ready 300 DPI output',
          'clean structured layout with clear visual hierarchy',
          'bold impactful typographic treatment',
          'crisp sharp legible text, perfectly readable typography, all words clear and correct',
          'vibrant perfectly harmonised color palette',
          'sharp vector-quality crisp edges and elements',
          'premium high-resolution commercial finish',
          'no photographic elements, pure graphic design'
      ].join(', ');

      /* ── HD quality suffix ── */
      var HD_SUFFIX = 'ultra-high-definition, intricate fine details, maximum resolution, zero artifacts, pristine commercial quality';

      /* ── Per design-type specialist suffix — 30+ types covered ── */
      var DESIGN_TYPE_SUFFIX = {
          /* ── Promotional ── */
          flyer:        'professional A5 promotional flyer design, bold headline at top, strong visual hierarchy, vivid accent colors, clear body text zones, all text crisp and legible, print-ready, no real photography',
          banner:       'wide-format professional banner design, bold high-contrast text, crisp sharp legible headline, all words perfectly readable, powerful imagery, strong brand presence, horizontal layout, print-quality finish',
          poster:       'dramatic large-format A2 poster design, cinematic full-bleed background, powerful display typeface, sharp readable title text, strong visual focal point, all text clear and legible, gallery-quality',
          billboard:    'large-format billboard design, ultra-bold minimal text, instant visual impact, high contrast, all text sharp and readable at distance, premium outdoor advertising quality',
          signage:      'professional indoor signage design, clear bold typography, all text perfectly legible, brand-consistent colors, clean layout, excellent legibility',

          /* ── Events ── */
          invitation:   'luxury event invitation design, elegant decorative border, refined script and serif typography combination, all text crisp and readable, premium textured card feel, sophisticated color palette',
          announcement: 'eye-catching announcement design, bold headline, clean sharp readable supporting text, celebratory color accents, all text legible and clear, professional layout',
          'event.graphic': 'vibrant event graphic design, high energy composition, bold sharp date and title treatment, all text clearly readable, striking visual identity',

          /* ── Memorial ── */
          obituary:     'dignified obituary memorial design, soft warm muted tones, classical elegant serif typography, all text perfectly readable, gentle floral or dove motif, respectful solemn layout, tasteful ornate border',
          memorial:     'dignified memorial tribute design, soft muted elegant tones, classical serif typography, all text crisp and legible, gentle symbolic motifs, respectful layout, tasteful ornate border',
          tribute:      'heartfelt tribute design, warm golden and cream tones, elegant calligraphic typography, all text readable and clear, emotive composition, premium paper texture feel',
          funeral:      'dignified funeral program design, dark muted respectful tones, formal serif typography, all text sharp and legible, understated decorative border, solemn professional layout',

          /* ── Identity ── */
          logo:          'clean professional logo design, bold geometric or lettermark concept, vector-crisp sharp edges, strong scalable brand mark, solid color background, no photography',
          brand:         'comprehensive brand identity design concept, cohesive logo and typography system, professional color palette, clean presentation layout',
          'business.card': 'professional business card design, elegant layout, clear name and contact hierarchy, all text crisp and perfectly readable, brand color accents, premium finish, both sides shown',

          /* ── Social media ── */
          thumbnail:    'high-impact YouTube thumbnail design, bold oversized sharp readable text overlay, all words clearly legible, vivid contrasting colors, strong emotion-driven composition, optimised for small-screen visibility',
          instagram:    'professional Instagram post design, square format, bold visual content, strong sharp typography, all text readable, on-brand color palette, eye-catching composition',
          facebook:     'professional Facebook post or cover design, clear sharp headline text, all words legible, engaging visual, brand colors, optimised for feed visibility',
          tiktok:       'vertical TikTok graphic design, bold center text, all text sharp and readable, high contrast, vibrant gradient, designed for mobile screen, eye-catching',

          /* ── Print & document ── */
          certificate:  'formal official certificate design, ornate classical border, embossed seal area, authoritative serif typography, all text crisp and perfectly readable, gold accent elements, premium parchment-style background',
          brochure:     'professional tri-fold brochure design, organised information sections, clean professional typography, all text sharp and perfectly legible, strong cover visual, balanced color use, print-ready',
          menu:         'upscale restaurant menu design, elegant typography hierarchy, organised food categories, all text crisp and perfectly readable, premium feel, tasteful decorative accents, fine dining aesthetic',
          newsletter:   'professional newsletter layout design, clear masthead, organised column structure, strong typographic hierarchy, all text sharp and legible, branded color accents',
          'report.cover': 'professional corporate report cover design, bold sharp title treatment, all text readable, strong geometric or abstract background, authoritative feel, premium finish',
          'album.cover': 'striking music album cover design, bold artistic visual concept, strong typographic identity, all text crisp, mood-appropriate color palette, square format',
          'book.cover':  'professional book cover design, compelling visual concept, strong sharp title treatment, all text readable, back cover layout, spine, premium publishing quality',
          magazine:     'high-end magazine cover design, bold masthead, striking cover image concept, compelling sharp headline hierarchy, all text legible, newsstand-quality',
          label:        'professional product label design, clear brand name, elegant or bold typography, all text perfectly legible, product information layout, premium finish',
          packaging:    'professional product packaging design, brand-consistent visuals, clear information hierarchy, all text readable, premium material feel, 3D mockup perspective',

          /* ── Digital & app ── */
          'app.screen':  'professional mobile app UI screen design, clean modern interface, clear navigation, on-brand color system, crisp icons, all text sharp and readable, pixel-perfect layout',
          'landing.page': 'professional website landing page design, clear headline and CTA hierarchy, clean sections, professional imagery placeholders, all text legible, conversion-focused layout',
          infographic:  'professional infographic design, clear data visualisation, icon-supported sections, logical flow, vibrant color-coded elements, all text crisp and readable, clean typography',

          /* ── Apparel & merchandise ── */
          't.shirt':    'professional t-shirt graphic design, bold centered artwork, strong typographic or illustrative element, works on light and dark fabric, print-ready vector style',
          jersey:       'professional sports jersey design, bold team name and number, strong color blocking, athletic aesthetic, print-ready',
          'mug.design': 'professional mug wrap design, bold graphic centered, clear readable text, vibrant colors, 360-degree printable layout',

          /* ── Cards ── */
          card:         'professional card design, clean elegant layout, crisp sharp typography, all text perfectly readable, balanced whitespace, premium finish',
          'greeting.card': 'beautiful greeting card design, warm welcoming visual, elegant sharp typography, all text legible, inside and outside panel layout, premium card feel',
          'birthday.card': 'vibrant celebratory birthday card design, festive color palette, joyful sharp typography, all text readable, decorative elements, premium quality',

          /* ── ID & profile ── */
          'id.card':    'professional ID or membership card design, clear photo zone, bold sharp name and ID field layout, all text perfectly legible, security pattern background, brand colors, premium laminated finish',
          dp:           'professional social media profile picture design, circular crop-safe composition, bold initials or icon, strong brand colors, clean background'
      };

      function buildPrompt(raw, isHD) {
          var p = raw.trim();
          if (selectedStyle) p = p + ', ' + selectedStyle;

          var isDesign = DESIGN_RE.test(raw) || DESIGN_RE.test(selectedStyle);
          var isArt    = ART_RE.test(raw)    || ART_RE.test(selectedStyle);

          /* Design takes priority over art detection */
          if (isDesign) {
              /* Find the most specific design-type suffix */
              var specificSuffix = '';
              for (var dtype in DESIGN_TYPE_SUFFIX) {
                  var dtRx = new RegExp('\\b' + dtype.replace('.', '.?') + '\\b', 'i');
                  if (dtRx.test(raw) || dtRx.test(selectedStyle)) {
                      specificSuffix = DESIGN_TYPE_SUFFIX[dtype];
                      break;
                  }
              }
              p += ', ' + (specificSuffix || DESIGN_SUFFIX);
          } else if (isArt) {
              /* Art / illustration style — resolution quality only, no camera terms */
              p += ', highly detailed, professional quality, vibrant rich colors, sharp crisp lines, award-winning artwork, 8K resolution';
          } else {
              /* Default: realistic photograph */
              p += ', ' + PHOTO_SUFFIX;
          }

          if (isHD) p += ', ' + HD_SUFFIX;

          return p;
      }

      /* ── Dynamic negative prompt — style-aware ── */
      function buildNegative(raw) {
          var isDesign = DESIGN_RE.test(raw) || DESIGN_RE.test(selectedStyle);
          var isArt    = ART_RE.test(raw)    || ART_RE.test(selectedStyle);

          /* Universal quality negatives — always apply */
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
              /* For graphic design: block photorealistic camera artifacts AND bad text rendering */
              baseNeg = baseNeg.concat([
                  'photograph', 'photo', 'camera', 'lens flare', 'bokeh',
                  'depth of field', 'DSLR', 'RAW photo', 'realistic skin',
                  'real person', 'candid shot', 'studio photo',
                  'harsh shadows', 'overlit', 'underlit',
                  'blurry text', 'illegible text', 'unreadable text',
                  'distorted letters', 'warped typography', 'misspelled words',
                  'garbled text', 'scrambled letters', 'wrong spelling',
                  'fuzzy text', 'smeared text', 'broken letters'
              ]);
          } else if (!isArt) {
              /* For photorealistic: block art/illustration styles */
              baseNeg = baseNeg.concat([
                  'cartoon', 'anime', 'manga', 'illustration',
                  'painting', 'drawing', 'sketch', 'digital art',
                  'plastic', 'artificial', 'fake', 'unrealistic skin',
                  'flat lighting', 'harsh shadows'
              ]);
          }
          /* For art styles: no extra negatives — let the AI be creative */

          return encodeURIComponent(baseNeg.join(', '));
      }

      /* ── Pollinations image URL builder ── */
      function pollinationsImgUrl(prompt, width, height, seed, model, negative) {
          var encoded = encodeURIComponent(prompt);
          var s = seed || Math.floor(Math.random() * 9999999);
          var m = model || 'flux-pro';
          return 'https://image.pollinations.ai/prompt/' + encoded + '&noCache=' + Date.now() +
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

          /* No Groq key available — return null */
          return null;
      }

      /* ── Enhance Prompt ── */
      $enhBtn.addEventListener('click', async function () {
          var raw = $promptTA.value.trim();
          if (!raw) { showError('Please enter a prompt first.'); return; }

          $enhBtn.disabled = true;
          $enhBtn.textContent = '✦ Enhancing…';

          var isDesign = DESIGN_RE.test(raw) || DESIGN_RE.test(selectedStyle);
          var isArt    = ART_RE.test(raw)    || ART_RE.test(selectedStyle);

          var styleHint;
          if (isDesign) {
              styleHint = [
                  'The user wants a GRAPHIC DESIGN or PRINT DESIGN piece.',
                  'Enhance the prompt to describe a stunning, commercially professional graphic design.',
                  'Include: design type (flyer/poster/logo/etc), color palette (name specific colors), typography style (bold sans-serif, elegant serif, script, etc), layout structure, key visual elements, mood/tone, and target audience.',
                  'STRICTLY FORBIDDEN in the output: any camera, lens, aperture, bokeh, photograph, DSLR, or realistic photography terms.',
                  'The output must read like a graphic designer brief, not a photography brief.'
              ].join(' ');
          } else if (isArt) {
              styleHint = [
                  'The user wants ARTISTIC or ILLUSTRATED content.',
                  'Enhance with rich artistic details: specific art medium, brushwork texture, color palette mood, artistic style influences (name specific artists or movements if relevant), lighting quality, composition, and emotional atmosphere.',
                  'FORBIDDEN: camera, lens, photograph, or DSLR terms.'
              ].join(' ');
          } else {
              styleHint = [
                  'The user wants a REALISTIC PHOTOGRAPH.',
                  'Enhance with professional photography details: precise subject description, lighting setup (golden hour, studio softbox, etc), camera angle and framing, background environment, mood and color temperature, depth of field, any people and their expressions.',
                  'Be cinematic, specific, and vivid.'
              ].join(' ');
          }

          var messages = [
              {
                  role: 'system',
                  content: 'You are an elite commercial AI image prompt engineer for DaraSmart Studio. ' +
                           styleHint +
                           ' Transform the user\'s rough idea into a richly detailed, professionally crafted image generation prompt that will produce stunning commercial-quality output. ' +
                           'Be specific, evocative, and precise. Output ONLY the enhanced prompt text — no preamble, no explanation, no quotes, no markdown. Maximum 200 words.'
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
            /* Safety: re-enable button after 3 min if generation hangs */
            var _igSafety = setTimeout(function () { $genBtn.disabled = false; }, 180000);

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
                              finalUrl + '" download="daraquiz-ai-' + (imgIdx + 1) + '.jpg" target="_blank">⬇ Download HD</a>';
                          cardEl.appendChild(actions);

                          cardEl.querySelector('.aqs-ig-view-btn').addEventListener('click', function () {
                              openLightbox(finalUrl, raw);
                          });
                      } catch (_) {
                          settled++;
                          cardEl.className = 'aqs-ig-card error';
                          cardEl.innerHTML =
                              '<div class="aqs-ig-card-err">' +
                                  '&#9888;&#65039; Image failed to load.<br>' +
                                  '<small>Server may be busy. Please try again.</small>' +
                              '</div>';
                      }

                      if (settled === count) finishGeneration(fullPrompt, successUrls);
                  }, delay);
              })(cards[idx], idx, seeds[idx]);
          }
      }

      function finishGeneration(prompt, urls) {
            if (typeof _igSafety !== 'undefined') clearTimeout(_igSafety);
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
          $lbDl.download = 'daraquiz-ai-image.jpg';
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
