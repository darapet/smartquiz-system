/* AI Quiz System — Image Editor (img2img)
   Powered by Pollinations AI — no backend required
   Developed by Omomo Excellence in corporation with Darapet Technology */
(function () {
    'use strict';

    /* ── Local Node.js backend endpoint ── */
    var AQS_LOCAL = '';

    /* ─────────────────────────────────────────────────────────────
       UPLOAD image to local Express backend.
       Saves to /public/uploads/ and returns a hosted URL that
       Pollinations can fetch for img2img.
    ───────────────────────────────────────────────────────────── */
    function uploadImageToServer(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function (e) {
                fetch(AQS_LOCAL + '/api/upload-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imageData: e.target.result,
                        filename:  file.name,
                        mimeType:  file.type
                    })
                })
                .then(function (r) {
                    if (!r.ok) throw new Error('Upload failed (' + r.status + ')');
                    return r.json();
                })
                .then(function (data) {
                    var url = data.url || data.imageUrl || data.image_url || '';
                    if (!url) throw new Error('No URL returned from upload.');
                    /* Convert relative path to absolute for Pollinations */
                    if (url.startsWith('/')) url = window.location.origin + url;
                    resolve(url);
                })
                .catch(reject);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /* ─────────────────────────────────────────────────────────────
       AI text call — used for prompt refinement + image analysis
    ───────────────────────────────────────────────────────────── */
    async function callAI(messages) {
        try {
            var ctrl = new AbortController();
            var tid  = setTimeout(function () { ctrl.abort(); }, 20000);
            var res  = await fetch('https://text.pollinations.ai/openai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                referrerPolicy: 'no-referrer',
                signal: ctrl.signal,
                body: JSON.stringify({
                    messages: messages, model: 'openai-fast',
                    max_tokens: 250, temperature: 0.7, private: true
                })
            });
            clearTimeout(tid);
            if (!res.ok) return null;
            var data = await res.json();
            return ((data.choices && data.choices[0] &&
                     data.choices[0].message && data.choices[0].message.content) || '').trim() || null;
        } catch (e) { return null; }
    }

    /* ─────────────────────────────────────────────────────────────
       DESIGN TYPE DETECTION
       When a user uploads an image, we auto-detect what kind of
       design it is (flyer, banner, obituary, etc.) so the editor
       can apply the right style of changes.
    ───────────────────────────────────────────────────────────── */
    var detectedDesignType = '';   /* set after auto-analysis */
    var $detectedBadge     = null; /* UI element */

    var DESIGN_KEYWORDS = {
        flyer:     /\b(flyer|flier|leaflet|hand.?out)\b/i,
        banner:    /\b(banner|billboard|header.?image|cover.?photo)\b/i,
        poster:    /\b(poster|wall.?art|signage|sign)\b/i,
        obituary:  /\b(obituar|memorial|in.?memory|funeral|tribute|condolence|rip|rest.?in.?peace)\b/i,
        invitation:/\b(invitation|invite|wedding|birthday.?card|event.?card|rsvp)\b/i,
        card:      /\b(business.?card|greeting.?card|postcard|name.?card)\b/i,
        thumbnail: /\b(thumbnail|youtube|social.?media|instagram|facebook.?post)\b/i,
        logo:      /\b(logo|brand|watermark|icon)\b/i,
        certificate:/\b(certificate|diploma|award|achievement)\b/i,
        brochure:  /\b(brochure|pamphlet|booklet)\b/i,
        menu:      /\b(menu|food.?menu|restaurant.?menu)\b/i
    };

    /* Returns a design suffix tailored to the detected type */
    function designEditSuffix(type) {
        var map = {
            flyer:      'professional flyer design, clean bold typography, vivid colors, print-ready quality, sharp graphic elements',
            banner:     'professional banner layout, high-contrast text, bold visual hierarchy, crisp edges, premium quality',
            poster:     'eye-catching poster design, dramatic lighting, bold typography, high-impact visuals, print quality',
            obituary:   'dignified memorial design, soft muted tones, elegant serif typography, respectful composition, tasteful ornamental borders',
            invitation: 'elegant event invitation, decorative details, refined typography, premium card stock texture, luxurious feel',
            card:       'clean card design, professional layout, crisp text, balanced whitespace, premium print quality',
            thumbnail:  'high-contrast thumbnail, bold text overlay, vibrant eye-catching colors, optimized for digital screens',
            logo:       'clean vector-style logo, crisp edges, scalable design, professional brand identity',
            certificate:'formal certificate design, ornamental border, official typography, premium paper texture, prestigious appearance',
            brochure:   'professional brochure layout, organized sections, clean typography, high-quality print design',
            menu:       'elegant restaurant menu design, appetizing imagery, clean food typography, premium layout'
        };
        return map[type] || 'professional graphic design, clean layout, crisp typography, high quality, polished finish';
    }

    /* Detect design type from user's prompt text */
    function detectDesignFromPrompt(text) {
        for (var type in DESIGN_KEYWORDS) {
            if (DESIGN_KEYWORDS[type].test(text)) return type;
        }
        return '';
    }

    /* Auto-analyse uploaded image via AI to guess design type */
    async function analyseUploadedImage(dataUrl) {
        var messages = [
            { role: 'system', content: 'You are an image classifier. Given a description of what a user uploaded, identify what TYPE of design/image it is. Reply with ONLY ONE word from this list: flyer, banner, poster, obituary, invitation, card, thumbnail, logo, certificate, brochure, menu, photo, artwork, other. If you cannot tell, reply "other".' },
            { role: 'user',   content: 'The user uploaded an image file. Based on common use cases, what is the most likely type? The file appears to be: ' + (uploadedFile ? uploadedFile.name : 'unknown') + '. Reply with one word only.' }
        ];
        var result = await callAI(messages);
        return (result || '').toLowerCase().trim().split(/\s/)[0] || 'other';
    }

    var uploadedFile    = null;
    var uploadedFileUrl = null;
    var selectedType    = '';

    /* ── DOM refs ── */
    var $wrap = document.getElementById('aqs-imageedit-wrap');
    if (!$wrap) return;

    var $uploadZone   = document.getElementById('aqs-ie-upload-zone');
    var $fileInput    = document.getElementById('aqs-ie-file-input');
    var $uploadSec    = document.getElementById('aqs-ie-upload-section');
    var $fileInfo     = document.getElementById('aqs-ie-file-info');
    var $previewThumb = document.getElementById('aqs-ie-preview-thumb');
    var $fileNameLbl  = document.getElementById('aqs-ie-file-name-label');
    var $fileSizeLbl  = document.getElementById('aqs-ie-file-size-label');
    var $removeFile   = document.getElementById('aqs-ie-remove-file');
    var $promptTA     = document.getElementById('aqs-ie-prompt');
    var $strengthRng  = document.getElementById('aqs-ie-strength');
    var $strengthVal  = document.getElementById('aqs-ie-strength-val');
    var $sizeEl       = document.getElementById('aqs-ie-size');
    var $genBtn       = document.getElementById('aqs-ie-generate-btn');
    var $enhBtn       = document.getElementById('aqs-ie-enhance-btn');
    var $statusDiv    = document.getElementById('aqs-ie-status');
    var $statusTxt    = document.getElementById('aqs-ie-status-text');
    var $errorDiv     = document.getElementById('aqs-ie-error');
    var $resultSec    = document.getElementById('aqs-ie-result-section');
    var $beforeImg    = document.getElementById('aqs-ie-before-img');
    var $afterImg     = document.getElementById('aqs-ie-after-img');
    var $downloadBtn  = document.getElementById('aqs-ie-download-btn');
    var $regenBtn     = document.getElementById('aqs-ie-regen-btn');
    var $typeBtns     = document.querySelectorAll('.aqs-ie-type-btn');

    /* ── Edit type selector ── */
    $typeBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            $typeBtns.forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            selectedType = btn.getAttribute('data-type') || '';
        });
    });

    /* ── Strength slider label ── */
    $strengthRng.addEventListener('input', function () {
        $strengthVal.textContent = Math.round(parseFloat(this.value) * 100) + '%';
    });

    /* ── Upload zone — click + drag/drop ── */
    $uploadZone.addEventListener('click', function () { $fileInput.click(); });
    $fileInput.addEventListener('change', function () { if (this.files[0]) setFile(this.files[0]); });

    $uploadZone.addEventListener('dragover', function (e) { e.preventDefault(); $uploadZone.classList.add('drag-over'); });
    $uploadZone.addEventListener('dragleave', function () { $uploadZone.classList.remove('drag-over'); });
    $uploadZone.addEventListener('drop', function (e) {
        e.preventDefault();
        $uploadZone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
    });

    function setFile(file) {
        if (!file.type.startsWith('image/')) {
            showError('Please upload an image file (JPEG, PNG, or WebP).');
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            showError('Image is too large. Please use a file under 8 MB.');
            return;
        }
        uploadedFile    = file;
        uploadedFileUrl = null;
        detectedDesignType = '';

        var reader = new FileReader();
        reader.onload = function (e) {
            $previewThumb.src = e.target.result;
            /* Kick off silent background AI analysis */
            autoDetectDesignType(e.target.result, file.name);
        };
        reader.readAsDataURL(file);

        $fileNameLbl.textContent = file.name;
        $fileSizeLbl.textContent = formatBytes(file.size);
        $uploadSec.style.display = 'none';
        $fileInfo.style.display  = 'block';
        $resultSec.style.display = 'none';
        hideError();
    }

    /* Show a small badge under the file info when design type is detected */
    function autoDetectDesignType(dataUrl, filename) {
        /* First try to detect from filename */
        var fromName = detectDesignFromPrompt(filename);
        if (fromName) {
            detectedDesignType = fromName;
            showDetectedBadge(fromName);
            return;
        }
        /* If filename didn't help, ask AI (async, fire-and-forget) */
        analyseUploadedImage(dataUrl).then(function (type) {
            if (type && type !== 'other' && type !== 'photo') {
                detectedDesignType = type;
                showDetectedBadge(type);
            }
        });
    }

    function showDetectedBadge(type) {
        var existing = $fileInfo.querySelector('.aqs-ie-detected-badge');
        if (existing) existing.remove();
        var badge = document.createElement('div');
        badge.className = 'aqs-ie-detected-badge';
        badge.style.cssText = 'margin-top:6px;font-size:12px;color:#7c6cf8;font-weight:600;';
        badge.textContent = '🎨 Detected: ' + type.charAt(0).toUpperCase() + type.slice(1) + ' — edit prompts will be optimised';
        $fileInfo.appendChild(badge);
    }

    /* ── Remove file ── */
    $removeFile.addEventListener('click', function () {
        uploadedFile       = null;
        uploadedFileUrl    = null;
        detectedDesignType = '';
        $fileInput.value   = '';
        $previewThumb.src  = '';
        $fileInfo.style.display  = 'none';
        $uploadSec.style.display = 'block';
        $resultSec.style.display = 'none';
        var badge = $fileInfo.querySelector('.aqs-ie-detected-badge');
        if (badge) badge.remove();
        hideError();
    });

    /* ── Build the full edit prompt ── */
    function buildEditPrompt(raw) {
        var p    = raw.trim();
        var type = detectDesignFromPrompt(raw) || detectedDesignType || selectedType || '';

        /* Prefix with selected type button label if any */
        if (selectedType) p = selectedType + ' ' + p;

        /* Append quality suffix tailored to the design type */
        var suffix = designEditSuffix(type);
        p += ', ' + suffix;
        return p;
    }

    /* ─────────────────────────────────────────────────────────────
       img2img via Pollinations — direct + proxy race
    ───────────────────────────────────────────────────────────── */
    function pollinationsEditUrl(prompt, imageUrl, width, height, strength, seed) {
        var encoded    = encodeURIComponent(prompt);
        var encodedImg = encodeURIComponent(imageUrl);
        var s          = seed || Math.floor(Math.random() * 9999999);
        return 'https://image.pollinations.ai/prompt/' + encoded +
               '?model=flux&image=' + encodedImg +
               '&width=' + width + '&height=' + height +
               '&seed=' + s + '&nologo=true&private=true&enhance=true' +
               '&strength=' + strength +
               '&negative=blurry%2Cblur%2Cout+of+focus%2Cnoise%2Cbad+quality%2Cdistorted%2Cdeformed';
    }

    function loadImgDirect(prompt, imageUrl, w, h, strength, seed) {
        return new Promise(function (resolve, reject) {
            var url = pollinationsEditUrl(prompt, imageUrl, w, h, strength, seed);
            var img = new Image();
            img.crossOrigin = 'anonymous';
            var tid = setTimeout(function () { img.src = ''; reject(new Error('timeout')); }, 65000);
            img.onload  = function () { clearTimeout(tid); resolve(url); };
            img.onerror = function () { clearTimeout(tid); reject(new Error('load error')); };
            img.src = url;
        });
    }

    /* Retry with a different seed if first attempt fails */
    async function raceEdit(prompt, imageUrl, w, h, strength, seed) {
        /* Try direct first */
        try {
            return await loadImgDirect(prompt, imageUrl, w, h, strength, seed);
        } catch (_) {}
        /* Retry with fresh seed */
        var seed2 = Math.floor(Math.random() * 9999999);
        try {
            return await loadImgDirect(prompt, imageUrl, w, h, strength, seed2);
        } catch (err) {
            throw new Error('Edit failed. Try adjusting the strength or rephrasing your prompt.');
        }
    }

    /* ── Enhance / Refine Prompt ── */
    $enhBtn.addEventListener('click', async function () {
        var raw = $promptTA.value.trim();
        if (!raw) { showError('Please enter your edit description first.'); return; }
        $enhBtn.disabled = true;
        $enhBtn.textContent = '✦ Refining…';

        var type = detectDesignFromPrompt(raw) || detectedDesignType || '';
        var typeHint = type ? ' The image appears to be a ' + type + '.' : '';
        var messages = [
            { role: 'system', content: 'You are an expert AI image editing prompt engineer. The user wants to edit an image.' + typeHint + ' Take their rough description and rewrite it as a precise, vivid editing instruction. Describe the exact changes: colors, style, elements to add/remove/change. Be specific. Output ONLY the refined prompt, max 90 words.' },
            { role: 'user',   content: raw }
        ];
        var refined = await callAI(messages);

        $enhBtn.disabled = false;
        $enhBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Refine Prompt';
        if (refined) {
            $promptTA.value = refined.replace(/^["']|["']$/g, '').trim();
        } else {
            showError('Could not refine prompt. Please try again.');
        }
    });

    /* ─────────────────────────────────────────────────────────────
       MAIN: Generate Edit
    ───────────────────────────────────────────────────────────── */
    $genBtn.addEventListener('click', runEdit);
    if ($regenBtn) $regenBtn.addEventListener('click', runEdit);

    async function runEdit() {
        if (!uploadedFile) { showError('Please upload an image first.'); return; }
        var raw = $promptTA.value.trim();
        if (!raw) { showError('Please describe how you want to edit the image.'); return; }

        hideError();
        var fullPrompt = buildEditPrompt(raw);
        var parts      = ($sizeEl ? $sizeEl.value : '1024x1024').split('x');
        var w          = parseInt(parts[0]) || 1024;
        var h          = parseInt(parts[1]) || 1024;
        var strength   = parseFloat($strengthRng.value) || 0.7;
        var seed       = Math.floor(Math.random() * 9999999);

        $genBtn.disabled = true;
        $genBtn.innerHTML = '<svg class="aqs-ig-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Working…';
        $statusDiv.style.display = 'flex';
        setStatus('Uploading your image…');

        try {
            /* Step 1: upload to local server to get a public URL */
            if (!uploadedFileUrl) {
                uploadedFileUrl = await uploadImageToServer(uploadedFile);
            }

            setStatus('Applying AI edit… please wait (20–40 seconds)');

            /* Step 2: show original in before panel */
            $beforeImg.src = $previewThumb.src;

            /* Step 3: Pollinations img2img */
            var editedUrl = await raceEdit(fullPrompt, uploadedFileUrl, w, h, strength, seed);

            /* Step 4: display result */
            $afterImg.src     = editedUrl;
            $downloadBtn.href = editedUrl;
            $downloadBtn.download = 'darapet-ai-edit.jpg';

            $statusDiv.style.display = 'none';
            $resultSec.style.display = 'block';

        } catch (err) {
            $statusDiv.style.display = 'none';
            showError(err.message || 'Edit failed. Please try again.');
            uploadedFileUrl = null; /* allow retry with fresh upload */
        }

        $genBtn.disabled = false;
        $genBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Apply AI Edit';
    }

    /* ── Helpers ── */
    function setStatus(txt) { if ($statusTxt) $statusTxt.textContent = txt; }
    function showError(msg) {
        if (!$errorDiv) return;
        $errorDiv.textContent = msg;
        $errorDiv.style.display = 'block';
        setTimeout(function () { $errorDiv.style.display = 'none'; }, 9000);
    }
    function hideError() { if ($errorDiv) $errorDiv.style.display = 'none'; }
    function formatBytes(b) {
        if (b < 1024) return b + ' B';
        if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
        return (b / (1024 * 1024)).toFixed(1) + ' MB';
    }

})();
