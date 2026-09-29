/* AI Quiz System — Image Generator v2 (Professional Edition)
     Powered by Gemini image generation + Groq prompt enhancement
     Developed by Omomo Excellence in corporation with Darapet Technology */
  (function () {
      'use strict';

      var selectedStyle    = '';
      var selectedStyleKey = '';   /* tracks which preset is active for dynamic negative prompt */
      var lastPrompt       = '';
      var history          = [];

      var lastGenerationEnd = 0;      /* tracks last generation finish time for rate-limit cooldown */
      var MIN_COOLDOWN_MS   = 6000;   /* 6 s minimum gap between generation sessions */
      var isGenerating      = false;  /* global guard — prevents double-clicks */

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

      /* ═══════════════════════════════════════════════════════════════
         AI TEXT CALL — Groq prompt enhancement
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
              } catch (e) { return null; }
          }

          /* Prompt enhancement is optional; never use a second image provider here. */
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
                  content: 'You are an elite commercial AI image prompt engineer for XZILY AI Studio. ' +
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
          var raw = ($promptTA ? $promptTA.value : '').trim();
          if (!raw) { showError('Please enter a description for the image.'); return; }
          if (isGenerating) { showError('Generation is already in progress. Please wait…'); return; }

          /* ── Rate-limit cooldown enforcement ── */
          var now = Date.now();
          var elapsed = now - lastGenerationEnd;
          if (lastGenerationEnd > 0 && elapsed < MIN_COOLDOWN_MS) {
              var waitSec = Math.ceil((MIN_COOLDOWN_MS - elapsed) / 1000);
              showError('Please wait ' + waitSec + ' second' + (waitSec !== 1 ? 's' : '') +
                        ' before generating again to avoid rate limits.');
              return;
          }

          hideError();
          isGenerating = true;
          lastPrompt   = raw;

          var isHD       = ($qualEl && $qualEl.value === 'hd');
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

          /* Staggered launch — 4 s gap between image requests */
          for (var idx = 0; idx < count; idx++) {
              (function (cardEl, imgIdx, seed) {
                  var delay = imgIdx * 4000;
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
                              finalUrl + '" download="xzily-ai-' + (imgIdx + 1) + '.jpg" target="_blank">\u2b07 Download HD</a>';
                          cardEl.appendChild(actions);

                          cardEl.querySelector('.aqs-ig-view-btn').addEventListener('click', function () {
                              openLightbox(finalUrl, raw);
                          });
                      } catch (err) {
                          settled++;
                          console.error('[ImageGen] Final failure for image ' + (imgIdx + 1) + ':', err && err.message);
                          cardEl.className = 'aqs-ig-card error';

                          /* Helpful error card — shows why and how to recover */
                          var retryBtn = document.createElement('div');
                          retryBtn.className = 'aqs-ig-card-err';
                          retryBtn.innerHTML =
                              '<div style="font-size:1.6rem;margin-bottom:8px;">&#9888;&#65039;</div>' +
                              '<strong>Image could not be generated</strong><br>' +
                              '<small style="display:block;margin-top:6px;line-height:1.5;">' +
                                  'Gemini image generation may be busy or rate-limited.<br>' +
                                  'Please <strong>wait 15–20 seconds</strong> then try again.' +
                              '</small>' +
                              '<button class="aqs-btn aqs-btn-sm" style="margin-top:10px;cursor:pointer;">' +
                                  '\u21bb Retry generation' +
                                  '</button>';
                          cardEl.innerHTML = '';
                          cardEl.appendChild(retryBtn);
                          retryBtn.querySelector('button').addEventListener('click', function () {
                              generateImages();
                          });
                      }

                      if (settled === count) finishGeneration(fullPrompt, successUrls);
                  }, delay);
              })(cards[idx], idx, seeds[idx]);
          }
      }

      function finishGeneration(prompt, urls) {
          lastGenerationEnd = Date.now();   /* record finish time for cooldown */
          isGenerating      = false;        /* release global guard */

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
