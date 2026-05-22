/* AI Quiz System - Main JS v1.4.1 */
(function ($) {
    'use strict';

    function escHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ── renderMath: safely render LaTeX inside text using KaTeX ──────────────
       Handles $$...$$, $...$, \[...\], \(...\).
       Falls back to escHtml if KaTeX is not yet loaded or expression is invalid.
    ─────────────────────────────────────────────────────────────────────────── */

    /* Pre-process text to fix common AI math formatting mistakes before KaTeX sees it.
       Only touches the plain-text segments between existing $ delimiters so it never
       breaks math that is already correctly wrapped. */
    function fixAIMathFormatting(text) {
        if (!text) return text;

        /* Split into alternating [plain, math, plain, math ...] chunks.
           The capturing group keeps delimiters in the result so we can
           skip segments that are already correctly wrapped. */
        var mathRe = /(\$\$[\s\S]+?\$\$|\$[^\$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/;
        var chunks = String(text).split(mathRe);

        var fixed = chunks.map(function (chunk, idx) {
            if (idx % 2 === 1) return chunk; /* already-delimited math — leave as-is */

            var c = chunk;

            /* ── 1. Bare LaTeX commands that lack $ delimiters ─────────────────
               Handles both single-backslash (\cmd) and double (\\cmd) that
               survive a JSON serialisation round-trip.                          */

            /* \sqrt{...}  \sqrt(...)  sqrt{...}  sqrt(...) */
            c = c.replace(/\\{1,2}sqrt\s*\{([^}]+)\}/g,  function (_, i) { return '$\\sqrt{' + i + '}$'; });
            c = c.replace(/\\{1,2}sqrt\s*\(([^)]+)\)/g,  function (_, i) { return '$\\sqrt{' + i + '}$'; });
            c = c.replace(/\bsqrt\s*\{([^}]+)\}/g,       function (_, i) { return '$\\sqrt{' + i + '}$'; });
            c = c.replace(/\bsqrt\s*\(([^)]+)\)/g,       function (_, i) { return '$\\sqrt{' + i + '}$'; });

            /* \frac{a}{b} */
            c = c.replace(/\\{1,2}frac\s*\{([^}]+)\}\s*\{([^}]+)\}/g,
                function (_, n, d) { return '$\\frac{' + n + '}{' + d + '}$'; });

            /* operator commands: \pm \times \div \cdot \leq \geq \neq … */
            c = c.replace(/\\{1,2}(pm|times|div|cdot|leq|geq|neq|approx|infty|nabla|partial|forall|exists)\b/g,
                function (_, cmd) { return '$\\' + cmd + '$'; });

            /* Greek letters */
            c = c.replace(/\\{1,2}(pi|theta|alpha|beta|gamma|delta|Delta|Sigma|lambda|mu|sigma|phi|varphi|psi|omega|Omega|epsilon|varepsilon|eta|zeta|xi|rho|kappa|nu|tau|chi|iota|upsilon|Gamma|Lambda|Xi|Pi|Phi|Psi)\b/g,
                function (_, cmd) { return '$\\' + cmd + '$'; });

            /* function names: \int \sum \prod \lim \log \ln \sin \cos \tan … */
            c = c.replace(/\\{1,2}(int|oint|sum|prod|lim|log|ln|exp|sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh)\b/g,
                function (_, cmd) { return '$\\' + cmd + '$'; });

            /* decorated letters: \vec{x} \hat{x} \bar{x} \overline{...} etc. */
            c = c.replace(/\\{1,2}(vec|hat|bar|dot|ddot|tilde|overline|underline|overbrace|underbrace)\s*\{([^}]+)\}/g,
                function (_, cmd, arg) { return '$\\' + cmd + '{' + arg + '}$'; });

            /* font commands: \mathbf{} \mathit{} \mathrm{} etc. */
            c = c.replace(/\\{1,2}(mathbf|mathit|mathrm|mathbb|mathcal|mathsf|mathtt)\s*\{([^}]+)\}/g,
                function (_, cmd, arg) { return '$\\' + cmd + '{' + arg + '}$'; });

            /* ── 2. Unicode math symbols → LaTeX ─────────────────────────────── */
            c = c.replace(/√\s*\(([^)]+)\)/g,   function (_, i) { return '$\\sqrt{' + i + '}$'; }); /* √(expr) */
            c = c.replace(/√\s*([A-Za-z\d]+)/g, function (_, i) { return '$\\sqrt{' + i + '}$'; }); /* √x */
            c = c.replace(/([A-Za-z\d])²/g,     function (_, b) { return '$' + b + '^{2}$'; });
            c = c.replace(/([A-Za-z\d])³/g,     function (_, b) { return '$' + b + '^{3}$'; });
            /* Comparison / arithmetic operators */
            c = c.replace(/≤/g,'$\\leq$').replace(/≥/g,'$\\geq$')
                 .replace(/≠/g,'$\\neq$').replace(/≈/g,'$\\approx$')
                 .replace(/±/g,'$\\pm$').replace(/∓/g,'$\\mp$')
                 .replace(/×/g,'$\\times$').replace(/÷/g,'$\\div$')
                 .replace(/∞/g,'$\\infty$');
            /* Greek (Unicode) */
            c = c.replace(/π/g,'$\\pi$').replace(/θ/g,'$\\theta$')
                 .replace(/α/g,'$\\alpha$').replace(/β/g,'$\\beta$')
                 .replace(/γ/g,'$\\gamma$').replace(/δ/g,'$\\delta$')
                 .replace(/λ/g,'$\\lambda$').replace(/μ/g,'$\\mu$')
                 .replace(/σ/g,'$\\sigma$').replace(/Σ/g,'$\\Sigma$')
                 .replace(/Δ/g,'$\\Delta$').replace(/Ω/g,'$\\Omega$')
                 .replace(/φ/g,'$\\phi$').replace(/ψ/g,'$\\psi$');
            /* Arrows / set symbols */
            c = c.replace(/→/g,'$\\to$').replace(/←/g,'$\\leftarrow$')
                 .replace(/⇒/g,'$\\Rightarrow$').replace(/⇔/g,'$\\Leftrightarrow$')
                 .replace(/∈/g,'$\\in$').replace(/∉/g,'$\\notin$')
                 .replace(/⊂/g,'$\\subset$').replace(/⊃/g,'$\\supset$')
                 .replace(/∩/g,'$\\cap$').replace(/∪/g,'$\\cup$')
                 .replace(/∫/g,'$\\int$').replace(/∑/g,'$\\sum$').replace(/∏/g,'$\\prod$');

            /* ── 3. Bare caret superscripts: x^2  a^{n+1}  2^n ──────────────── */
            c = c.replace(/([A-Za-z\d])\^(\{[^}]+\}|[A-Za-z\d]+)/g,
                function (m, base, exp) { return '$' + base + '^{' + exp.replace(/^\{|\}$/g, '') + '}$'; });

            /* ── 4. Bare underscore subscripts: H_2  CO_2  x_n  a_{i+1} ──────
               Only wrap when base is a letter and subscript is a digit or
               brace-wrapped content (avoids mangling prose underscores).        */
            c = c.replace(/([A-Za-z])_(\{[^}]+\}|\d+)/g,
                function (m, base, sub) { return '$' + base + '_{' + sub.replace(/^\{|\}$/g, '') + '}$'; });

            /* ── 5. Simple numeric fractions: 1/2  3/4 (space/boundary delimited) */
            c = c.replace(/(^|[\s(=])(\d+)\/(\d+)(?=[\s),.\?!]|$)/g,
                function (m, pre, n, d) { return pre + '$\\frac{' + n + '}{' + d + '}$'; });

            return c;
        });

        return fixed.join('');
    }

    /* renderMath — uses the same proven placeholder approach as the Studio renderer.
       1. Fix common AI formatting mistakes (fixAIMathFormatting)
       2. Normalise delimiter variants  →  $ / $$
       3. Extract & render display math ($$) into placeholders
       4. Extract & render inline math  ($)  into placeholders
       5. HTML-escape remaining plain text
       6. Restore all placeholders                                              */
    /* ── Math/Science subject detection ── */
      function isMathSubject(subject, textContent) {
          var mathKeywords = [
              'math', 'mathematics', 'algebra', 'geometry', 'calculus', 'trigonometry',
              'statistics', 'arithmetic', 'number', 'equation', 'physics', 'chemistry',
              'science', 'biology', 'engineering', 'formula', 'theorem', 'integral',
              'derivative', 'probability', 'quantitative', 'numerical'
          ];
          var combined = ((subject || '') + ' ' + (textContent || '')).toLowerCase();
          return mathKeywords.some(function(kw) { return combined.indexOf(kw) !== -1; });
      }

      function renderMath(text) {
        if (!text) return '';
        if (typeof katex === 'undefined') return escHtml(text);

        /* Step 1 — fix bare LaTeX / unicode the AI forgot to delimit */
        var t = fixAIMathFormatting(String(text));

        /* Step 2 — normalise delimiter variants → $ / $$ */
        t = t.replace(/\\\[([\s\S]+?)\\\]/g,  function (_, m) { return '$$' + m + '$$'; });
        t = t.replace(/\\\(([\s\S]+?)\\\)/g,  function (_, m) { return '$'  + m + '$';  });
        t = t.replace(/\\begin\{equation\*?\}([\s\S]+?)\\end\{equation\*?\}/g,
                      function (_, m) { return '$$' + m + '$$'; });
        t = t.replace(/\\begin\{align\*?\}([\s\S]+?)\\end\{align\*?\}/g,
                      function (_, m) { return '$$' + m + '$$'; });

        /* Step 3 — extract display math $$...$$ */
        var displayMath = [];
        t = t.replace(/\$\$([\s\S]+?)\$\$/g, function (_, math) {
            var rendered;
            try {
                rendered = '<span class="aqs-katex-display">' +
                    katex.renderToString(math.trim(), { displayMode: true,  throwOnError: false, strict: 'ignore' }) +
                    '</span>';
            } catch (e) { rendered = escHtml('$$' + math + '$$'); }
            displayMath.push(rendered);
            return '\x00DM' + (displayMath.length - 1) + '\x00';
        });

        /* Step 4 — extract inline math $...$ */
        var inlineMath = [];
        t = t.replace(/\$([^$\n]{1,500}?)\$/g, function (_, math) {
            /* skip bare currency amounts like $5 or $1,000 */
            if (/^\d[\d,\.]*$/.test(math.trim())) return '$' + math + '$';
            var rendered;
            try {
                rendered = katex.renderToString(math.trim(), { displayMode: false, throwOnError: false, strict: 'ignore' });
            } catch (e) { rendered = escHtml('$' + math + '$'); }
            inlineMath.push(rendered);
            return '\x00IM' + (inlineMath.length - 1) + '\x00';
        });

        /* Step 5 — HTML-escape all remaining plain text (split on placeholders) */
        var parts = t.split(/(\x00(?:DM|IM)\d+\x00)/);
        var html  = parts.map(function (chunk) {
            if (/^\x00(DM|IM)\d+\x00$/.test(chunk)) return chunk; /* placeholder — keep as-is */
            return escHtml(chunk);
        }).join('');

        /* Step 6 — restore placeholders */
        inlineMath.forEach(function (r, i)  { html = html.split('\x00IM'  + i + '\x00').join(r); });
        displayMath.forEach(function (r, i) { html = html.split('\x00DM'  + i + '\x00').join(r); });

        return html;
    }

    /* =========================================================
       HOST DASHBOARD
    ========================================================= */
    $(document).ready(function () {

        /* ── Show on-start ads on every plugin page ── */
        initPageAds();

        if ($('#aqs-quiz-list').length) {
            /* Wait for Firebase auth to resolve before loading quizzes.
               If auth is already known, fire immediately; otherwise listen. */
            function tryLoadQuizzes() {
                if (window._aqsFirebaseUser) {
                    loadQuizzes();
                } else {
                    $('#aqs-quiz-list').html('<p class="aqs-loading">Signing you in…</p>');
                    document.addEventListener('aqs:authchange', function onAuth(ev) {
                        document.removeEventListener('aqs:authchange', onAuth);
                        if (ev.detail && ev.detail.user) {
                            loadQuizzes();
                        } else {
                            $('#aqs-quiz-list').html('<p class="aqs-empty" style="text-align:center;padding:32px;color:#ef4444;">⚠️ Please <a href="login.html">log in</a> to view your quizzes.</p>');
                        }
                    });
                }
            }
            tryLoadQuizzes();

            $(document).on('click', '#aqs-close-attendance',  function () { $('#aqs-attendance-modal').hide(); });
            $(document).on('click', '#aqs-close-analysis',    function () { $('#aqs-analysis-modal').hide(); });
            $(document).on('click', '#aqs-close-leaderboard', function () { $('#aqs-leaderboard-modal').hide(); });
            $(document).on('click', '#aqs-close-activity',    function () { $('#aqs-activity-modal').hide(); });
            $(document).on('click', '#aqs-cancel-delete-btn', function () { $('#aqs-activity-modal').hide(); });
            $(document).on('click', '.aqs-copy-url-btn', function () {
                var url = $(this).data('url') || '';
                if (!url) return;
                navigator.clipboard.writeText(url).then(function () {
                    var $btn = $(this);
                    $btn.text('✅ Copied!');
                    setTimeout(function () { $btn.text('📋 Copy Link'); }, 2000);
                }.bind(this)).catch(function () {
                    prompt('Copy this link:', url);
                });
            });
            $(document).on('click', '.aqs-modal', function (e) {
                if ($(e.target).hasClass('aqs-modal')) $(this).hide();
            });

            var currentAttendanceToken = '';
            $(document).on('click', '.aqs-view-attendance-btn', function () {
                currentAttendanceToken = $(this).data('token') || '';
            });
            $(document).on('click', '#aqs-show-leaderboard-btn', function () {
                if (!currentAttendanceToken) return;
                $('#aqs-leaderboard-modal').css('display','flex');
                $('#aqs-leaderboard-body').html('<div class="aqs-loading">Loading leaderboard...</div>');
                $.post(AQS.ajax_url, { action: 'aqs_get_leaderboard', nonce: AQS.nonce, token: currentAttendanceToken }, function (res) {
                    if (!res.success) { $('#aqs-leaderboard-body').html('<p>Error loading leaderboard.</p>'); return; }
                    $('#aqs-lb-modal-title').text('🏆 Leaderboard — ' + res.data.quiz_title);
                    $('#aqs-leaderboard-body').html(buildLeaderboardHtml(res.data.leaderboard));
                });
            });
        }

    }); /* end document.ready */

    /* =========================================================
       PAGE-LEVEL ADS (shown on every plugin page at load time)
    ========================================================= */
    function initPageAds() {
        /* Don't double-fire if the quiz-taking code handles ads itself */
        if ($('#aqs-take-quiz').length) return;

        $.ajax({
            url:      AQS.ajax_url,
            type:     'POST',
            dataType: 'json',
            data:     { action: 'aqs_get_active_ads', nonce: AQS.public_nonce, trigger: 'on_start', context: 'taker' },
            success:  function (res) {
                if (!res || !res.success || !res.data || !res.data.length) return;
                var ad = res.data[0];
                showPageAd(ad);
            }
        });
    }

    function showPageAd(ad) {
        /* Respect show_again_hours using localStorage */
        var storageKey = 'aqs_ad_seen_' + ad.id;
        var seenAt     = parseInt(localStorage.getItem(storageKey) || '0', 10);
        var hoursAgo   = (Date.now() - seenAt) / 3600000;
        if (seenAt && hoursAgo < (ad.show_again_hours || 24)) return;

        /* Build overlay */
        var btnHtml = '';
        if (ad.button_label && ad.button_url) {
            btnHtml = '<a href="' + escHtml(ad.button_url) + '" target="_blank" rel="noopener" class="aqs-ad-cta-btn">' + escHtml(ad.button_label) + '</a>';
        }
        var bodyHtml = ad.body_text ? '<p class="aqs-ad-body">' + escHtml(ad.body_text) + '</p>' : '';

        var overlay = $(
            '<div id="aqs-page-ad-overlay" class="aqs-ad-overlay" role="dialog" aria-modal="true">' +
              '<div class="aqs-ad-box">' +
                '<button class="aqs-ad-close" aria-label="Close ad">&times;</button>' +
                '<img src="' + escHtml(ad.image_url) + '" class="aqs-ad-image" alt="' + escHtml(ad.title) + '" />' +
                '<div class="aqs-ad-content">' +
                  '<h3 class="aqs-ad-title">' + escHtml(ad.title) + '</h3>' +
                  bodyHtml + btnHtml +
                '</div>' +
              '</div>' +
            '</div>'
        );

        $('body').append(overlay);
        overlay.fadeIn(300);

        /* Mark as seen */
        localStorage.setItem(storageKey, Date.now().toString());

        /* Track impression */
        $.post(AQS.ajax_url, { action: 'aqs_track_impression', ad_id: ad.id });

        /* Close handlers */
        overlay.find('.aqs-ad-close').on('click', function () { overlay.fadeOut(200, function () { overlay.remove(); }); });
        overlay.on('click', function (e) { if ($(e.target).is(overlay)) overlay.fadeOut(200, function () { overlay.remove(); }); });
    }

    /* Quiz data cache for detail view */
    var quizzesData = {};

    function loadQuizzes() {
        $('#aqs-quiz-list').html('<p class="aqs-loading">Loading quizzes...</p>');
        $.ajax({
            url:      AQS.ajax_url,
            type:     'POST',
            dataType: 'json',
            data:     { action: 'aqs_get_quizzes', nonce: AQS.nonce },
            error: function (xhr, status, err) {
                $('#aqs-quiz-list').html('<p class="aqs-empty" style="text-align:center;padding:32px;color:#ef4444;">⚠️ Connection error — please refresh the page. (' + (err || status) + ')</p>');
            },
            success: function (res) {
            if (!res || !res.success) {
                var msg = (res && res.data && typeof res.data === 'string') ? res.data : 'Could not load quizzes — please refresh.';
                $('#aqs-quiz-list').html('<p class="aqs-empty" style="text-align:center;padding:32px;color:#ef4444;">⚠️ ' + msg + '</p>');
                return;
            }
            const quizzes = res.data;
            quizzesData = {};
            let total = quizzes.length, published = 0, draft = 0;
            let html = '';

            quizzes.forEach(function (q) {
                quizzesData[q.id] = q;
                if (q.status === 'published') published++; else draft++;

                const statusBadge = q.status === 'published'
                    ? '<span class="aqs-badge aqs-badge-success">✅ Published</span>'
                    : '<span class="aqs-badge aqs-badge-draft">📝 Draft</span>';

                const hs = q.host_status || 'active';
                const hostBadge = hs === 'disabled'
                    ? '<span class="aqs-badge aqs-badge-warn">⛔ Disabled</span>'
                    : '';

                html += `<div class="aqs-quiz-list-item">
                    <div class="aqs-quiz-list-info">
                        <div class="aqs-quiz-list-title">${escHtml(q.title)}</div>
                        <div class="aqs-quiz-list-meta">
                            ${statusBadge}${hostBadge}
                            <span class="aqs-quiz-list-meta-txt">📚 ${escHtml(q.subject)}</span>
                            <span class="aqs-quiz-list-meta-txt">❓ ${q.num_questions} Qs</span>
                            <span class="aqs-quiz-list-meta-txt">⏱ ${q.time_limit} min</span>
                        </div>
                    </div>
                    <div class="aqs-quiz-list-actions">
                        <button class="aqs-btn aqs-btn-sm aqs-view-quiz-btn" data-id="${q.id}">👁 View</button>
                        <button class="aqs-btn aqs-btn-sm" style="background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;" onclick="location.href='create-quiz.html?edit=${q.id}'">✏️ Edit</button>
                        ${hs === 'disabled'
                            ? `<button class="aqs-btn aqs-btn-sm aqs-btn-success aqs-toggle-status-btn" data-id="${q.id}" data-action="enable">✅ Enable</button>`
                            : `<button class="aqs-btn aqs-btn-sm aqs-btn-warn aqs-toggle-status-btn" data-id="${q.id}" data-action="disable">⛔ Disable</button>`
                        }
                        <button class="aqs-btn aqs-btn-sm aqs-view-attendance-btn" data-id="${q.id}" data-title="${escHtml(q.title)}" data-token="${escHtml(q.quiz_token || '')}">📊 Attendance</button>
                        <button class="aqs-btn aqs-btn-sm aqs-print-quiz-pdf-btn" data-id="${q.id}" data-title="${escHtml(q.title)}">🖨 Print</button>
                        <button class="aqs-btn aqs-btn-sm aqs-btn-danger aqs-delete-btn" data-id="${q.id}" data-title="${escHtml(q.title)}">🗑 Delete</button>
                    </div>
                </div>`;
            });

            if (!html) html = `<p class="aqs-empty" style="text-align:center;padding:32px;">No quizzes yet. <a href="${AQS.create_page_url}">Create one →</a></p>`;
            $('#aqs-quiz-list').html(html);
            $('#stat-total').text(total);
            $('#stat-published').text(published);
            $('#stat-draft').text(draft);
            } /* end success */
        }); /* end $.ajax */
    }

    /* ── Quiz Detail View ── */
    $(document).on('click', '.aqs-view-quiz-btn', function () {
        var id = $(this).data('id');
        var q  = quizzesData[id];
        if (!q) return;
        var hs = q.host_status || 'active';

        var statusBadge = q.status === 'published'
            ? '<span class="aqs-badge aqs-badge-success">✅ Published</span>'
            : '<span class="aqs-badge aqs-badge-draft">📝 Draft</span>';
        var hostBadge = hs === 'disabled'
            ? '<span class="aqs-badge aqs-badge-warn">⛔ Disabled</span>'
            : '<span class="aqs-badge aqs-badge-success">✅ Active</span>';

        var linkHtml = (q.status === 'published' && q.quiz_url)
            ? '<div class="aqs-link-cell" style="flex-direction:column;gap:5px;">' +
              '<input type="text" value="' + escHtml(q.quiz_url) + '" readonly onclick="this.select()" style="width:100%;font-size:0.78rem;" />' +
              '<button class="aqs-btn aqs-btn-sm aqs-copy-url-btn" data-url="' + escHtml(q.quiz_url) + '">📋 Copy Link</button></div>'
            : '<span style="color:#6b7280;">Not yet published</span>';

        var publishBtn = (q.status === 'draft')
            ? '<button class="aqs-btn aqs-btn-sm aqs-btn-success aqs-publish-btn" data-id="' + q.id + '">🚀 Publish</button>' : '';
        var toggleBtn = (hs === 'disabled')
            ? '<button class="aqs-btn aqs-btn-sm aqs-btn-success aqs-toggle-status-btn" data-id="' + q.id + '" data-action="enable">✅ Enable</button>'
            : '<button class="aqs-btn aqs-btn-sm aqs-btn-warn aqs-toggle-status-btn" data-id="' + q.id + '" data-action="disable">⛔ Disable</button>';

        $('#aqs-quiz-detail-title').text(q.title);
        $('#aqs-quiz-detail-body').html(
            '<div class="aqs-quiz-detail-row"><span class="aqs-quiz-detail-label">Subject</span><span class="aqs-quiz-detail-val">' + escHtml(q.subject) + '</span></div>' +
            '<div class="aqs-quiz-detail-row"><span class="aqs-quiz-detail-label">Questions</span><span class="aqs-quiz-detail-val">' + q.num_questions + '</span></div>' +
            '<div class="aqs-quiz-detail-row"><span class="aqs-quiz-detail-label">Time Limit</span><span class="aqs-quiz-detail-val">' + q.time_limit + ' minutes</span></div>' +
            '<div class="aqs-quiz-detail-row"><span class="aqs-quiz-detail-label">Mode</span><span class="aqs-quiz-detail-val"><span class="aqs-mode-badge">' + q.mode + '</span></span></div>' +
            '<div class="aqs-quiz-detail-row"><span class="aqs-quiz-detail-label">Status</span><span class="aqs-quiz-detail-val">' + statusBadge + '</span></div>' +
            '<div class="aqs-quiz-detail-row"><span class="aqs-quiz-detail-label">Host Status</span><span class="aqs-quiz-detail-val">' + hostBadge + '</span></div>' +
            '<div class="aqs-quiz-detail-row" style="flex-direction:column;align-items:flex-start;gap:6px;"><span class="aqs-quiz-detail-label">Quiz Link</span><div style="width:100%;">' + linkHtml + '</div></div>'
        );
        $('#aqs-quiz-detail-actions').html(
            publishBtn + ' ' + toggleBtn +
            ' <button class="aqs-btn aqs-btn-sm" style="background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;" onclick="location.href=\'create-quiz.html?edit=' + q.id + '\'">✏️ Edit Quiz</button>' +
            ' <button class="aqs-btn aqs-btn-sm aqs-view-attendance-btn" data-id="' + q.id + '" data-title="' + escHtml(q.title) + '" data-token="' + escHtml(q.quiz_token || '') + '" onclick="$(\'#aqs-quiz-detail-modal\').hide();">📊 View Results</button>' +
            ' <button class="aqs-btn aqs-btn-sm aqs-export-quiz-csv-btn" data-id="' + q.id + '" data-title="' + escHtml(q.title) + '">📥 Export CSV</button>' +
            ' <button class="aqs-btn aqs-btn-sm aqs-export-quiz-pdf-btn" data-id="' + q.id + '" data-title="' + escHtml(q.title) + '" style="background:#e0e7ff;color:#3730a3;border:1px solid #c7d2fe;">📄 Export PDF</button>' +
            ' <button class="aqs-btn aqs-btn-sm aqs-btn-danger aqs-delete-btn" data-id="' + q.id + '" data-title="' + escHtml(q.title) + '" onclick="$(\'#aqs-quiz-detail-modal\').hide();">🗑 Delete</button>'
        );
        $('#aqs-quiz-detail-modal').css('display','flex');
    });
    $(document).on('click', '#aqs-close-quiz-detail', function () { $('#aqs-quiz-detail-modal').hide(); });
    $(document).on('click', '#aqs-quiz-detail-modal', function (e) {
        if ($(e.target).is('#aqs-quiz-detail-modal')) $(this).hide();
    });

    /* ── Per-quiz CSV export ── */
    $(document).on('click', '.aqs-export-quiz-csv-btn', function () {
        var id    = $(this).data('id');
        var title = $(this).data('title') || 'Quiz';
        var $btn  = $(this);
        $btn.prop('disabled', true).text('⏳ Exporting…');
        $.post(AQS.ajax_url, { action: 'aqs_get_attendance', nonce: AQS.nonce, quiz_id: id }, function (res) {
            $btn.prop('disabled', false).text('📥 Export CSV');
            if (!res.success) { alert('Could not load results.'); return; }
            var rows = res.data.attempts || [];
            if (!rows.length) { alert('No results yet for this quiz.'); return; }
            var header = ['#','Participant','Score','Total','Percent','Date'];
            // Add custom form fields from first row
            if (rows[0] && rows[0].custom_form_data) {
                try {
                    var fd = JSON.parse(rows[0].custom_form_data);
                    Object.keys(fd).forEach(function(k){ header.push(k); });
                } catch(e){}
            }
            var lines = [header.join(',')];
            rows.forEach(function(r, i) {
                var pct = r.total > 0 ? Math.round((r.score/r.total)*100) : 0;
                var row = [i+1, '"'+(r.participant_name||'').replace(/"/g,'""')+'"', r.score, r.total, pct+'%',
                           (r.finished_at||'').substring(0,16)];
                if (r.custom_form_data) {
                    try {
                        var fd2 = JSON.parse(r.custom_form_data);
                        Object.keys(fd2).forEach(function(k){ row.push('"'+(fd2[k]||'').replace(/"/g,'""')+'"'); });
                    } catch(e){}
                }
                lines.push(row.join(','));
            });
            var csv  = lines.join('\r\n');
            var blob = new Blob([csv], { type: 'text/csv' });
            var url  = URL.createObjectURL(blob);
            var a    = document.createElement('a');
            a.href   = url; a.download = title.replace(/[^a-z0-9]/gi,'_') + '_results.csv';
            a.click(); URL.revokeObjectURL(url);
        }).fail(function(){ $btn.prop('disabled', false).text('📥 Export CSV'); alert('Export failed.'); });
    });

    $(document).on('click', '.aqs-publish-btn', function () {
        const id = $(this).data('id');
        if (!confirm('Publish this quiz and generate a shareable link?')) return;
        $.post(AQS.ajax_url, { action: 'aqs_publish_quiz', nonce: AQS.nonce, quiz_id: id }, function (res) {
            if (res.success) { alert('Published! Link: ' + res.data.quiz_url); loadQuizzes(); }
            else { alert('Error: ' + (typeof res.data === 'object' ? (res.data.message || JSON.stringify(res.data)) : res.data)); }
        });
    });

    /* ── Print quiz questions PDF (from quiz list card) ── */
    $(document).on('click', '.aqs-print-quiz-pdf-btn', function () {
        var id    = $(this).data('id');
        var title = $(this).data('title') || 'Quiz';
        var $btn  = $(this).prop('disabled', true).text('⏳…');
        $.post(AQS.ajax_url, { action: 'aqs_get_quiz_for_pdf', nonce: AQS.nonce, quiz_id: id }, function (res) {
            $btn.prop('disabled', false).text('🖨 Print');
            if (!res.success) { alert('Could not load quiz data.'); return; }
            var q  = res.data;
            var qs = q.questions || [];
            var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escHtml(q.title || title) + '</title>';
            html += '<style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:13px;color:#1e293b;padding:30px 40px}';
            html += 'h1{font-size:20px;color:#4f46e5;margin-bottom:4px}.sub{color:#64748b;font-size:12px;margin-bottom:24px}';
            html += '.q{margin-bottom:18px;page-break-inside:avoid}.q-num{font-weight:700;color:#4f46e5}.opt{margin:3px 0 3px 22px}';
            html += '.ans{margin-top:4px;font-size:.82rem;color:#065f46;font-style:italic}@media print{@page{margin:15mm}}</style></head><body>';
            html += '<h1>' + escHtml(q.title || title) + '</h1>';
            html += '<div class="sub">' + escHtml(q.subject || '') + (q.mode ? '  |  Mode: ' + escHtml(q.mode) : '') + '</div>';
            qs.forEach(function(qItem, i) {
                html += '<div class="q"><div class="q-num">' + (i + 1) + '. ' + escHtml(qItem.question || '') + '</div>';
                (qItem.options || []).forEach(function(opt, oi) {
                    html += '<div class="opt">' + String.fromCharCode(65 + oi) + ') ' + escHtml(opt) + '</div>';
                });
                if (qItem.correct_answer_index !== undefined) {
                    var ans = (qItem.options || [])[qItem.correct_answer_index] || '';
                    html += '<div class="ans">Answer: ' + String.fromCharCode(65 + qItem.correct_answer_index) + ') ' + escHtml(ans) + '</div>';
                }
                html += '</div>';
            });
            html += '</body></html>';
            var win = window.open('', '_blank', 'width=900,height=700');
            if (!win) { alert('Allow pop-ups to print.'); return; }
            win.document.write(html);
            win.document.close();
            win.focus();
            setTimeout(function() { win.print(); }, 600);
        });
    });

    /* ── Print latest published quiz ── */
    $(document).on('click', '.aqs-print-quiz-btn', function () {
        var quizData = $(this).data('quiz');
        if (!quizData || !quizData.questions || !quizData.questions.length) { alert('No question data available.'); return; }
        aqsPrintQuiz(quizData);
    });

    /* ---- Disable / Enable toggle ---- */
    $(document).on('click', '.aqs-toggle-status-btn', function () {
        const id     = $(this).data('id');
        const action = $(this).data('action');
        const label  = action === 'disable' ? 'disable (participants will see a notice)' : 'enable';
        if (!confirm('Are you sure you want to ' + label + ' this quiz?')) return;
        $.post(AQS.ajax_url, { action: 'aqs_toggle_quiz_status', nonce: AQS.nonce, quiz_id: id, toggle_action: action }, function (res) {
            if (res.success) { loadQuizzes(); }
            else { alert('Error: ' + (res.data || 'Unknown error')); }
        });
    });

    /* ---- Delete with activity print first ---- */
    var _pendingDeleteId = null;
    var _hostDeletePrinted = false;

    $(document).on('click', '.aqs-delete-btn', function () {
        const id    = $(this).data('id');
        const title = $(this).data('title');
        _pendingDeleteId = id;
        _hostDeletePrinted = false;

        $('#aqs-activity-body').html('<div class="aqs-loading">Loading quiz activity...</div>');
        $('#aqs-confirm-delete-btn').prop('disabled', true).css({'opacity':'0.4','cursor':'not-allowed'}).attr('title','You must print first before deleting');
        $('#aqs-host-print-required-note').show();
        $('#aqs-activity-modal').css('display','flex');

        $.post(AQS.ajax_url, { action: 'aqs_get_quiz_activity', nonce: AQS.nonce, quiz_id: id }, function (res) {
            if (!res.success) { $('#aqs-activity-body').html('<p>Could not load activity data.</p>'); return; }
            const q = res.data.quiz;
            const attempts = res.data.attempts || [];
            let html = `<div class="aqs-activity-summary">
                <h4>${escHtml(q.title)}</h4>
                <p><strong>Subject:</strong> ${escHtml(q.subject)} &nbsp;|&nbsp;
                   <strong>Questions:</strong> ${q.num_questions} &nbsp;|&nbsp;
                   <strong>Status:</strong> ${q.status} &nbsp;|&nbsp;
                   <strong>Created:</strong> ${(q.created_at || '').substring(0,10)}</p>
                <p><strong>Total Attempts:</strong> ${attempts.length}</p>
            </div>`;
            if (attempts.length) {
                html += '<table class="aqs-table" style="margin-top:12px;"><thead><tr><th>#</th><th>Participant</th><th>Score</th><th>Date</th></tr></thead><tbody>';
                attempts.forEach(function (a, i) {
                    const pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
                    html += `<tr><td>${i+1}</td><td>${escHtml(a.participant_name)}</td><td>${a.score}/${a.total} (${pct}%)</td><td>${(a.finished_at||'').substring(0,16)}</td></tr>`;
                });
                html += '</tbody></table>';
            } else {
                html += '<p class="aqs-empty" style="text-align:center;">No attempts recorded for this quiz.</p>';
            }
            $('#aqs-activity-body').html(html);
        });
    });

    $(document).on('click', '#aqs-print-activity-btn', function () {
        const body = document.getElementById('aqs-activity-body');
        if (!body) return;
        printElement(body, 'Quiz Activity Report');
        _hostDeletePrinted = true;
        $('#aqs-confirm-delete-btn').prop('disabled', false).css({'opacity':'1','cursor':'pointer'}).attr('title','');
        $('#aqs-host-print-required-note').hide();
    });

    $(document).on('click', '#aqs-confirm-delete-btn', function () {
        if (!_pendingDeleteId) return;
        if (!_hostDeletePrinted) {
            alert('⚠️ You must print the quiz activity first before deleting.\n\nClick the "🖨️ Print Activity" button above to print, then you can delete.');
            return;
        }
        const id = _pendingDeleteId;
        _pendingDeleteId = null;
        $('#aqs-activity-modal').hide();
        $.post(AQS.ajax_url, { action: 'aqs_delete_quiz', nonce: AQS.nonce, quiz_id: id }, function (res) {
            if (res.success) {
                alert('Quiz deleted. Admin has been notified and can restore it if needed.\n\nTo request a restore, contact admin on WhatsApp: +2347055428581');
                loadQuizzes();
            } else { alert('Error: ' + (res.data || 'Unknown error')); }
        });
    });

    /* ---- ATTENDANCE ---- */
    var attendanceData    = null;
    var _currentAttQuizId = null;
    var _lbRefreshTimer   = null;

    function _stopLbRefresh() {
        if (_lbRefreshTimer) { clearInterval(_lbRefreshTimer); _lbRefreshTimer = null; }
    }

    $(document).on('click', '#aqs-close-attendance', function () { _stopLbRefresh(); });
    $(document).on('click', '#aqs-attendance-modal', function (e) {
        if ($(e.target).is('#aqs-attendance-modal')) _stopLbRefresh();
    });

    $(document).on('click', '.aqs-view-attendance-btn', function () {
        const id    = $(this).data('id');
        const token = $(this).data('token') || '';
        const title = $(this).data('title');
        _currentAttQuizId = id;
        _stopLbRefresh();
        $('#aqs-attendance-title').text('Attendance — ' + title);
        $('#aqs-attendance-sub').text('');
        $('#aqs-att-tabs').remove();
        $('#aqs-attendance-body').html('<div class="aqs-loading">Loading...</div>');
        $('#aqs-attendance-modal').css('display','flex');

        /* Inject tabs above body */
        var $tabs = $('<div id="aqs-att-tabs" class="no-print" style="display:flex;gap:0;border-bottom:2px solid rgba(99,102,241,.2);margin-bottom:12px;">' +
            '<button class="aqs-att-tab aqs-att-tab-active" data-tab="attendance" style="flex:1;padding:9px 0;background:none;border:none;border-bottom:3px solid #6366f1;color:#6366f1;font-weight:700;cursor:pointer;font-size:.88rem;">📋 Attendance</button>' +
            '<button class="aqs-att-tab" data-tab="leaderboard" style="flex:1;padding:9px 0;background:none;border:none;border-bottom:3px solid transparent;color:#94a3b8;font-weight:600;cursor:pointer;font-size:.88rem;">🏆 Live Leaderboard</button>' +
            '</div>');
        var $modalContent = $('#aqs-attendance-modal .aqs-modal-content');
        $modalContent.find('.aqs-modal-header').after($tabs);

        function switchTab(tab) {
            $('#aqs-att-tabs .aqs-att-tab').each(function () {
                var active = $(this).data('tab') === tab;
                $(this).css({ 'border-bottom-color': active ? '#6366f1' : 'transparent', 'color': active ? '#6366f1' : '#94a3b8', 'font-weight': active ? '700' : '600' });
            });
            if (tab === 'attendance') {
                _stopLbRefresh();
                if (attendanceData) renderAttendanceTable(attendanceData);
            } else {
                loadLiveLeaderboard(token);
                _lbRefreshTimer = setInterval(function () { loadLiveLeaderboard(token); }, 15000);
            }
        }

        $(document).off('click.atttab').on('click.atttab', '.aqs-att-tab', function () {
            switchTab($(this).data('tab'));
        });

        $.post(AQS.ajax_url, { action: 'aqs_get_attendance', nonce: AQS.nonce, quiz_id: id }, function (res) {
            if (!res.success) {
                var msg = (res && res.data) ? res.data : 'Server error. Please refresh and try again.';
                $('#aqs-attendance-body').html('<p class="aqs-empty" style="color:#ef4444;">⚠️ ' + msg + '</p>');
                return;
            }
            attendanceData = res.data;
            renderAttendanceTable(res.data);
        }).fail(function (xhr) {
            $('#aqs-attendance-body').html('<p class="aqs-empty" style="color:#ef4444;">⚠️ Network error (' + xhr.status + '). Please refresh and try again.</p>');
        });
    });

    function loadLiveLeaderboard(token) {
        if (!token) {
            $('#aqs-attendance-body').html('<p class="aqs-empty">No quiz token available for leaderboard.</p>');
            return;
        }
        var $body = $('#aqs-attendance-body');
        if (!$body.find('.aqs-live-lb-wrap').length) {
            $body.html('<div class="aqs-live-lb-wrap">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
                '<span style="font-size:.82rem;color:#94a3b8;" id="aqs-lb-refresh-status">Loading…</span>' +
                '<span style="font-size:.78rem;color:#6366f1;" id="aqs-lb-next-refresh"></span>' +
                '</div>' +
                '<div id="aqs-lb-content"><div class="aqs-loading">Loading leaderboard...</div></div>' +
                '</div>');
        }
        $.post(AQS.ajax_url, { action: 'aqs_get_leaderboard', nonce: AQS.nonce, token: token }, function (res) {
            var now = new Date().toLocaleTimeString();
            $('#aqs-lb-refresh-status').html('🟢 Live &nbsp;·&nbsp; Last updated: ' + now);
            $('#aqs-lb-next-refresh').text('Auto-refresh every 15s');
            if (!res.success) {
                $('#aqs-lb-content').html('<p class="aqs-empty">Could not load leaderboard.</p>');
                return;
            }
            var entries = (res.data || {}).leaderboard || [];
            $('#aqs-lb-content').html(buildLeaderboardHtml(entries));
        });
    }

    function renderAttendance(data) { renderAttendanceTable(data); }

    function renderAttendanceTable(data) {
        const attempts   = data.attempts || [];
        const customForm = data.custom_form || [];

        $('#aqs-attendance-sub').text(attempts.length + ' participant(s) — ' + data.quiz_subject);

        if (!attempts.length) {
            $('#aqs-attendance-body').html('<p class="aqs-empty">No one has taken this quiz yet.</p>');
            return;
        }

        let ths = '<th>#</th><th>Name</th>';
        customForm.forEach(function (f) { ths += `<th>${escHtml(f.label)}</th>`; });
        ths += '<th>Score</th><th>Percentage</th><th>Date</th><th class="no-print">Analysis</th>';

        let rows = '';
        attempts.forEach(function (a, idx) {
            const pct      = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
            const badge    = pct >= 70 ? 'aqs-badge-success' : (pct >= 40 ? 'aqs-badge-warn' : 'aqs-badge-fail');
            const formData = safeParseJSON(a.custom_form_data, {});

            let customCells = '';
            customForm.forEach(function (f) {
                customCells += `<td>${escHtml(formData[f.label] || '—')}</td>`;
            });

            rows += `<tr>
                <td>${idx + 1}</td>
                <td><strong>${escHtml(a.participant_name)}</strong></td>
                ${customCells}
                <td>${a.score}/${a.total}</td>
                <td><span class="aqs-badge ${badge}">${pct}%</span></td>
                <td>${(a.finished_at || '').substring(0, 16)}</td>
                <td class="no-print">
                    <button class="aqs-btn aqs-btn-sm aqs-view-analysis-btn" data-id="${a.id}" data-name="${escHtml(a.participant_name)}">View Analysis</button>
                </td>
            </tr>`;
        });

        const html = `<div class="aqs-attendance-print-wrap">
            <table class="aqs-table aqs-attendance-table" id="aqs-attendance-table">
                <thead><tr>${ths}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
        $('#aqs-attendance-body').html(html);
    }

    $(document).on('click', '#aqs-print-attendance-btn', function () {
        _stopLbRefresh();
        /* Temporarily switch to attendance tab before printing */
        if (attendanceData) renderAttendanceTable(attendanceData);
        const table = document.getElementById('aqs-attendance-table');
        if (!table) { alert('Switch to the Attendance tab first, then print.'); return; }
        printElement(table, 'Attendance Report');
    });

    /* ---- Attendance Export dropdown ---- */
    $(document).on('click', '#aqs-export-attendance-toggle', function (e) {
        e.stopPropagation();
        $('#aqs-export-attendance-menu').toggle();
    });
    $(document).on('click', function (e) {
        if (!$(e.target).closest('#aqs-export-attendance-toggle, #aqs-export-attendance-menu').length) {
            $('#aqs-export-attendance-menu').hide();
        }
    });

    $(document).on('click', '#aqs-export-att-csv', function () {
        $('#aqs-export-attendance-menu').hide();
        if (!attendanceData) return;
        aqsExportAttendance(attendanceData, 'csv', $('#aqs-attendance-title').text());
    });
    $(document).on('click', '#aqs-export-att-excel', function () {
        $('#aqs-export-attendance-menu').hide();
        if (!attendanceData) return;
        aqsExportAttendance(attendanceData, 'excel', $('#aqs-attendance-title').text());
    });
    $(document).on('click', '#aqs-export-att-pdf', function () {
        $('#aqs-export-attendance-menu').hide();
        if (!attendanceData) return;
        aqsExportAttendance(attendanceData, 'pdf', $('#aqs-attendance-title').text());
    });
    $(document).on('click', '#aqs-export-att-word', function () {
        $('#aqs-export-attendance-menu').hide();
        if (!attendanceData) return;
        aqsExportAttendance(attendanceData, 'word', $('#aqs-attendance-title').text());
    });
    $(document).on('click', '#aqs-export-att-json', function () {
        $('#aqs-export-attendance-menu').hide();
        if (!attendanceData) return;
        aqsExportAttendance(attendanceData, 'json', $('#aqs-attendance-title').text());
    });
    $(document).on('click', '#aqs-export-att-print', function () {
        $('#aqs-export-attendance-menu').hide();
        if (!attendanceData) return;
        aqsExportAttendance(attendanceData, 'print', $('#aqs-attendance-title').text());
    });

    /* =========================================================
       EXPORT UTILITIES (host dashboard)
    ========================================================= */
    function aqsLoadScript(src, cb) {
        if (document.querySelector('script[src="' + src + '"]')) { cb(); return; }
        var s = document.createElement('script');
        s.src = src; s.onload = cb;
        document.head.appendChild(s);
    }

    function aqsMakeCSV(headers, rows) {
        return [headers].concat(rows).map(function (r) {
            return r.map(function (c) {
                var s = String(c == null ? '' : c).replace(/"/g, '""');
                if (/[,"\n]/.test(s)) s = '"' + s + '"';
                return s;
            }).join(',');
        }).join('\r\n');
    }

    function aqsDownload(content, filename, mime) {
        var blob = new Blob([content], { type: mime });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    }

    function aqsAttToRows(data) {
        var customForm = data.custom_form || [];
        var headers    = ['#', 'Name'];
        customForm.forEach(function (f) { headers.push(f.label); });
        headers.push('Score', 'Percentage', 'Date');
        var rows = (data.attempts || []).map(function (a, i) {
            var pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
            var fd  = {}; try { fd = JSON.parse(a.custom_form_data || '{}'); } catch(e) {}
            var row = [i + 1, a.participant_name];
            customForm.forEach(function (f) { row.push(fd[f.label] || ''); });
            row.push(a.score + '/' + a.total, pct + '%', (a.finished_at || '').substring(0, 16));
            return row;
        });
        return { headers: headers, rows: rows };
    }

    function aqsExportAttendance(data, fmt, title) {
        var safeTitle = (title || 'attendance').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        var d         = aqsAttToRows(data);

        if (fmt === 'csv') {
            aqsDownload('\uFEFF' + aqsMakeCSV(d.headers, d.rows), safeTitle + '.csv', 'text/csv;charset=utf-8;');

        } else if (fmt === 'excel') {
            aqsLoadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', function () {
                var ws = XLSX.utils.aoa_to_sheet([d.headers].concat(d.rows));
                var wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
                XLSX.writeFile(wb, safeTitle + '.xlsx');
            });

        } else if (fmt === 'pdf') {
            aqsLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', function () {
                aqsLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js', function () {
                    var doc = new window.jspdf.jsPDF({ orientation: d.headers.length > 6 ? 'landscape' : 'portrait' });
                    doc.setFontSize(15); doc.setTextColor(79, 70, 229);
                    doc.text(title || 'Attendance', 14, 15);
                    doc.setFontSize(9); doc.setTextColor(100, 116, 139);
                    doc.text('Generated by AI Quiz System  —  ' + new Date().toLocaleDateString(), 14, 22);
                    doc.autoTable({
                        head: [d.headers], body: d.rows, startY: 28,
                        styles: { fontSize: 9, cellPadding: 3 },
                        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
                        alternateRowStyles: { fillColor: [248, 247, 255] }
                    });
                    doc.save(safeTitle + '.pdf');
                });
            });

        } else if (fmt === 'word') {
            var thHtml = d.headers.map(function (h) { return '<th style="background:#4f46e5;color:#fff;padding:7px 11px;font-size:12px;">' + escHtml(h) + '</th>'; }).join('');
            var trHtml = d.rows.map(function (r, ri) {
                var bg = ri % 2 === 0 ? '#fff' : '#f8f7ff';
                return '<tr>' + r.map(function (c) { return '<td style="padding:7px 11px;border:1px solid #e5e7eb;background:' + bg + ';">' + escHtml(String(c)) + '</td>'; }).join('') + '</tr>';
            }).join('');
            var docHtml = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + escHtml(title || 'Attendance') + '</title><style>body{font-family:Arial,sans-serif;font-size:13px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ccc;}</style></head><body><h2 style="color:#4f46e5;">' + escHtml(title || 'Attendance') + '</h2><p style="color:#64748b;font-size:12px;">Generated by AI Quiz System | ' + new Date().toLocaleDateString() + '</p><table><thead><tr>' + thHtml + '</tr></thead><tbody>' + trHtml + '</tbody></table></body></html>';
            aqsDownload(docHtml, safeTitle + '.doc', 'application/msword');

        } else if (fmt === 'json') {
            var attempts = data.attempts || [];
            var customForm = data.custom_form || [];
            var jsonRows = attempts.map(function (a, i) {
                var pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
                var fd  = {}; try { fd = JSON.parse(a.custom_form_data || '{}'); } catch(e) {}
                var obj = { '#': i + 1, name: a.participant_name };
                customForm.forEach(function (f) { obj[f.label] = fd[f.label] || ''; });
                obj.score      = a.score + '/' + a.total;
                obj.percentage = pct + '%';
                obj.date       = (a.finished_at || '').substring(0, 16);
                return obj;
            });
            var payload = {
                quiz_title:   (title || '').replace(/^Attendance — ?/i, ''),
                quiz_subject: data.quiz_subject || '',
                exported_at:  new Date().toISOString(),
                total_participants: attempts.length,
                results: jsonRows
            };
            aqsDownload(JSON.stringify(payload, null, 2), safeTitle + '.json', 'application/json');

        } else if (fmt === 'print') {
            var attempts2   = data.attempts || [];
            var customForm2 = data.custom_form || [];
            var total2      = attempts2.length;
            var avgPct = total2 > 0
                ? Math.round(attempts2.reduce(function (s, a) { return s + (a.total > 0 ? (a.score / a.total) * 100 : 0); }, 0) / total2)
                : 0;
            var passed = attempts2.filter(function (a) { return a.total > 0 && (a.score / a.total) >= 0.7; }).length;

            var pThHtml = d.headers.slice(0, -0).map(function (h) {
                return '<th>' + escHtml(h) + '</th>';
            }).join('');
            var pTrHtml = d.rows.map(function (r) {
                var pct = parseInt((r[r.length - 2] || '').replace('%', '')) || 0;
                var cls = pct >= 70 ? 'pass' : (pct >= 40 ? 'avg' : 'fail');
                return '<tr class="' + cls + '">' + r.map(function (c) {
                    return '<td>' + escHtml(String(c)) + '</td>';
                }).join('') + '</tr>';
            }).join('');

            var printTitle = (title || 'Attendance').replace(/^Attendance — ?/i, '');
            var win2 = window.open('', '_blank', 'width=1000,height=750');
            if (!win2) { alert('Please allow pop-ups to print.'); return; }
            win2.document.write('<!DOCTYPE html><html><head><meta charset="utf-8">');
            win2.document.write('<title>' + escHtml(printTitle) + ' — Results</title>');
            win2.document.write('<style>');
            win2.document.write([
                '*{box-sizing:border-box;margin:0;padding:0}',
                'body{font-family:"Segoe UI",Arial,sans-serif;font-size:13px;color:#1e293b;background:#fff;padding:32px 40px}',
                'h1{font-size:22px;color:#4f46e5;margin-bottom:4px}',
                '.sub{color:#64748b;font-size:12px;margin-bottom:20px}',
                '.stats{display:flex;gap:24px;background:#f0f0ff;border:1px solid #c7d2fe;border-radius:8px;padding:14px 20px;margin-bottom:22px;flex-wrap:wrap}',
                '.stat{text-align:center}.stat strong{display:block;font-size:22px;font-weight:700;color:#4f46e5}',
                '.stat span{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px}',
                'table{width:100%;border-collapse:collapse}',
                'thead th{background:#4f46e5;color:#fff;padding:10px 14px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.4px}',
                'td{padding:9px 14px;border-bottom:1px solid #e5e7eb;font-size:12px;vertical-align:middle}',
                'tr:nth-child(even) td{background:#f8f7ff}',
                'tr.pass td:last-child{color:#065f46;font-weight:700}',
                'tr.avg  td:last-child{color:#92400e;font-weight:700}',
                'tr.fail td:last-child{color:#991b1b;font-weight:700}',
                '.footer{margin-top:18px;font-size:11px;color:#94a3b8;text-align:right}',
                '@media print{body{padding:0}@page{margin:15mm}}'
            ].join(''));
            win2.document.write('</style></head><body>');
            win2.document.write('<h1>' + escHtml(printTitle) + '</h1>');
            win2.document.write('<div class="sub">Generated ' + new Date().toLocaleDateString('en-GB', {day:'2-digit',month:'long',year:'numeric'}) + (data.quiz_subject ? '  ·  Subject: ' + escHtml(data.quiz_subject) : '') + '</div>');
            win2.document.write('<div class="stats">');
            win2.document.write('<div class="stat"><strong>' + total2 + '</strong><span>Participants</span></div>');
            win2.document.write('<div class="stat"><strong>' + avgPct + '%</strong><span>Avg Score</span></div>');
            win2.document.write('<div class="stat"><strong>' + passed + '</strong><span>Passed (≥70%)</span></div>');
            win2.document.write('<div class="stat"><strong>' + (total2 - passed) + '</strong><span>Below Pass</span></div>');
            win2.document.write('</div>');
            win2.document.write('<table><thead><tr>' + pThHtml + '</tr></thead><tbody>' + pTrHtml + '</tbody></table>');
            win2.document.write('<div class="footer">xzily AI Quiz System</div>');
            win2.document.write('</body></html>');
            win2.document.close();
            win2.focus();
            setTimeout(function () { win2.print(); }, 400);
        }
    }

    /* =========================================================
       QUIZ PDF EXPORT
    ========================================================= */
    $(document).on('click', '.aqs-export-quiz-pdf-btn', function () {
        var id    = $(this).data('id');
        var title = $(this).data('title') || 'Quiz';
        var $btn  = $(this);
        $btn.prop('disabled', true).text('⏳ Generating PDF…');

        $.ajax({
            url:      AQS.ajax_url,
            type:     'POST',
            dataType: 'json',
            data:     { action: 'aqs_get_quiz_for_pdf', nonce: AQS.nonce, quiz_id: id },
            error: function () {
                $btn.prop('disabled', false).text('📄 Export PDF');
                alert('Connection error. Please refresh and try again.');
            },
            success: function (res) {
                $btn.prop('disabled', false).text('📄 Export PDF');
                if (!res || !res.success) { alert('Could not load quiz: ' + ((res && res.data) || 'Unknown error')); return; }
                aqsGenerateQuizPDF(res.data);
            }
        });
    });

    function aqsGenerateQuizPDF(quiz) {
        aqsLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', function () {
            aqsLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js', function () {
                var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                var pageW  = doc.internal.pageSize.getWidth();
                var margin = 14;
                var y      = 14;

                /* ── Header ── */
                doc.setFillColor(99, 102, 241);
                doc.rect(0, 0, pageW, 26, 'F');
                doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
                doc.text(String(quiz.title || 'Quiz'), margin, 12);
                doc.setFontSize(9);  doc.setFont('helvetica', 'normal');
                doc.text('Generated by AI Quiz System  |  ' + new Date().toLocaleDateString(), margin, 20);
                y = 34;

                /* ── Meta row ── */
                doc.setFontSize(9); doc.setTextColor(71, 85, 105);
                var meta = [
                    'Subject: ' + (quiz.subject || '—'),
                    'Questions: ' + (quiz.num_questions || 0),
                    'Time Limit: ' + (quiz.time_limit || 0) + ' min',
                    'Mode: ' + (quiz.mode || 'exam'),
                    'Status: ' + (quiz.status || 'draft'),
                    'Created: ' + (quiz.created_at || '—')
                ];
                meta.forEach(function (m, i) {
                    var col = i < 3 ? 0 : 1;
                    var row = i < 3 ? i : i - 3;
                    doc.text(m, margin + col * 90, y + row * 6);
                });
                y += 22;

                /* ── Quiz note ── */
                if (quiz.quiz_note && quiz.quiz_note.trim()) {
                    doc.setFontSize(9); doc.setTextColor(30, 41, 59);
                    doc.setFont('helvetica', 'bolditalic');
                    doc.text('Note: ', margin, y);
                    doc.setFont('helvetica', 'normal');
                    var noteLines = doc.splitTextToSize(quiz.quiz_note, pageW - margin * 2 - 14);
                    doc.text(noteLines, margin + 12, y);
                    y += noteLines.length * 5 + 4;
                }

                /* ── Divider ── */
                doc.setDrawColor(199, 210, 254); doc.setLineWidth(0.5);
                doc.line(margin, y, pageW - margin, y);
                y += 6;

                /* ── Questions ── */
                var questions = quiz.questions || [];
                var letters   = ['A', 'B', 'C', 'D', 'E'];

                questions.forEach(function (q, qi) {
                    var qText   = 'Q' + (qi + 1) + '. ' + (q.question || '');
                    var qLines  = doc.splitTextToSize(qText, pageW - margin * 2);
                    var optRows = (q.options || []).map(function (opt, oi) {
                        var prefix = letters[oi] + '.  ';
                        var isCorrect = oi === q.correct_answer_index;
                        return { text: prefix + opt, correct: isCorrect };
                    });
                    var exLines = q.explanation ? doc.splitTextToSize('💡 ' + q.explanation, pageW - margin * 2 - 4) : [];

                    /* Estimate block height for page-break check */
                    var blockH = qLines.length * 5 + optRows.length * 5.5 + (exLines.length ? exLines.length * 4.5 + 4 : 0) + 8;
                    if (y + blockH > 272) { doc.addPage(); y = 14; }

                    /* Question text */
                    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59);
                    doc.text(qLines, margin, y);
                    y += qLines.length * 5 + 2;

                    /* Options */
                    optRows.forEach(function (opt) {
                        var optLines = doc.splitTextToSize(opt.text, pageW - margin * 2 - 6);
                        if (opt.correct) {
                            doc.setFillColor(209, 250, 229);
                            doc.roundedRect(margin - 1, y - 4, pageW - margin * 2 + 2, optLines.length * 5 + 2, 1, 1, 'F');
                            doc.setFont('helvetica', 'bold'); doc.setTextColor(6, 95, 70);
                        } else {
                            doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
                        }
                        doc.setFontSize(9);
                        doc.text(optLines, margin + 3, y);
                        if (opt.correct) {
                            var tickX = pageW - margin - 6;
                            doc.setFont('helvetica', 'bold'); doc.setTextColor(16, 185, 129);
                            doc.text('✓', tickX, y);
                        }
                        y += optLines.length * 5 + 1;
                    });

                    /* Explanation */
                    if (exLines.length) {
                        y += 2;
                        doc.setFillColor(255, 251, 235); doc.setDrawColor(253, 211, 77);
                        doc.roundedRect(margin - 1, y - 3, pageW - margin * 2 + 2, exLines.length * 4.5 + 4, 1, 1, 'FD');
                        doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(146, 64, 14);
                        doc.text(exLines, margin + 2, y);
                        y += exLines.length * 4.5 + 3;
                    }

                    y += 6; /* gap between questions */
                });

                /* ── Footer on every page ── */
                var pages = doc.internal.getNumberOfPages();
                for (var p = 1; p <= pages; p++) {
                    doc.setPage(p);
                    doc.setFontSize(8); doc.setTextColor(148, 163, 184); doc.setFont('helvetica', 'normal');
                    doc.text('AI Quiz System  |  Page ' + p + ' of ' + pages, pageW / 2, 290, { align: 'center' });
                }

                var safeTitle = (quiz.title || 'quiz').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                doc.save(safeTitle + '_quiz.pdf');
            });
        });
    }

    /* ---- ANALYSIS ---- */
    $(document).on('click', '.aqs-view-analysis-btn', function () {
        const id   = $(this).data('id');
        const name = $(this).data('name');
        $('#aqs-analysis-title').text('Analysis — ' + name);
        $('#aqs-analysis-sub').text('');
        $('#aqs-analysis-body').html('<div class="aqs-loading">Loading...</div>');
        $('#aqs-analysis-modal').css('display','flex');

        $.post(AQS.ajax_url, { action: 'aqs_get_attempt_analysis', nonce: AQS.nonce, attempt_id: id }, function (res) {
            if (!res.success) { $('#aqs-analysis-body').html('<p>Error loading analysis.</p>'); return; }
            renderAnalysis(res.data);
        });
    });

    function renderAnalysis(data) {
        const results  = data.results || [];
        const formData = data.custom_form_data || {};
        const pct      = data.total > 0 ? Math.round((data.score / data.total) * 100) : 0;
        const badge    = pct >= 70 ? 'aqs-badge-success' : (pct >= 40 ? 'aqs-badge-warn' : 'aqs-badge-fail');

        $('#aqs-analysis-sub').text(`${data.quiz_title} • ${data.quiz_subject} • ${(data.finished_at || '').substring(0, 16)}`);

        let html = `<div class="aqs-analysis-summary">
            <div class="aqs-analysis-info">
                <strong>Participant:</strong> ${escHtml(data.participant_name)}<br>
                <strong>Score:</strong> ${data.score}/${data.total} &nbsp;
                <span class="aqs-badge ${badge}">${pct}%</span>
            </div>`;

        const formKeys = Object.keys(formData);
        if (formKeys.length) {
            html += '<div class="aqs-analysis-form-data"><strong>Pre-Quiz Form:</strong><ul>';
            formKeys.forEach(function (k) { html += `<li><em>${escHtml(k)}:</em> ${escHtml(formData[k])}</li>`; });
            html += '</ul></div>';
        }
        html += '</div>';

        html += '<div class="aqs-analysis-questions">';
        results.forEach(function (r, i) {
            const cls  = r.is_correct ? 'aqs-correct' : 'aqs-incorrect';
            const icon = r.is_correct ? '✅' : '❌';
            html += `<div class="aqs-review-item ${cls}">
                <p><strong>${icon} Q${i + 1}:</strong> ${renderMath(r.question)}</p>
                <p>Participant's answer: <strong>${r.user_answer !== null ? renderMath(r.options[r.user_answer]) : 'Not answered'}</strong></p>
                ${!r.is_correct ? `<p>Correct answer: <strong>${renderMath(r.options[r.correct])}</strong></p>` : ''}
                ${r.explanation ? `<p class="aqs-explanation">💡 ${renderMath(r.explanation)}</p>` : ''}
            </div>`;
        });
        html += '</div>';

        $('#aqs-analysis-body').html(html);
    }

    $(document).on('click', '#aqs-print-analysis-btn', function () {
        const body = document.getElementById('aqs-analysis-body');
        if (!body) return;
        printElement(body, 'Participant Analysis — ' + ($('#aqs-analysis-title').text() || ''));
    });

    /* =========================================================
       CREATE QUIZ  (single + multi-section)
    ========================================================= */
    $(document).ready(function () {
    if ($('#format-single').length) { /* create-quiz v2: handled by aqs-create.js */
        let extractedQuestions = [];
        let currentSource      = 'upload';
        let uploadedFile       = null;
        let currentQuizId      = null;
        let cqFormFields       = [];
        /* Multi-section state */
        let quizFormat = 'single'; // 'single' | 'multi'
        let sections   = [];       // [{ name, source, file, topicText, difficulty, questions, generating }]

        /* ── Studio import auto-fill ─────────────────────────────────────────
           When the user clicks "Save as Quiz" in the Studio, questions are
           stored in sessionStorage. We restore them here automatically.        */
        setTimeout(function () {
            var raw = '';
            try { raw = sessionStorage.getItem('aqs_studio_import') || ''; } catch (e) {}
            if (!raw) return;
            try {
                var imported = JSON.parse(raw);
                sessionStorage.removeItem('aqs_studio_import');
                var qs = (imported && Array.isArray(imported.questions) && imported.questions.length)
                    ? imported.questions : null;
                if (!qs) return;

                extractedQuestions = qs;

                /* Banner */
                var banner = $('<div class="aqs-studio-import-notice" style="' +
                    'background:#f0fdf4;border:1px solid #86efac;border-radius:8px;' +
                    'padding:14px 16px;display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;">' +
                    '<span style="font-size:22px;">&#128229;</span>' +
                    '<div><strong style="color:#166534;">Questions imported from Studio</strong>' +
                    '<p style="margin:4px 0 0;color:#166534;font-size:0.88rem;">' +
                    qs.length + ' question' + (qs.length !== 1 ? 's' : '') +
                    ' ready — review and edit below, then publish when ready.</p></div></div>');
                $('#aqs-create-form-wrap').prepend(banner);

                /* Render each question card */
                qs.forEach(function (q, i) {
                    var $el = $(buildQuestionEditHtml(q, i)).addClass('aqs-q-visible');
                    $('#aqs-questions-list').append($el);
                });
                updateQuestionCount();
                $('#step-questions, #step-publish').show();
                setTimeout(function () {
                    $('html,body').animate({ scrollTop: $('#step-questions').offset().top - 20 }, 500);
                }, 100);
            } catch (e) {
                console.warn('[AQS] Failed to restore studio import:', e);
            }
        }, 0);

        /* ---- Mode toggle (exam / practice) ---- */
        $(document).on('click', '.aqs-toggle[data-mode]', function () {
            $('.aqs-toggle[data-mode]').removeClass('active');
            $(this).addClass('active');
            $('#aqs-mode').val($(this).data('mode'));
        });

        /* ---- Format toggle (single vs multi) ---- */
        $(document).on('click', '.aqs-format-btn', function () {
            quizFormat = $(this).data('format');
            $('.aqs-format-btn').removeClass('active');
            $(this).addClass('active');
            if (quizFormat === 'multi') {
                $('#aqs-multi-notice').show();
                $('#aqs-section-count-row').show();
                $('#step-source').hide();
                $('#step-multi-sections, #step-questions, #step-publish').hide();
            } else {
                $('#aqs-multi-notice').hide();
                $('#aqs-section-count-row').hide();
                $('#step-source').show();
                $('#step-multi-sections').hide();
                if (!extractedQuestions.length) { $('#step-questions, #step-publish').hide(); }
            }
        });

        /* ---- Init sections button ---- */
        $('#aqs-init-sections-btn').on('click', function () {
            if (!$('#aqs-title').val().trim() || !$('#aqs-subject').val().trim()) {
                alert('Please fill in Title and Subject in Step 1 first.'); return;
            }
            const count = parseInt($('#aqs-section-count').val()) || 2;
            sections = [];
            for (let i = 0; i < count; i++) {
                sections.push({ name: 'Section ' + (i + 1), source: 'topic', file: null,
                    topicText: '', difficulty: 'medium', questions: [], generating: false });
            }
            renderSectionCards();
            $('#step-multi-sections').show();
            $('#step-questions, #step-publish, #aqs-all-sections-notice').hide();
            $('html,body').animate({ scrollTop: $('#step-multi-sections').offset().top - 20 }, 400);
        });

        /* ---- Render all section cards ---- */
        function renderSectionCards() {
            let html = '';
            sections.forEach(function (sec, i) {
                const genBadge = sec.questions.length
                    ? '<span class="aqs-badge aqs-badge-success" style="margin-left:8px;">&#10003; ' + sec.questions.length + ' questions</span>'
                    : '';
                const topicPanelStyle  = sec.source === 'topic'  ? '' : 'display:none;';
                const uploadPanelStyle = sec.source === 'upload' ? '' : 'display:none;';
                const manualPanelStyle = sec.source === 'manual' ? '' : 'display:none;';
                const fileHtml = sec.file
                    ? '<div class="aqs-file-info">&#128206; <span>' + escHtml(sec.file.name) + '</span>' +
                      '<button class="aqs-btn aqs-btn-sm aqs-btn-danger aqs-sec-remove-file" data-idx="' + i + '">Remove</button></div>'
                    : '<div class="aqs-upload-zone aqs-sec-upload-zone" data-idx="' + i + '">' +
                      '<div class="aqs-upload-icon">&#128196;</div><p>Drop PDF or Word doc here</p>' +
                      '<input type="file" class="aqs-sec-file-input" data-idx="' + i + '" accept=".pdf,.docx,.doc" style="display:none;" />' +
                      '<button class="aqs-btn aqs-sec-browse-btn" data-idx="' + i + '">Browse File</button></div>';
                const actionHtml = sec.source !== 'manual'
                    ? '<button class="aqs-btn aqs-btn-primary aqs-sec-generate-btn" data-idx="' + i + '">' +
                      (sec.generating ? '<span class="aqs-spinner" style="display:inline-block;width:14px;height:14px;border-width:2px;vertical-align:middle;margin-right:6px;"></span>Generating...' : '&#9889; Generate Questions') +
                      '</button>'
                    : '<button class="aqs-btn aqs-btn-success aqs-sec-manual-btn" data-idx="' + i + '">&#9998; Add Questions Manually</button>';
                html +=
                    '<div class="aqs-section-card" data-sec="' + i + '">' +
                        '<div class="aqs-section-card-header">' +
                            '<span class="aqs-step-num">' + (i + 1) + '</span>' +
                            '<input type="text" class="aqs-section-name-input" data-idx="' + i + '" value="' + escHtml(sec.name) + '" placeholder="Label / Topic (e.g. Biology Ch. ' + (i + 1) + ')" />' +
                            genBadge +
                        '</div>' +
                        '<div class="aqs-section-card-body">' +
                            '<div class="aqs-source-tabs aqs-sec-tabs" data-sec="' + i + '">' +
                                '<button class="aqs-source-tab' + (sec.source === 'topic'  ? ' active' : '') + '" data-source="topic"  data-sec="' + i + '">Topic</button>' +
                                '<button class="aqs-source-tab' + (sec.source === 'upload' ? ' active' : '') + '" data-source="upload" data-sec="' + i + '">Upload Doc</button>' +
                                '<button class="aqs-source-tab' + (sec.source === 'manual' ? ' active' : '') + '" data-source="manual" data-sec="' + i + '">Manual</button>' +
                            '</div>' +
                            '<div class="aqs-source-panel aqs-sec-panel-topic"  data-sec="' + i + '" style="' + topicPanelStyle + '">' +
                                '<div class="aqs-field"><label>Topic or Subject Area</label>' +
                                '<textarea class="aqs-sec-topic-input" data-idx="' + i + '" rows="3" placeholder="e.g. Photosynthesis in plants...">' + escHtml(sec.topicText) + '</textarea></div>' +
                                '<div class="aqs-field"><label>Difficulty</label>' +
                                '<select class="aqs-sec-difficulty" data-idx="' + i + '">' +
                                    '<option value="easy"'   + (sec.difficulty === 'easy'   ? ' selected' : '') + '>Easy</option>' +
                                    '<option value="medium"' + (sec.difficulty === 'medium' ? ' selected' : '') + '>Medium</option>' +
                                    '<option value="hard"'   + (sec.difficulty === 'hard'   ? ' selected' : '') + '>Hard</option>' +
                                '</select></div>' +
                            '</div>' +
                            '<div class="aqs-source-panel aqs-sec-panel-upload" data-sec="' + i + '" style="' + uploadPanelStyle + '">' + fileHtml + '</div>' +
                            '<div class="aqs-source-panel aqs-sec-panel-manual" data-sec="' + i + '" style="' + manualPanelStyle + '">' +
                                '<p class="aqs-hint" style="margin:8px 0;">Questions for this section will be added manually in the Review step.</p>' +
                            '</div>' +
                            '<div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
                                actionHtml +
                            '</div>' +
                            '<div class="aqs-sec-progress-wrap" data-idx="' + i + '" style="display:' + (sec.generating ? 'block' : 'none') + ';margin-top:10px;">' +
                                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
                                    '<div class="aqs-spinner" style="width:14px;height:14px;border-width:2px;flex-shrink:0;"></div>' +
                                    '<span class="aqs-sec-status" data-idx="' + i + '" style="font-size:0.82rem;color:#0369a1;"></span>' +
                                '</div>' +
                                '<div class="aqs-pbar-track"><div class="aqs-pbar-fill aqs-sec-pbar-fill" data-idx="' + i + '" style="width:0%;transition:width .4s ease;"></div></div>' +
                            '</div>' +
                            '<div class="aqs-sec-questions-area" data-idx="' + i + '" style="' + (sec.questions.length > 0 ? '' : 'display:none;') + '">' +
                                '<div class="aqs-sec-questions-header">' +
                                    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' +
                                    '<span class="aqs-sec-q-count">' + sec.questions.length + ' question' + (sec.questions.length !== 1 ? 's' : '') + ' generated</span>' +
                                '</div>' +
                                '<div class="aqs-sec-questions-list">' + (sec.questions.length > 0 ? buildSectionQuestionsHtml(sec.questions) : '') + '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
            });
            $('#aqs-sections-container').html(html);
        }

        function buildSectionQuestionsHtml(questions) {
            return questions.map(function (q, qi) {
                return '<div class="aqs-sec-q-item">' +
                    '<span class="aqs-sec-q-num">Q' + (qi + 1) + '</span>' +
                    '<span class="aqs-sec-q-text">' + escHtml(q.question) + '</span>' +
                '</div>';
            }).join('');
        }

        function updateSectionQuestionsDisplay(i) {
            const sec  = sections[i];
            const card = document.querySelector('.aqs-section-card[data-sec="' + i + '"]');
            if (!card) return;
            const area = card.querySelector('.aqs-sec-questions-area[data-idx="' + i + '"]');
            if (!area) return;
            if (!sec.questions.length) { area.style.display = 'none'; return; }
            area.style.display = 'block';
            const countEl = area.querySelector('.aqs-sec-q-count');
            if (countEl) countEl.textContent = sec.questions.length + ' question' + (sec.questions.length !== 1 ? 's' : '') + ' generated';
            const listEl  = area.querySelector('.aqs-sec-questions-list');
            if (listEl)  listEl.innerHTML = buildSectionQuestionsHtml(sec.questions);
        }

        /* ---- Section source-tab click ---- */
        $(document).on('click', '.aqs-sec-tabs .aqs-source-tab', function () {
            const i   = parseInt($(this).data('sec'));
            const src = $(this).data('source');
            sections[i].source = src;
            $(this).closest('.aqs-section-card').find('.aqs-source-tab').removeClass('active');
            $(this).addClass('active');
            $(this).closest('.aqs-section-card').find('.aqs-source-panel').hide();
            $(this).closest('.aqs-section-card').find('.aqs-sec-panel-' + src).show();
            renderSectionCards();
        });

        /* ---- Section name / topic / difficulty live update ---- */
        $(document).on('input',  '.aqs-section-name-input', function () { sections[+$(this).data('idx')].name       = $(this).val(); });
        $(document).on('input',  '.aqs-sec-topic-input',    function () { sections[+$(this).data('idx')].topicText  = $(this).val(); });
        $(document).on('change', '.aqs-sec-difficulty',     function () { sections[+$(this).data('idx')].difficulty = $(this).val(); });

        /* ---- Section file browse / drag-drop ---- */
        $(document).on('click', '.aqs-sec-browse-btn', function () {
            $(this).siblings('.aqs-sec-file-input').click();
        });
        $(document).on('change', '.aqs-sec-file-input', function () {
            const i = +$(this).data('idx');
            if (this.files[0]) { sections[i].file = this.files[0]; renderSectionCards(); }
        });
        $(document).on('click', '.aqs-sec-remove-file', function () {
            sections[+$(this).data('idx')].file = null; renderSectionCards();
        });
        $(document).on('dragover',  '.aqs-sec-upload-zone', function (e) { e.preventDefault(); $(this).addClass('drag-over'); });
        $(document).on('dragleave', '.aqs-sec-upload-zone', function ()  { $(this).removeClass('drag-over'); });
        $(document).on('drop', '.aqs-sec-upload-zone', function (e) {
            e.preventDefault(); $(this).removeClass('drag-over');
            const i = +$(this).data('idx');
            const f = e.originalEvent.dataTransfer.files[0];
            if (f) { sections[i].file = f; renderSectionCards(); }
        });

        /* ---- Helper: run AI generation for one section progressively ---- */
        async function generateSection(i) {
            const sec     = sections[i];
            const subject = $('#aqs-subject').val().trim();
            const numQ    = parseInt($('#aqs-num-questions').val()) || 10;
            let textContent = '';

            if (sec.source === 'upload') {
                if (!sec.file) throw new Error('No file for Section ' + (i + 1) + '.');
                setSecStatus(i, 'Extracting text…');
                textContent = await extractTextFromFile(sec.file);
            } else {
                const topic = sec.topicText || $('.aqs-sec-topic-input[data-idx="' + i + '"]').val().trim();
                if (!topic) throw new Error('No topic for Section ' + (i + 1) + '.');
                sections[i].topicText = topic;
                textContent = '__TOPIC__:' + topic;
            }

            sections[i].questions = [];
            await generateQuestionsProgressively(
                textContent, numQ, subject,
                sec.difficulty || 'medium',
                function (msg) { setSecStatus(i, msg); },
                function (newQs, totalSoFar, total) {
                    sections[i].questions = sections[i].questions.concat(newQs);
                    setSecStatus(i, totalSoFar + ' / ' + total + ' questions');
                    setSecProgressBar(i, totalSoFar, total);
                    updateSectionQuestionsDisplay(i);
                }
            );
            sections[i].generating = false;
        }

        /* ---- Section generate button (individual) ---- */
        $(document).on('click', '.aqs-sec-generate-btn', async function () {
            const i = +$(this).data('idx');
            if (!$('#aqs-title').val().trim() || !$('#aqs-subject').val().trim()) {
                alert('Please fill in Title and Subject in Step 1 first.'); return;
            }
            sections[i].generating = true;
            renderSectionCards();
            try {
                await generateSection(i);
                renderSectionCards();
                checkAllSectionsReady();
            } catch (e) {
                sections[i].generating = false; renderSectionCards();
                alert('AI error (Section ' + (i + 1) + '): ' + e.message);
            }
        });

        /* ---- Generate All Sections simultaneously (parallel) ---- */
        $('#aqs-generate-all-btn').on('click', async function () {
            if (!$('#aqs-title').val().trim() || !$('#aqs-subject').val().trim()) {
                alert('Please fill in Title and Subject in Step 1 first.'); return;
            }
            const eligible = sections
                .map(function (s, i) { return { s: s, i: i }; })
                .filter(function (x) { return x.s.source !== 'manual' && !x.s.questions.length; });

            if (!eligible.length) {
                alert('All sections already have questions, or only manual sections remain.'); return;
            }

            $(this).prop('disabled', true).text('⏳ Generating all…');
            $('#aqs-gen-all-bar').show();

            let doneCount = 0;
            eligible.forEach(function (x) { sections[x.i].generating = true; });
            renderSectionCards();

            function updateOverallBar() {
                doneCount++;
                const pct = Math.round((doneCount / eligible.length) * 100);
                $('#aqs-gen-all-fill').css('width', pct + '%');
                $('#aqs-gen-all-status').text(doneCount + ' of ' + eligible.length + ' sections complete…');
            }

            /* Fire all section generations concurrently */
            const results = await Promise.allSettled(eligible.map(async function (x) {
                try   { await generateSection(x.i); }
                catch (e) { sections[x.i].generating = false; console.error('[AQS] Section ' + x.i + ':', e); }
                updateOverallBar();
            }));

            renderSectionCards();
            $('#aqs-gen-all-bar').hide();
            $('#aqs-generate-all-btn').prop('disabled', false).text('⚡ Generate All Sections at Once');
            checkAllSectionsReady();

            const failed = results.filter(function (r) { return r.status === 'rejected'; }).length;
            if (failed) alert(failed + ' section(s) failed. You can retry them individually.');
        });

        /* ---- Section manual add ---- */
        $(document).on('click', '.aqs-sec-manual-btn', function () {
            const i = +$(this).data('idx');
            if (!sections[i].questions.length) {
                sections[i].questions.push({ question: '', options: ['', '', '', ''], correct_answer_index: 0, explanation: '' });
            }
            checkAllSectionsReady(true);
        });

        function setSecStatus(i, msg)            { $('.aqs-sec-status[data-idx="' + i + '"]').text(msg); }
        function setSecProgressBar(i, done, total) {
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            $('.aqs-sec-pbar-fill[data-idx="' + i + '"]').css('width', pct + '%');
        }

        function checkAllSectionsReady(force) {
            if (force || sections.every(function (s) { return s.questions.length > 0; })) {
                renderMultiSectionQuestions();
                $('#step-questions, #step-publish').show();
                $('#aqs-all-sections-notice').show();
                $('html,body').animate({ scrollTop: $('#step-questions').offset().top - 20 }, 400);
            }
        }

        /* ---- Render multi-section questions in review ---- */
        function renderMultiSectionQuestions() {
            let html = '';
            let g    = 0;
            sections.forEach(function (sec, si) {
                if (!sec.questions.length) return;
                html += '<div class="aqs-section-review-header" data-sec="' + si + '">&#128218; ' + escHtml(sec.name) + '</div>';
                sec.questions.forEach(function (q) {
                    html += buildQuestionEditHtml(q, g, si); g++;
                });
            });
            $('#aqs-questions-list').html(html);
            updateQuestionCount();
        }

        function buildQuestionEditHtml(q, globalIdx, secIdx) {
            const secAttr   = secIdx !== undefined ? ' data-sec="' + secIdx + '"' : '';
            const hasMath   = typeof renderMath === 'function' && typeof katex !== 'undefined';
            const qPreview  = hasMath ? renderMath(q.question) : escHtml(q.question);
            const optPreviews = q.options.map(function (opt) {
                return hasMath ? renderMath(opt) : escHtml(opt);
            });
            const expPreview = hasMath && q.explanation ? renderMath(q.explanation) : escHtml(q.explanation || '');

            return '<div class="aqs-question-edit" data-index="' + globalIdx + '"' + secAttr + '>' +
                '<div class="aqs-question-edit-header">' +
                    '<span class="aqs-q-num-label">Q' + (globalIdx + 1) + '</span>' +
                    '<button class="aqs-btn aqs-btn-sm aqs-btn-danger aqs-remove-q" data-index="' + globalIdx + '">Remove</button>' +
                '</div>' +
                '<div class="aqs-field">' +
                    '<label>Question</label>' +
                    '<textarea class="aqs-q-text" data-index="' + globalIdx + '" rows="2">' + escHtml(q.question) + '</textarea>' +
                    (hasMath && q.question
                        ? '<div class="aqs-math-preview aqs-q-math-preview" title="Math preview">' + qPreview + '</div>'
                        : '<div class="aqs-math-preview aqs-q-math-preview" style="display:none;"></div>'
                    ) +
                '</div>' +
                '<div class="aqs-options-edit">' +
                    q.options.map(function (opt, oi) {
                        const optPrev = optPreviews[oi];
                        return '<div class="aqs-option-edit">' +
                            '<input type="radio" name="correct_' + globalIdx + '" class="aqs-correct-radio" data-qi="' + globalIdx + '" data-oi="' + oi + '" ' + (q.correct_answer_index === oi ? 'checked' : '') + ' title="Mark correct" />' +
                            '<div class="aqs-opt-wrap">' +
                                '<input type="text" class="aqs-opt-text" data-qi="' + globalIdx + '" data-oi="' + oi + '" value="' + escHtml(opt) + '" placeholder="Option ' + String.fromCharCode(65 + oi) + '" />' +
                                (hasMath && opt
                                    ? '<span class="aqs-opt-math-preview">' + optPrev + '</span>'
                                    : '<span class="aqs-opt-math-preview" style="display:none;"></span>'
                                ) +
                            '</div>' +
                        '</div>';
                    }).join('') +
                '</div>' +
                '<div class="aqs-field"><label>Explanation (practice mode)</label>' +
                '<input type="text" class="aqs-q-explanation" data-index="' + globalIdx + '" value="' + escHtml(q.explanation || '') + '" />' +
                (hasMath && q.explanation
                    ? '<div class="aqs-math-preview aqs-exp-math-preview">' + expPreview + '</div>'
                    : '<div class="aqs-math-preview aqs-exp-math-preview" style="display:none;"></div>'
                ) +
                '</div>' +
            '</div>';
        }

        /* ── Live math preview updates (debounced) ── */
        var _mathPreviewTimer = null;
        function _updateMathPreview($el, text, $preview) {
            if (typeof renderMath !== 'function' || typeof katex === 'undefined') return;
            if (!$preview || !$preview.length) return;
            if (text.trim()) {
                $preview.html(renderMath(text)).show();
            } else {
                $preview.hide();
            }
        }
        $(document).on('input', '.aqs-q-text', function () {
            var $ta      = $(this);
            var $preview = $ta.siblings('.aqs-q-math-preview');
            clearTimeout(_mathPreviewTimer);
            _mathPreviewTimer = setTimeout(function () {
                _updateMathPreview($ta, $ta.val(), $preview);
            }, 350);
        });
        $(document).on('input', '.aqs-opt-text', function () {
            var $in      = $(this);
            var $preview = $in.siblings('.aqs-opt-math-preview');
            clearTimeout(_mathPreviewTimer);
            _mathPreviewTimer = setTimeout(function () {
                _updateMathPreview($in, $in.val(), $preview);
            }, 350);
        });
        $(document).on('input', '.aqs-q-explanation', function () {
            var $in      = $(this);
            var $preview = $in.siblings('.aqs-exp-math-preview');
            clearTimeout(_mathPreviewTimer);
            _mathPreviewTimer = setTimeout(function () {
                _updateMathPreview($in, $in.val(), $preview);
            }, 350);
        });

        /* ============================================================
           SINGLE MODE — source tabs, file, extract
        ============================================================ */
        $(document).on('click', '.aqs-source-tab:not(.aqs-sec-tabs .aqs-source-tab)', function () {
            $('.aqs-source-tab:not(.aqs-sec-tabs .aqs-source-tab)').removeClass('active');
            $(this).addClass('active');
            currentSource = $(this).data('source');
            $('#source-upload, #source-topic, #source-manual').hide();
            $('#source-' + currentSource).show();
            if (currentSource === 'manual') {
                $('#aqs-extract-btn').hide(); $('#aqs-manual-start-btn').show();
                $('#step-questions, #step-publish').show();
            } else {
                $('#aqs-extract-btn').show(); $('#aqs-manual-start-btn').hide();
                if (!extractedQuestions.length) { $('#step-questions, #step-publish').hide(); }
            }
        });

        $('#aqs-browse-btn').on('click', function () { $('#aqs-file-input').click(); });

        const uploadZone = document.getElementById('aqs-upload-zone');
        if (uploadZone) {
            uploadZone.addEventListener('dragover',  function (e) { e.preventDefault(); uploadZone.classList.add('drag-over'); });
            uploadZone.addEventListener('dragleave', function ()  { uploadZone.classList.remove('drag-over'); });
            uploadZone.addEventListener('drop', function (e) {
                e.preventDefault(); uploadZone.classList.remove('drag-over');
                if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
            });
        }

        $('#aqs-file-input').on('change', function () { if (this.files[0]) setFile(this.files[0]); });

        function setFile(file) {
            uploadedFile = file;
            $('#aqs-file-name').text(file.name);
            $('#aqs-upload-zone').hide();
            $('#aqs-file-info').show();
        }

        $(document).on('click', '#aqs-remove-file', function () {
            uploadedFile = null; $('#aqs-file-input').val('');
            $('#aqs-upload-zone').show(); $('#aqs-file-info').hide();
            $('#aqs-doc-stats').hide();
        });

        $('#aqs-extract-btn').on('click', async function () {
            const title   = $('#aqs-title').val().trim();
            const subject = $('#aqs-subject').val().trim();
            const numQ    = parseInt($('#aqs-num-questions').val()) || 10;

            if (!title || !subject) { alert('Fill in Title and Subject first.'); return; }

            let textContent = '';
            showProgress(true);
            $('#aqs-questions-list').empty();
            extractedQuestions = [];

            if (currentSource === 'upload') {
                if (!uploadedFile) { showProgress(false); alert('Upload a document first.'); return; }
                setStatus('Extracting text from document...');
                try { textContent = await extractTextFromFile(uploadedFile); }
                catch (e) { showProgress(false); alert('Could not read file: ' + e.message); return; }
                showDocStats(textContent, uploadedFile);
            } else {
                const topic = $('#aqs-topic-input').val().trim();
                if (!topic) { showProgress(false); alert('Enter a topic first.'); return; }
                textContent = '__TOPIC__:' + topic;
            }

            try {
                await generateQuestionsProgressively(
                    textContent, numQ, subject,
                    $('#aqs-difficulty').val() || 'medium',
                    setStatus,
                    function onBatch(newQs, totalSoFar, total) {
                        /* Append each new question immediately */
                        const startIdx = totalSoFar - newQs.length;
                        newQs.forEach(function (q, offset) {
                            const idx  = startIdx + offset;
                            const html = buildQuestionEditHtml(q, idx);
                            const $el  = $(html).addClass('aqs-q-entering');
                            $('#aqs-questions-list').append($el);
                            setTimeout(function () { $el.removeClass('aqs-q-entering').addClass('aqs-q-visible'); }, 30 * offset);
                        });
                        extractedQuestions = extractedQuestions.concat(newQs);
                        updateQuestionCount();
                        setProgressBar(totalSoFar, total);
                        /* Show the question review panel as soon as first batch arrives */
                        if (totalSoFar === newQs.length) {
                            $('#step-questions, #step-publish').show();
                            $('html,body').animate({ scrollTop: $('#step-questions').offset().top - 20 }, 500);
                        }
                    }
                );
                showProgress(false);
            } catch (e) {
                showProgress(false);
                alert('AI error: ' + e.message);
            }
        });

        function showProgress(show) {
            if (show) {
                setProgressBar(0, 1);
                $('#aqs-ai-progress').show();
                $('#aqs-extract-btn').prop('disabled', true).text('⏳ Generating...');
            } else {
                $('#aqs-ai-progress').hide();
                $('#aqs-extract-btn').prop('disabled', false).text('✨ Generate Questions');
            }
        }
        function setProgressBar(done, total) {
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            $('#aqs-ai-pbar-fill').css('width', pct + '%');
            $('#aqs-ai-pbar-label').text(done + ' / ' + total + ' questions generated');
        }
        function setStatus(msg) { $('#aqs-ai-status').text(msg); }

        /* ============================================================
           FILE EXTRACTION
        ============================================================ */
        async function extractTextFromFile(file) {
            if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) return extractPDF(file);
            return extractDocx(file);
        }

        async function extractPDF(file) {
            return new Promise(function (resolve, reject) {
                const reader = new FileReader();
                reader.onload = async function (e) {
                    try {
                        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                        const pdf = await pdfjsLib.getDocument({ data: e.target.result }).promise;
                        let text = '';
                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const c    = await page.getTextContent();
                            text += c.items.map(function (s) { return s.str; }).join(' ') + '\n';
                        }
                        resolve(text);
                    } catch (err) { reject(err); }
                };
                reader.onerror = reject;
                reader.readAsArrayBuffer(file);
            });
        }

        async function extractDocx(file) {
            return new Promise(function (resolve, reject) {
                const reader = new FileReader();
                reader.onload = async function (e) {
                    try {
                        const result = await mammoth.extractRawText({ arrayBuffer: e.target.result });
                        resolve(result.value);
                    } catch (err) { reject(err); }
                };
                reader.onerror = reject;
                reader.readAsArrayBuffer(file);
            });
        }

        function showDocStats(text, file) {
            const chars = text.length;
            const words = text.trim().split(/\s+/).filter(Boolean).length;
            const pages = Math.ceil(chars / 3000) || 1;
            const ext   = (file.name.split('.').pop() || 'file').toUpperCase();
            $('#aqs-doc-stats').html(
                '<strong>' + ext + '</strong> &nbsp;&middot;&nbsp; ' +
                chars.toLocaleString() + ' characters &nbsp;&middot;&nbsp; ' +
                words.toLocaleString() + ' words &nbsp;&middot;&nbsp; ' +
                '~' + pages + ' page' + (pages !== 1 ? 's' : '')
            ).show();
        }

        /* ============================================================
           AI GENERATION — Multi-layer resilience:
           Layer 1: WordPress server-side AJAX proxy (avoids CORS).
                    5 models × 3 retries = 15 server attempts.
                    Exponential back-off: 1.5 s → 3 s → 6 s.
           Layer 2: Browser-direct fallback to Pollinations API.
                    Used when ALL server attempts fail (e.g. server
                    cannot reach Pollinations but browser can).
        ============================================================ */
        /* ══════════════════════════════════════════════════════════════
           callAI — adias-pastries raceAI strategy (FAST)
           Fires multiple AI models SIMULTANEOUSLY — first good
           response wins. 5–10× faster than the old sequential loop.
           Group 1 fires first; if all fail, Group 2 fires, etc.
        ══════════════════════════════════════════════════════════════ */
        const RACE_GROUPS = [
            ['openai-fast', 'openai', 'mistral'],       /* Group 1 — fastest / most reliable */
            ['openai-large', 'mistral-large', 'llama'], /* Group 2 — larger backup models    */
            ['qwen-coder', 'deepseek', 'command-r'],    /* Group 3 — last resort             */
        ];

        /* Single server-proxy call (25 s timeout) */
        function _proxyCall(prompt, model) {
            return new Promise(function (resolve, reject) {
                $.ajax({
                    url:     AQS.ajax_url,
                    type:    'POST',
                    timeout: 25000,
                    data: {
                        action: 'aqs_ai_generate',
                        nonce:  AQS.nonce || (AQS.public_nonce || ''),
                        prompt: prompt,
                        model:  model,
                        seed:   Math.floor(Math.random() * 99999),
                    },
                    success: function (res) {
                        const text = (res && res.success && res.data && res.data.text)
                                     ? res.data.text.trim() : '';
                        if (text.length > 20) resolve(text);
                        else reject(new Error('empty'));
                    },
                    error: function (xhr, s) { reject(new Error('proxy ' + (xhr.status || s))); },
                });
            });
        }

        /* Shared system prompt — used by all direct browser calls */
        var _DIRECT_SYS = 'You are an expert quiz maker. Output ONLY a raw valid JSON array. No markdown, no code fences, no explanation. Just the JSON array.\n\nMath formatting rule (self-activating — apply ONLY when content contains math):\n- Wrap ALL mathematical expressions in LaTeX dollar-sign delimiters. Never write raw math.\n  Inline: $x^2+3x$, $\\sqrt{x+4}$, $\\frac{3}{4}$, $a^{n}$, $\\sqrt[3]{8}$\n  Display: $$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$\n  WRONG: sqrt(x+4)  CORRECT: $\\sqrt{x+4}$\n  WRONG: x^2+1      CORRECT: $x^2+1$\n  WRONG: a/b = 3    CORRECT: $\\frac{a}{b} = 3$';

        /* ── _streamDirectCall: SSE streaming — shows questions one-by-one as tokens arrive ── */
        function _streamDirectCall(prompt, model, onPartialQuestion) {
            var ctrl = new AbortController();
            var tid  = setTimeout(function () { ctrl.abort(); }, 30000);
            return fetch('https://text.pollinations.ai/openai', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                signal:  ctrl.signal,
                body: JSON.stringify({
                    model: model,
                    seed: Math.floor(Math.random() * 99999),
                    temperature: 0.35,
                    stream: true,
                    messages: [
                        { role: 'system', content: _DIRECT_SYS },
                        { role: 'user',   content: prompt },
                    ],
                }),
            }).then(function (r) {
                clearTimeout(tid);
                if (!r.ok) throw new Error('HTTP ' + r.status);
                var reader  = r.body.getReader();
                var decoder = new TextDecoder();
                var accum   = '';
                var emitted = 0;

                /* Extract all NEWLY complete question objects from the accumulated JSON buffer */
                function flushQuestions() {
                    var depth = 0, start = -1, inStr = false, esc = false;
                    for (var i = 0; i < accum.length; i++) {
                        var c = accum[i];
                        if (esc)              { esc = false; continue; }
                        if (c === '\\' && inStr) { esc = true; continue; }
                        if (c === '"')        { inStr = !inStr; continue; }
                        if (inStr)            continue;
                        if (c === '[' || c === '{') {
                            if (c === '{' && depth === 1) start = i;
                            depth++;
                        } else if (c === ']' || c === '}') {
                            depth--;
                            if (c === '}' && depth === 1 && start !== -1) {
                                var objStr = accum.slice(start, i + 1);
                                var objIdx = emitted; /* capture before potential increment */
                                try {
                                    var q = JSON.parse(objStr);
                                    if (q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length >= 2) {
                                        emitted++;
                                        if (onPartialQuestion) onPartialQuestion(q, objIdx);
                                    }
                                } catch (_) {}
                                start = -1;
                            }
                        }
                    }
                }

                function pump() {
                    return reader.read().then(function (chunk) {
                        if (chunk.done) {
                            return accum.length > 10 ? accum : Promise.reject(new Error('empty stream'));
                        }
                        var raw = decoder.decode(chunk.value, { stream: true });
                        raw.split('\n').forEach(function (line) {
                            if (!line.startsWith('data: ')) return;
                            var json = line.slice(6).trim();
                            if (json === '[DONE]') return;
                            try {
                                var d     = JSON.parse(json);
                                var delta = (((d.choices || [])[0] || {}).delta || {}).content || '';
                                if (delta) { accum += delta; flushQuestions(); }
                            } catch (_) {}
                        });
                        return pump();
                    });
                }
                return pump();
            }).catch(function (e) { clearTimeout(tid); throw e; });
        }

        /* Single direct browser call to Pollinations — non-streaming fallback (22 s timeout) */
        function _directCall(prompt, model) {
            const ctrl = new AbortController();
            const tid  = setTimeout(function () { ctrl.abort(); }, 22000);
            return fetch('https://text.pollinations.ai/openai', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                signal:  ctrl.signal,
                body: JSON.stringify({
                    model: model, seed: Math.floor(Math.random() * 99999), temperature: 0.4,
                    messages: [
                        { role: 'system', content: _DIRECT_SYS },
                        { role: 'user',   content: prompt },
                    ],
                }),
            }).then(function (r) { clearTimeout(tid); return r.json(); })
              .then(function (d) {
                  const t = (((d.choices || [])[0] || {}).message || {}).content || '';
                  if (t.trim().length > 20) return t.trim();
                  throw new Error('empty direct');
              }).catch(function (e) { clearTimeout(tid); throw e; });
        }

        /* Race all models in a group PLUS one direct call — first winner resolves */
        function _raceGroup(prompt, models) {
            return new Promise(function (resolve, reject) {
                let won = false;
                let pending = models.length + 1; /* N proxy + 1 direct */
                function win(t)  { if (!won) { won = true; resolve(t); } }
                function fail()  { if (!won && --pending === 0) reject(new Error('group failed')); }
                models.forEach(function (m) { _proxyCall(prompt, m).then(win).catch(fail); });
                _directCall(prompt, models[0]).then(win).catch(fail);
            });
        }

        async function callAI(prompt, statusFn) {
            statusFn = statusFn || setStatus;
            for (let gi = 0; gi < RACE_GROUPS.length; gi++) {
                const models = RACE_GROUPS[gi];
                statusFn('Generating' + (gi > 0 ? ' (backup models)' : '') +
                         '… racing ' + (models.length + 1) + ' AI connections simultaneously…');
                try {
                    const text = await _raceGroup(prompt, models);
                    if (text) return text;
                } catch (e) {
                    console.warn('[AQS] Race group ' + (gi + 1) + ' failed:', e.message);
                    if (gi < RACE_GROUPS.length - 1) {
                        statusFn('Switching to backup models…');
                        await new Promise(function (r) { setTimeout(r, 1500); });
                    }
                }
            }
            throw new Error('AI generation failed. Please check your connection and try again.');
        }

        /* ─────────────────────────────────────────────────────────
           PROGRESSIVE GENERATION — fires batches of 3 questions
           so they appear in the list one after another as they arrive.
           Up to 10 hosts can run simultaneously — each AJAX call is
           fully independent (stateless server side).
        ───────────────────────────────────────────────────────── */
        const AQS_BATCH = 10;  /* questions per batch — larger = fewer API round-trips */

        function buildBatchPrompt(textContent, batchSize, subject, difficulty, prev) {
            const schema = '[{"question":"...","options":["A","B","C","D"],"correct_answer_index":0,"explanation":"..."}]';
            let avoid = prev.length
                ? '\n\nAlready generated — DO NOT repeat or overlap:\n' + prev.map(function (q, i) { return (i + 1) + '. ' + q.question; }).join('\n')
                : '';

            /* Math LaTeX rule — always included but self-activating: the AI applies it
               only when it naturally produces mathematical content, so non-math quizzes
               are unaffected while math quizzes get full LaTeX rendering automatically. */
            const mathRule =
                '\n- If any question or option contains a mathematical expression (numbers in formulas, symbols, roots, fractions, powers, equations, etc.) you MUST wrap it in LaTeX dollar-sign delimiters — NEVER write raw math.' +
                '\n  Inline: $x^2 + 3x$, $\\sqrt{x+4}$, $\\frac{3}{4}$, $a^{n}$, $\\sqrt[3]{8}$' +
                '\n  Display: $$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$' +
                '\n  WRONG: sqrt(x+4)  →  CORRECT: $\\sqrt{x+4}$' +
                '\n  WRONG: x^2+1      →  CORRECT: $x^2+1$' +
                '\n  WRONG: a/b = 3    →  CORRECT: $\\frac{a}{b} = 3$';

            const rules = 'Rules:\n- 4 options each, one correct, brief explanation.' + mathRule + '\n- Output a RAW JSON ARRAY only — no markdown fences, no extra text:\n' + schema;

              var _mathMode = isMathSubject(subject, textContent);
              if (textContent.startsWith('__TOPIC__:')) {
                const topic = textContent.replace('__TOPIC__:', '').trim();
                return 'Generate exactly ' + batchSize + ' multiple-choice questions about the following topic.\n' +
                    'Use your own knowledge — do NOT ask for a document. Generate the questions directly.\n' +
                    'Topic: ' + topic + '\nSubject: ' + subject + '\nDifficulty: ' + (difficulty || 'medium') + avoid + '\n\n' + rules;
            }
            const excerpt = textContent.substring(0, 6000);
            return 'Create exactly ' + batchSize + ' multiple-choice questions from the text below.\n' +
                'Subject: ' + subject + '\nDifficulty: ' + (difficulty || 'medium') + avoid + '\n\nContent:\n' + excerpt + '\n\n' + rules;
        }

        function parseQuestionsFromText(rawText) {
            let cleaned = rawText.replace(/```json[\r\n]*/gi, '').replace(/```[\r\n]*/g, '').trim();
            const ib = cleaned.indexOf('{'); const ia = cleaned.indexOf('[');
            if (ib !== -1 && (ia === -1 || ib < ia)) cleaned = cleaned.substring(ib);
            else if (ia !== -1) cleaned = cleaned.substring(ia);
            let parsed = null;
            const am = cleaned.match(/\[[\s\S]*\]/);
            if (am) { try { const a = JSON.parse(am[0]); if (Array.isArray(a)) parsed = a; } catch (_) {} }
            if (!parsed) {
                const om = cleaned.match(/\{[\s\S]*\}/);
                if (om) { try { const d = JSON.parse(om[0]); parsed = d.questions || null; } catch (_) {} }
            }
            if (!parsed) { try { const d = JSON.parse(cleaned); parsed = Array.isArray(d) ? d : d.questions; } catch (_) {} }
            if (!Array.isArray(parsed) || !parsed.length) {
                console.error('[AQS] raw:', rawText.substring(0, 600));
                throw new Error('AI returned an unexpected format. Please try again.');
            }
            return parsed.filter(function (q) {
                return q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length >= 2;
            });
        }

        async function generateQuestionsProgressively(textContent, numQ, subject, difficulty, statusFn, onBatch) {
            let allGenerated = [];

            while (allGenerated.length < numQ) {
                const remaining  = numQ - allGenerated.length;
                const batchSize  = Math.min(AQS_BATCH, remaining);
                const MAX_RETRIES = 3;
                let batchErr = null;

                for (let retry = 1; retry <= MAX_RETRIES; retry++) {
                    const retryLabel = retry > 1 ? ' (retry ' + (retry - 1) + ')' : '';
                    statusFn('Generating questions ' + (allGenerated.length + 1) + '–' +
                             (allGenerated.length + batchSize) + ' of ' + numQ + retryLabel + '…');

                    const prompt     = buildBatchPrompt(textContent, batchSize, subject, difficulty, allGenerated);
                    const beforeCount = allGenerated.length;
                    let succeeded    = false;

                    /* ── Path A: Streaming direct call — questions appear one by one as tokens arrive ── */
                    try {
                        await _streamDirectCall(prompt, 'openai-fast', function (q) {
                            if (allGenerated.length - beforeCount >= batchSize) return; /* got enough */
                            allGenerated.push(q);
                            onBatch([q], allGenerated.length, numQ);
                        });
                        if (allGenerated.length > beforeCount) { succeeded = true; batchErr = null; break; }
                    } catch (e) {
                        /* If streaming emitted some questions before failing, keep them */
                        if (allGenerated.length > beforeCount) { succeeded = true; batchErr = null; break; }
                        console.warn('[AQS] Streaming failed, falling back to race:', e.message);
                    }

                    /* ── Path B: Non-streaming multi-model race (fallback) ── */
                    if (!succeeded) {
                        try {
                            const rawText = await callAI(prompt, function () {});
                            const newQs   = parseQuestionsFromText(rawText).slice(0, batchSize);
                            if (newQs.length > 0) {
                                allGenerated = allGenerated.concat(newQs);
                                onBatch(newQs, allGenerated.length, numQ);
                                succeeded = true; batchErr = null; break;
                            }
                            batchErr = new Error('AI returned no valid questions.');
                        } catch (e) {
                            batchErr = e;
                        }
                    }

                    if (!succeeded && retry < MAX_RETRIES) {
                        statusFn('Generation hiccup — retrying in a moment…');
                        await new Promise(function (r) { setTimeout(r, 3000 * retry); });
                    }
                }

                if (batchErr) throw batchErr;
            }
            return allGenerated;
        }

        /* Legacy wrapper — still used by multi-section individual generates */
        async function generateQuestionsWithAI(textContent, numQ, subject, difficulty, statusFn) {
            const collected = [];
            await generateQuestionsProgressively(textContent, numQ, subject, difficulty, statusFn, function (batch) {
                batch.forEach(function (q) { collected.push(q); });
            });
            return collected;
        }

        /* ---- Render questions (single mode) ---- */
        function renderQuestions(questions) {
            let html = '';
            questions.forEach(function (q, i) { html += buildQuestionEditHtml(q, i); });
            $('#aqs-questions-list').html(html);
            updateQuestionCount();
        }

        function updateQuestionCount() {
            const n = $('#aqs-questions-list .aqs-question-edit').length;
            $('#aqs-q-count').text(n + ' question' + (n !== 1 ? 's' : ''));
        }

        /* ---- Custom pre-quiz form builder ---- */
        $(document).on('click', '#aqs-add-field-btn', function () {
            cqFormFields.push({ label: '', type: 'text', options: '', required: true }); cqRenderForm();
        });
        $(document).on('input',  '.aqs-field-label',    function () { cqFormFields[+$(this).data('index')].label   = $(this).val(); });
        $(document).on('change', '.aqs-field-required', function () { cqFormFields[+$(this).data('index')].required = $(this).val() === '1'; });
        $(document).on('input',  '.aqs-field-options',  function () { cqFormFields[+$(this).data('index')].options  = $(this).val(); });
        $(document).on('change', '.aqs-field-type', function () { cqFormFields[+$(this).data('index')].type = $(this).val(); cqRenderForm(); });
        $(document).on('click', '.aqs-remove-field-btn', function () { cqFormFields.splice(+$(this).data('index'), 1); cqRenderForm(); });

        function cqRenderForm() {
            if (!cqFormFields.length) {
                $('#aqs-form-fields-list').html('<p class="aqs-empty">No custom fields yet. Click &ldquo;+ Add Field&rdquo; to add one.</p>'); return;
            }
            let html = '';
            cqFormFields.forEach(function (f, i) {
                html += '<div class="aqs-form-field-row" data-index="' + i + '"><div class="aqs-form-field-inner">' +
                    '<div class="aqs-field" style="flex:2"><label>Field Label</label>' +
                    '<input type="text" class="aqs-field-label" data-index="' + i + '" value="' + escHtml(f.label) + '" placeholder="e.g. Student ID"/></div>' +
                    '<div class="aqs-field" style="flex:1"><label>Type</label>' +
                    '<select class="aqs-field-type" data-index="' + i + '">' +
                        '<option value="text"'  + (f.type==='text'  ?' selected':'') + '>Text</option>' +
                        '<option value="email"' + (f.type==='email' ?' selected':'') + '>Email</option>' +
                        '<option value="number"'+ (f.type==='number'?' selected':'') + '>Number</option>' +
                        '<option value="phone"' + (f.type==='phone' ?' selected':'') + '>Phone</option>' +
                        '<option value="select"'+ (f.type==='select'?' selected':'') + '>Dropdown</option>' +
                    '</select></div>' +
                    '<div class="aqs-field" style="flex:1"><label>Required?</label>' +
                    '<select class="aqs-field-required" data-index="' + i + '">' +
                        '<option value="1"' + ( f.required?' selected':'') + '>Yes</option>' +
                        '<option value="0"' + (!f.required?' selected':'') + '>No</option>' +
                    '</select></div>' +
                    '<button class="aqs-btn aqs-btn-sm aqs-btn-danger aqs-remove-field-btn" data-index="' + i + '" style="align-self:flex-end">&#10005;</button>' +
                    '</div>' +
                    (f.type === 'select'
                        ? '<div class="aqs-field" style="margin-top:6px"><label>Options (comma-separated)</label>' +
                          '<input type="text" class="aqs-field-options" data-index="' + i + '" value="' + escHtml(f.options) + '" placeholder="Option A, Option B, Option C"/></div>'
                        : '') +
                    '</div>';
            });
            $('#aqs-form-fields-list').html(html);
        }

        /* ---- Manual start ---- */
        $(document).on('click', '#aqs-manual-start-btn', function () {
            if (!extractedQuestions.length) {
                extractedQuestions.push({ question: '', options: ['', '', '', ''], correct_answer_index: 0, explanation: '' });
                renderQuestions(extractedQuestions);
            }
            $('#step-questions, #step-publish').show();
            $('html,body').animate({ scrollTop: $('#step-questions').offset().top - 20 }, 400);
        });

        /* ---- Add question button ---- */
        $(document).on('click', '#aqs-add-question-btn', function () {
            if (quizFormat === 'multi' && sections.length) {
                sections[sections.length - 1].questions.push({ question: '', options: ['', '', '', ''], correct_answer_index: 0, explanation: '' });
                renderMultiSectionQuestions();
            } else {
                extractedQuestions.push({ question: '', options: ['', '', '', ''], correct_answer_index: 0, explanation: '' });
                renderQuestions(extractedQuestions);
            }
            $('#step-questions, #step-publish').show();
        });

        /* ---- Remove question ---- */
        $(document).on('click', '.aqs-remove-q', function () {
            const idx = parseInt($(this).data('index'));
            if (quizFormat === 'multi') {
                let g = 0;
                for (let si = 0; si < sections.length; si++) {
                    for (let qi = 0; qi < sections[si].questions.length; qi++) {
                        if (g === idx) { sections[si].questions.splice(qi, 1); renderMultiSectionQuestions(); return; }
                        g++;
                    }
                }
            } else {
                extractedQuestions.splice(idx, 1);
                renderQuestions(extractedQuestions);
            }
        });

        /* ---- Collect all questions (with section_label for multi) ---- */
        function collectQuestions() {
            const updated = [];
            if (quizFormat === 'multi') {
                sections.forEach(function (sec, si) {
                    $('#aqs-questions-list .aqs-question-edit[data-sec="' + si + '"]').each(function () {
                        const question = $(this).find('.aqs-q-text').val().trim();
                        const options  = [];
                        let   correct  = 0;
                        $(this).find('.aqs-opt-text').each(function () { options.push($(this).val().trim()); });
                        $(this).find('.aqs-correct-radio:checked').each(function () { correct = +$(this).data('oi'); });
                        const explanation = $(this).find('.aqs-q-explanation').val().trim();
                        if (question) updated.push({ question, options, correct_answer_index: correct, explanation, section_label: sec.name });
                    });
                    /* fallback if DOM has no data-sec matches yet */
                    if (!updated.length) {
                        sec.questions.forEach(function (q) {
                            updated.push(Object.assign({}, q, { section_label: sec.name }));
                        });
                    }
                });
            } else {
                $('#aqs-questions-list .aqs-question-edit').each(function () {
                    const question = $(this).find('.aqs-q-text').val().trim();
                    const options  = [];
                    let   correct  = 0;
                    $(this).find('.aqs-opt-text').each(function () { options.push($(this).val().trim()); });
                    $(this).find('.aqs-correct-radio:checked').each(function () { correct = +$(this).data('oi'); });
                    const explanation = $(this).find('.aqs-q-explanation').val().trim();
                    if (question) updated.push({ question, options, correct_answer_index: correct, explanation });
                });
            }
            return updated;
        }

        function saveQuizPayload(qs) {
            return {
                action:        'aqs_save_quiz',
                nonce:         AQS.nonce,
                quiz_id:       currentQuizId || 0,
                title:         $('#aqs-title').val().trim(),
                subject:       $('#aqs-subject').val().trim(),
                num_questions: $('#aqs-num-questions').val(),
                time_limit:    $('#aqs-time-limit').val(),
                mode:          $('#aqs-mode').val(),
                allow_retakes: parseInt($('#aqs-max-attempts').val()) || 0,
                quiz_note:     $('#aqs-quiz-note').val().trim(),
                questions:     JSON.stringify(qs),
                custom_form:   JSON.stringify(cqFormFields)
            };
        }

        /* ---- Save draft ---- */
        $('#aqs-save-draft-btn').on('click', function () {
            const qs = collectQuestions();
            if (!$('#aqs-title').val().trim() || !$('#aqs-subject').val().trim()) { alert('Title and subject required.'); return; }
            if (!qs.length) { alert('Add at least one question.'); return; }
            $.post(AQS.ajax_url, saveQuizPayload(qs), function (res) {
                if (res.success) { currentQuizId = res.data.quiz_id; alert('Saved as draft!'); }
                else alert('Error: ' + res.data);
            });
        });

        /* ---- Publish ---- */
        $('#aqs-publish-btn').on('click', function () {
            const qs = collectQuestions();
            if (!$('#aqs-title').val().trim() || !$('#aqs-subject').val().trim()) { alert('Title and subject required.'); return; }
            if (!qs.length) { alert('Add at least one question.'); return; }
            $('#aqs-publish-btn').prop('disabled', true).text('⏳ Publishing…');
            $.post(AQS.ajax_url, saveQuizPayload(qs), function (res) {
                if (!res.success) { $('#aqs-publish-btn').prop('disabled', false).text('🚀 Publish & Get Links'); alert('Save error: ' + res.data); return; }
                currentQuizId = res.data.quiz_id;

                /* Gather expiry settings */
                var pubPayload = { action: 'aqs_publish_quiz', nonce: AQS.nonce, quiz_id: currentQuizId };
                var expiryType = $('input[name="aqs_expiry_type"]:checked').val() || 'none';
                pubPayload.expiry_type = expiryType;
                if (expiryType === 'datetime') {
                    pubPayload.expiry_datetime = $('#aqs-expiry-datetime').val();
                } else if (expiryType === 'duration') {
                    pubPayload.expiry_days  = parseInt($('#aqs-expiry-days').val(), 10) || 0;
                    pubPayload.expiry_hours = parseInt($('#aqs-expiry-hours').val(), 10) || 0;
                }

                $.post(AQS.ajax_url, pubPayload, function (pubRes) {
                    $('#aqs-publish-btn').prop('disabled', false).text('🚀 Publish & Get Links');
                    if (!pubRes.success) { alert('Publish error: ' + pubRes.data); return; }

                    /* ── Quiz take link ── */
                    $('#aqs-quiz-link').val(pubRes.data.quiz_url || '');

                    /* ── Challenge link ── */
                    var challengeUrl = pubRes.data.challenge_url || '';
                    $('#aqs-challenge-link').val(challengeUrl);
                    $('#aqs-go-challenge-btn').attr('href', challengeUrl);

                    /* ── Dashboard link ── */
                    var dashUrl = pubRes.data.dashboard_url || '';
                    if (dashUrl) $('#aqs-go-dashboard-btn').attr('href', dashUrl);

                    /* ── Expiry notice ── */
                    if (pubRes.data.expires_at) {
                        var expiresDate = new Date(pubRes.data.expires_at.replace(' ', 'T') + 'Z');
                        var $en = $('#aqs-expiry-notice');
                        if (!$en.length) {
                            $('#aqs-publish-result').append('<div id="aqs-expiry-notice" style="margin-top:10px;padding:8px 14px;background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;color:#92400e;font-size:.88rem;"></div>');
                            $en = $('#aqs-expiry-notice');
                        }
                        $en.text('⏳ Quiz expires: ' + expiresDate.toLocaleString()).show();
                    }

                    /* ── Auto-print quiz trigger (show print button for latest quiz) ── */
                    var printData = pubRes.data.print_quiz;
                    if (printData && printData.questions && printData.questions.length) {
                        var $pr = $('#aqs-print-quiz-wrap');
                        if (!$pr.length) {
                            $('#aqs-publish-result').append('<div id="aqs-print-quiz-wrap" style="margin-top:10px;"></div>');
                            $pr = $('#aqs-print-quiz-wrap');
                        }
                        var encodedData = encodeURIComponent(JSON.stringify(printData));
                        $pr.html('<button class="aqs-btn aqs-btn-ghost" id="aqs-auto-print-quiz-btn">🖨️ Print This Quiz</button>');
                        $pr.find('#aqs-auto-print-quiz-btn').on('click', function () {
                            aqsPrintQuiz(printData);
                        });
                    }

                    $('#aqs-publish-result').show();
                    $('#aqs-publish-btn').hide();
                    $('html,body').animate({ scrollTop: $('#aqs-publish-result').offset().top - 20 }, 400);
                });
            });
        });

        /* ── Copy quiz link ── */
        $(document).on('click', '#aqs-copy-link', function () {
            var val = $('#aqs-quiz-link').val();
            if (!val) return;
            navigator.clipboard.writeText(val).then(function () {
                $('#aqs-copy-link').text('Copied!');
                setTimeout(function () { $('#aqs-copy-link').text('Copy'); }, 2000);
            }).catch(function () {
                $('#aqs-quiz-link').select(); document.execCommand('copy');
                $('#aqs-copy-link').text('Copied!');
                setTimeout(function () { $('#aqs-copy-link').text('Copy'); }, 2000);
            });
        });

        /* ── Copy challenge link ── */
        $(document).on('click', '#aqs-copy-challenge-link', function () {
            var val = $('#aqs-challenge-link').val();
            if (!val) return;
            navigator.clipboard.writeText(val).then(function () {
                $('#aqs-copy-challenge-link').text('Copied!');
                setTimeout(function () { $('#aqs-copy-challenge-link').text('Copy'); }, 2000);
            }).catch(function () {
                $('#aqs-challenge-link').select(); document.execCommand('copy');
                $('#aqs-copy-challenge-link').text('Copied!');
                setTimeout(function () { $('#aqs-copy-challenge-link').text('Copy'); }, 2000);
            });
        });
    }
    }); /* end create-quiz ready */

    /* =========================================================
       TAKE QUIZ  (v3 — A/B/C sections, auto-next, pro sound)
    ========================================================= */
    if ($('#aqs-take-quiz').length) {
        let quizData        = null;
        let questions       = [];
        let userAnswers     = {};
        let answeredCorrect = {};
        let currentQuestion = 0;
        let timerInterval   = null;
        let secondsLeft     = 0;
        let quizSubmitted   = false;
        let participantName = '';
        let customFormValues= {};
        let soundMuted      = false;
        let audioCtx        = null;
        let ambientNodes    = [];
        let particleAnim    = null;

        /* ── Multi-section state ── */
        const SEC_LETTERS  = ['A','B','C','D','E'];
        let sectionGroups  = []; // [{letter,label,startIdx,endIdx}]
        let currentSection = 0;
        let isMultiSection = false;
        let autoAdvTimer   = null;   // timeout handle for auto-advance

        /* ─────────────────────────────────────────────────────
           LOAD QUIZ
        ───────────────────────────────────────────────────── */
        function getTokenFromUrl() {
            var p = new URLSearchParams(window.location.search);
            return p.get('token') || p.get('quiz');
        }
        const token = getTokenFromUrl();
        if (!token) {
            $('#aqs-quiz-loading').hide();
            $('#aqs-quiz-not-found').show();
        } else {
            /* Wait for the Firebase module to patch jQuery before making the AJAX call.
               The firebase.js module is deferred and may not yet have run when this
               inline script executes — without this guard the call hits a non-existent
               /firebase URL and returns 404, which shows "quiz not found". */
            function _whenFirebaseReady(fn) {
                if (window._aqsFirebaseReady) { fn(); return; }
                document.addEventListener('aqs:firebase:ready', fn, { once: true });
            }
            _whenFirebaseReady(function () {
            $.ajax({
                url:      AQS.ajax_url,
                type:     'POST',
                dataType: 'json',
                timeout:  20000,
                data:     { action: 'aqs_get_quiz_public', nonce: AQS.public_nonce, token: token },
                success: function (res) {
                    $('#aqs-quiz-loading').hide();
                    if (!res || !res.success) {
                        /* Host disabled this quiz */
                        if (res && res.data && typeof res.data === 'object' && res.data.disabled) {
                            $('#aqs-quiz-disabled').show();
                        } else {
                            $('#aqs-quiz-not-found').show();
                        }
                        return;
                    }
                    quizData  = res.data;
                    questions = quizData.questions;
                    buildSectionGroups();
                    populateEntryScreen();
                    $('#aqs-quiz-info').show();
                },
                error: function (xhr, status, err) {
                    $('#aqs-quiz-loading').hide();
                    var msg = (status === 'timeout')
                        ? 'The request timed out. Please check your connection and refresh the page.'
                        : 'Could not load the quiz (' + (err || status) + '). Please refresh and try again.';
                    $('#aqs-quiz-not-found').html(
                        '<div style="text-align:center;padding:32px 20px;">'
                        + '<div style="font-size:3rem;margin-bottom:16px;">⚠️</div>'
                        + '<h2 style="color:#92400e;margin-bottom:10px;">Unable to Load Quiz</h2>'
                        + '<p style="color:#78350f;max-width:480px;margin:0 auto 20px;">' + msg + '</p>'
                        + '<button class="aqs-btn" onclick="location.reload()">🔄 Retry</button>'
                        + '</div>'
                    ).show();
                }
            });
            }); /* end _whenFirebaseReady */
        }

        /* ─────────────────────────────────────────────────────
           SECTION GROUPS
        ───────────────────────────────────────────────────── */
        function buildSectionGroups() {
            const hasSec = questions.some(function (q) { return q.section_label; });
            if (!hasSec) { isMultiSection = false; return; }
            isMultiSection = true;
            sectionGroups  = [];
            questions.forEach(function (q, i) {
                const label = q.section_label || 'Section';
                const last  = sectionGroups[sectionGroups.length - 1];
                if (!last || last.label !== label) {
                    sectionGroups.push({
                        letter  : SEC_LETTERS[sectionGroups.length] || String.fromCharCode(65 + sectionGroups.length),
                        label   : label,
                        startIdx: i,
                        endIdx  : i
                    });
                } else { last.endIdx = i; }
            });
        }

        function getSectionFor(idx) {
            return sectionGroups.find(function (s) { return idx >= s.startIdx && idx <= s.endIdx; }) || null;
        }

        /* ─────────────────────────────────────────────────────
           ENTRY SCREEN
        ───────────────────────────────────────────────────── */
        var takerEmail    = '';
        var attemptsUsed  = 0;

        function populateEntryScreen() {
            $('#take-quiz-title').text(quizData.title);
            $('#take-quiz-subject').text(quizData.subject);
            $('#take-num-q').text(quizData.num_questions);
            $('#take-time').text(quizData.time_limit);
            $('#take-mode').text(quizData.mode.charAt(0).toUpperCase() + quizData.mode.slice(1));

            /* Quiz Note */
            if (quizData.quiz_note && quizData.quiz_note.trim()) {
                $('#aqs-quiz-note-box').html('<strong>📝 Note from host:</strong> ' + escHtml(quizData.quiz_note)).show();
            }

            /* Show email field when a retake limit is set */
            if (parseInt(quizData.allow_retakes) > 0) {
                $('#aqs-email-field-wrap').show();
            }

            if (isMultiSection && sectionGroups.length) {
                let sh = '<div class="aqs-entry-sections"><span class="aqs-entry-sec-title">📋 Sections:</span>';
                sectionGroups.forEach(function (sg) {
                    sh += '<span class="aqs-sec-pill-entry"><strong>' + sg.letter + '</strong> ' + escHtml(sg.label) + '</span>';
                });
                sh += '</div>';
                $('#take-quiz-subject').after(sh);
            }

            const cf = quizData.custom_form || [];
            if (cf.length) {
                let html = '<div class="aqs-custom-form-card">' +
                           '<div class="aqs-custom-form-header"><span class="aqs-custom-form-icon">📋</span><span>Additional Information Required</span></div>' +
                           '<div class="aqs-custom-form-body">';
                cf.forEach(function (f) {
                    const req  = f.required ? 'required' : '';
                    const star = f.required ? '<span class="aqs-req-star">*</span>' : '';
                    html += '<div class="aqs-field aqs-entry-field"><label>' + escHtml(f.label) + ' ' + star + '</label>';
                    if (f.type === 'select') {
                        const opts = (f.options||'').split(',').map(function(o){return o.trim();}).filter(Boolean);
                        html += '<select class="aqs-custom-field" data-label="' + escHtml(f.label) + '" ' + req + '><option value="">— Select ' + escHtml(f.label) + ' —</option>';
                        opts.forEach(function(o){ html += '<option value="' + escHtml(o) + '">' + escHtml(o) + '</option>'; });
                        html += '</select>';
                    } else {
                        const it = f.type === 'phone' ? 'tel' : (f.type === 'email' ? 'email' : (f.type || 'text'));
                        html += '<input type="' + it + '" class="aqs-custom-field" data-label="' + escHtml(f.label) + '" placeholder="Enter ' + escHtml(f.label.toLowerCase()) + '" ' + req + ' />';
                    }
                    html += '</div>';
                });
                html += '</div></div>';
                $('#aqs-custom-form-fields').html(html);
            }
        }

        $('#aqs-start-quiz-btn').on('click', function () {
            /* Pre-unlock audio within user gesture (must be synchronous) */
            _unlockAudioContext();

            /* Validate custom form fields */
            let valid = true;
            customFormValues = {};
            $('.aqs-custom-field').each(function () {
                const label = $(this).data('label');
                const val   = $(this).val().trim();
                const req   = $(this).prop('required');
                if (req && !val) { $(this).addClass('aqs-field-error'); valid = false; }
                else             { $(this).removeClass('aqs-field-error'); customFormValues[label] = val; }
            });
            if (!valid) { alert('Please fill in all required fields before starting.'); return; }
            participantName = $('#take-participant-name').val().trim() || 'Anonymous';

            /* Retake check — if quiz has an attempt limit */
            if (parseInt(quizData.allow_retakes) > 0) {
                const emailVal = $('#take-taker-email').val().trim();
                if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
                    $('#take-taker-email').addClass('aqs-field-error').focus();
                    alert('Please enter a valid email address to verify your attempt count.');
                    return;
                }
                takerEmail = emailVal;
                $('#take-taker-email').removeClass('aqs-field-error');

                /* Check with server */
                const $btn = $(this);
                $btn.prop('disabled', true).text('Checking...');
                $.post(AQS.ajax_url, {
                    action:       'aqs_check_retake',
                    nonce:        AQS.public_nonce,
                    quiz_id:      quizData.quiz_id,
                    taker_email:  takerEmail,
                }, function (res) {
                    $btn.prop('disabled', false).text('Start Quiz →');
                    if (!res.success) { startQuiz(); return; }
                    if (res.data.already_taken) {
                        const d   = res.data;
                        const pct = d.pct + '%';
                        const dt  = d.date ? d.date.substring(0, 16) : '';
                        const max = d.max_attempts || parseInt(quizData.allow_retakes);
                        $('#aqs-already-taken-notice').show();
                        $('#aqs-at-message').html(
                            'You have used all <strong>' + max + '</strong> allowed attempt(s). ' +
                            'Your last score: <strong>' + d.score + '/' + d.total + ' (' + pct + ')</strong> on <strong>' + escHtml(dt) + '</strong>.'
                        );
                        $('#aqs-start-quiz-btn').hide();
                        $('#aqs-quiz-info .aqs-quiz-cover').addClass('aqs-cover-shrunk');
                    } else {
                        attemptsUsed = res.data.attempts_count || 0;
                        startQuiz();
                    }
                }).fail(function () { startQuiz(); });
                return;
            }

            takerEmail = '';
            startQuiz();
        });

        /* ─────────────────────────────────────────────────────
           START QUIZ
        ───────────────────────────────────────────────────── */
        function startQuiz() {
            currentQuestion = 0;
            currentSection  = 0;
            userAnswers     = {};
            answeredCorrect = {};
            quizSubmitted   = false;
            secondsLeft     = quizData.time_limit * 60;

            $('#aqs-entry-screen').hide();
            $('#aqs-quiz-screen').show();
            $('#aqs-ambient-bg').show();
            /* Inject tap-to-enable audio button if not already there */
            if (!$('#aqs-tap-audio-btn').length) {
                $('body').append('<button id="aqs-tap-audio-btn" style="display:none;position:fixed;bottom:90px;right:16px;z-index:9999;background:#6366f1;color:#fff;border:none;border-radius:50px;padding:10px 18px;font-size:0.88rem;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(99,102,241,.4);">🔊 Tap to Enable Audio</button>');
            }
            $('#quiz-title-sm').text(quizData.title);
            $('#aqs-total-q').text(questions.length);

            renderSectionProgress();
            renderDots();
            startTimer();
            startAmbient();
            startBgMusic();
            startParticles();

            if (isMultiSection) {
                showSectionIntro(0, function () { showQuestion(0); });
            } else {
                showQuestion(0);
            }
        }

        /* ─────────────────────────────────────────────────────
           SECTION PROGRESS STRIP
        ───────────────────────────────────────────────────── */
        function renderSectionProgress() {
            if (!isMultiSection) { $('#aqs-section-progress').hide(); return; }
            let html = '';
            sectionGroups.forEach(function (sg, i) {
                html += '<span class="aqs-sec-prog-pill' + (i === 0 ? ' active' : '') + '" data-sec="' + i + '">'
                    + sg.letter
                    + '<small>' + escHtml(sg.label) + '</small>'
                    + '</span>';
            });
            $('#aqs-section-progress').html(html).show();
        }

        function updateSectionProgress(secIdx) {
            $('.aqs-sec-prog-pill').each(function (i) {
                $(this).removeClass('active done');
                if (i < secIdx)   $(this).addClass('done');
                if (i === secIdx) $(this).addClass('active');
            });
        }

        /* ─────────────────────────────────────────────────────
           SECTION INTRO OVERLAY
        ───────────────────────────────────────────────────── */
        function showSectionIntro(secIdx, cb) {
            const sg = sectionGroups[secIdx];
            if (!sg) { cb(); return; }
            currentSection = secIdx;
            updateSectionProgress(secIdx);

            const count = sg.endIdx - sg.startIdx + 1;
            $('#aqs-sec-intro-letter').text('Section ' + sg.letter);
            $('#aqs-sec-intro-label').text(sg.label);
            $('#aqs-sec-intro-count').text(count + ' Question' + (count !== 1 ? 's' : ''));

            $('#aqs-section-intro').show();
            $('#aqs-question-card, .aqs-quiz-nav, .aqs-submit-wrap').hide();
            $('#aqs-sec-intro-start').off('click').on('click', function () {
                $('#aqs-section-intro').hide();
                $('#aqs-question-card, .aqs-quiz-nav').show();
                cb();
            });
        }

        /* ─────────────────────────────────────────────────────
           SECTION COMPLETE OVERLAY
        ───────────────────────────────────────────────────── */
        function showSectionComplete(secIdx) {
            const sg       = sectionGroups[secIdx];
            const nextIdx  = secIdx + 1;
            const isLast   = nextIdx >= sectionGroups.length;
            const sg2      = sectionGroups[nextIdx];

            $('#aqs-sec-done-letter').text('Section ' + sg.letter + ' Complete! ✓');
            $('#aqs-sec-done-msg').text(isLast ? 'You\'ve finished all sections!' : 'Get ready for Section ' + (sg2 ? sg2.letter : '') + ' — ' + (sg2 ? sg2.label : ''));
            $('#aqs-sec-done-btn').text(isLast ? '📊 View My Results' : 'Start Section ' + (sg2 ? sg2.letter : '') + ' →');

            $('#aqs-section-complete').show();
            $('#aqs-question-card, .aqs-quiz-nav, .aqs-submit-wrap').hide();
            playChime('section');

            $('#aqs-sec-done-btn').off('click').on('click', function () {
                $('#aqs-section-complete').hide();
                if (isLast) {
                    submitQuiz();
                } else {
                    showSectionIntro(nextIdx, function () {
                        showQuestion(sectionGroups[nextIdx].startIdx);
                    });
                }
            });
        }

        /* ─────────────────────────────────────────────────────
           QUESTION DOTS
        ───────────────────────────────────────────────────── */
        function renderDots() {
            let html = '';
            questions.forEach(function (q, i) {
                html += '<span class="aqs-dot" data-index="' + i + '"></span>';
            });
            $('#aqs-dots').html(html);
        }

        function updateDots() {
            $('.aqs-dot').each(function (i) {
                $(this).removeClass('answered current correct wrong');
                if (i === currentQuestion) $(this).addClass('current');
                else if (userAnswers[i] !== undefined) {
                    $(this).addClass('answered');
                    if (quizData.mode === 'practice') $(this).addClass(answeredCorrect[i] ? 'correct' : 'wrong');
                }
            });
        }

        /* ─────────────────────────────────────────────────────
           SHOW QUESTION
        ───────────────────────────────────────────────────── */
        function showQuestion(idx) {
            currentQuestion = idx;
            const q   = questions[idx];
            const num = idx + 1;

            /* Section label + position */
            if (isMultiSection) {
                const sg = getSectionFor(idx);
                if (sg) {
                    currentSection = sectionGroups.indexOf(sg);
                    updateSectionProgress(currentSection);
                    const pos   = idx - sg.startIdx + 1;
                    const total = sg.endIdx - sg.startIdx + 1;
                    $('#aqs-q-section-label')
                        .html('<span class="aqs-sec-ltr">' + sg.letter + '</span> ' + escHtml(sg.label))
                        .show();
                    $('#aqs-q-num').text('Q' + pos + ' of ' + total);
                } else {
                    $('#aqs-q-section-label').hide();
                    $('#aqs-q-num').text('Question ' + num);
                }
            } else {
                $('#aqs-q-section-label').hide();
                $('#aqs-q-num').text('Question ' + num);
            }

            $('#aqs-question-text').html(renderMath(q.question));
            $('#aqs-current-q').text(num);

            const pct = (num / questions.length) * 100;
            $('#aqs-progress-bar').css('width', pct + '%');

            const isPractice      = quizData.mode === 'practice';
            const alreadyAnswered = userAnswers[idx] !== undefined;
            $('#aqs-answer-feedback').hide().removeClass('aqs-feedback-correct aqs-feedback-wrong');

            /* Render options */
            let opts = '';
            q.options.forEach(function (opt, oi) {
                const letter = String.fromCharCode(65 + oi);
                let cls      = '';
                const answered = userAnswers[idx] !== undefined;
                if (answered) {
                    if (isPractice) {
                        if (oi === parseInt(q.correct_answer_index)) cls = ' aqs-option-correct';
                        else if (oi === userAnswers[idx])             cls = ' aqs-option-wrong';
                    } else {
                        if (oi === userAnswers[idx]) cls = ' aqs-option-selected';
                    }
                }
                const locked = answered ? ' aqs-option-locked' : '';
                opts += '<div class="aqs-option' + cls + locked + '" data-qi="' + idx + '" data-oi="' + oi + '">'
                    + '<span class="aqs-option-letter">' + letter + '</span>'
                    + '<span class="aqs-option-text">' + renderMath(opt) + '</span>'
                    + '</div>';
            });
            $('#aqs-options-list').html(opts);

            /* Practice feedback */
            if (isPractice && alreadyAnswered) {
                if (answeredCorrect[idx]) {
                    $('#aqs-answer-feedback').addClass('aqs-feedback-correct').html('✅ Correct! Well done.').show();
                } else {
                    const correct = q.options[q.correct_answer_index];
                    const exp     = q.explanation ? ' &nbsp;💡 ' + renderMath(q.explanation) : '';
                    $('#aqs-answer-feedback').addClass('aqs-feedback-wrong')
                        .html('❌ Not quite. Correct: <strong>' + renderMath(correct) + '</strong>' + exp).show();
                }
            }

            updateDots();
            updateNav(idx);
        }

        function updateNav(idx) {
            const isFirst  = idx === 0;
            const isLast   = idx === questions.length - 1;
            const isSingle = !isMultiSection;

            $('#aqs-prev-btn').prop('disabled', isFirst);
            /* In multi-section, hide next/submit because auto-advance handles it.
               In single, keep them for manual navigation. */
            if (isMultiSection) {
                /* Prev still works; next/submit hidden — auto-advance drives flow */
                $('#aqs-next-btn').hide();
                $('#aqs-submit-quiz-btn').hide();
            } else {
                $('#aqs-next-btn').toggle(!isLast);
                $('#aqs-submit-quiz-btn').toggle(isLast);
            }
        }

        /* ─────────────────────────────────────────────────────
           OPTION CLICK — exam auto-next / practice delay
        ───────────────────────────────────────────────────── */
        $(document).on('click', '.aqs-option:not(.aqs-option-locked)', function () {
            if (quizSubmitted) return;
            const qi = parseInt($(this).data('qi'));
            const oi = parseInt($(this).data('oi'));
            if (userAnswers[qi] !== undefined) return;   // already answered

            userAnswers[qi] = oi;
            clearTimeout(autoAdvTimer);

            const isPractice = quizData.mode === 'practice';

            if (isPractice) {
                const correct = parseInt(questions[qi].correct_answer_index);
                answeredCorrect[qi] = (oi === correct);
                showQuestion(qi);           // refresh with feedback
                playChime(answeredCorrect[qi] ? 'correct' : 'wrong');
                /* Auto-advance after 2.5 s */
                autoAdvTimer = setTimeout(function () {
                    if (!quizSubmitted) advanceAfterAnswer(qi);
                }, 2500);
            } else {
                /* Exam: highlight selection immediately, advance after 350 ms */
                showQuestion(qi);
                autoAdvTimer = setTimeout(function () {
                    if (!quizSubmitted) advanceAfterAnswer(qi);
                }, 350);
            }
        });

        function advanceAfterAnswer(qi) {
            if (isMultiSection) {
                const sg = getSectionFor(qi);
                if (sg && qi === sg.endIdx) {
                    /* End of section */
                    showSectionComplete(sectionGroups.indexOf(sg));
                    return;
                }
            }
            if (qi < questions.length - 1) {
                showQuestion(qi + 1);
            } else if (!isMultiSection) {
                /* Last question, single-mode — show submit */
                $('#aqs-submit-quiz-btn').show();
                $('#aqs-next-btn').hide();
            }
        }

        /* Manual navigation (prev always works; next in single mode) */
        $(document).on('click', '.aqs-dot', function () { showQuestion(parseInt($(this).data('index'))); });
        $('#aqs-prev-btn').on('click', function () {
            clearTimeout(autoAdvTimer);
            if (currentQuestion > 0) showQuestion(currentQuestion - 1);
        });
        $('#aqs-next-btn').on('click', function () {
            clearTimeout(autoAdvTimer);
            if (currentQuestion < questions.length - 1) showQuestion(currentQuestion + 1);
        });

        $('#aqs-submit-quiz-btn').on('click', function () {
            const answered = Object.keys(userAnswers).length;
            if (answered < questions.length) {
                if (!confirm('You have answered ' + answered + ' of ' + questions.length + ' questions. Submit anyway?')) return;
            }
            $(this).prop('disabled', true).text('Submitting…'); /* FIXED: prevent double-click */
            submitQuiz();
        });

        /* ─────────────────────────────────────────────────────
           SUBMIT & RESULTS
        ───────────────────────────────────────────────────── */
        function submitQuiz() {
            if (quizSubmitted) return; /* FIXED: prevent duplicate submissions */
            clearInterval(timerInterval);
            clearTimeout(autoAdvTimer);
            quizSubmitted = true;
            stopAmbient();
            stopBgMusic();

            const answersMap = {};
            questions.forEach(function (q, i) {
                answersMap[i] = userAnswers[i] !== undefined ? userAnswers[i] : null;
            });

            $.post(AQS.ajax_url, {
                action:           'aqs_submit_attempt',
                nonce:            AQS.public_nonce,
                quiz_id:          quizData.quiz_id,
                participant_name: participantName,
                taker_email:      takerEmail,
                answers:          JSON.stringify(answersMap),
                custom_form_data: JSON.stringify(customFormValues),
            }, function (res) {
                $('#aqs-ambient-bg').hide();
                stopParticles();
                if (res.success) {
                    attemptsUsed++;
                    /* If host disabled result visibility, show a thank-you screen instead */
                    if (quizData.show_results === false) {
                        showThankYou();
                    } else {
                        showResults(res.data);
                        /* Disable retake button if limit reached */
                        var maxAtt = parseInt(quizData.allow_retakes) || 0;
                        if (maxAtt > 0 && attemptsUsed >= maxAtt) {
                            $('#aqs-retake-btn').prop('disabled', true).text('No More Attempts');
                        }
                    }
                } else {
                    if (res.data && typeof res.data === 'object' && res.data.expired) {
                        alert('⏰ ' + (res.data.message || 'This quiz has expired and is no longer accepting submissions.'));
                    } else {
                        alert('Error submitting: ' + (typeof res.data === 'object' ? (res.data.message || JSON.stringify(res.data)) : res.data));
                    }
                }
            });
        }

        /* ── Thank-you screen when host hides results from participants ── */
        function showThankYou() {
            $('#aqs-quiz-screen').hide();
            var thankHtml = '<div id="aqs-thankyou-screen" style="text-align:center;padding:48px 24px;">'
                + '<div style="font-size:3.5rem;margin-bottom:16px;">✅</div>'
                + '<h2 style="font-size:1.6rem;font-weight:700;color:#1e293b;margin-bottom:10px;">Thank You!</h2>'
                + '<p style="font-size:1rem;color:#64748b;max-width:420px;margin:0 auto 24px;">'
                + 'Your response has been received and recorded successfully.'
                + '</p>'
                + '<a href="index.html" class="aqs-btn aqs-btn-primary" style="font-size:.95rem;padding:10px 28px;">← Back to Home</a>'
                + '</div>';
            if (!$('#aqs-thankyou-screen').length) {
                $('#aqs-take-quiz').append(thankHtml);
            } else {
                $('#aqs-thankyou-screen').show();
            }
        }

        function showResults(data) {
            $('#aqs-quiz-screen').hide();
            $('#aqs-results-screen').show();

            const score = data.score, total = data.total;
            const pct   = Math.round((score / total) * 100);
            const circ  = 339.3;

            $('#aqs-final-score').text(score);
            $('#aqs-final-total').text(total);

            setTimeout(function () {
                const c = document.getElementById('aqs-score-circle');
                if (c) { c.style.transition = 'stroke-dashoffset 1s ease'; c.style.strokeDashoffset = circ - (pct / 100) * circ; }
            }, 100);

            const msg = pct >= 70 ? '🎉 Excellent work!' : pct >= 55 ? '👍 Good job!' : pct >= 40 ? '📚 Keep studying!' : '💪 More effort needed!';
            $('#aqs-score-message').text(msg + ' (' + pct + '%)');

            $('#aqs-review-section').show();
            let rh = '';
            /* Group review by section for multi-section quizzes */
            if (isMultiSection) {
                sectionGroups.forEach(function (sg) {
                    rh += '<div class="aqs-review-sec-header">Section ' + sg.letter + ' — ' + escHtml(sg.label) + '</div>';
                    data.results.slice(sg.startIdx, sg.endIdx + 1).forEach(function (r, ri) {
                        const gi  = sg.startIdx + ri;
                        const cls = r.is_correct ? 'aqs-correct' : 'aqs-incorrect';
                        rh += '<div class="aqs-review-item ' + cls + '"><p><strong>Q' + (gi + 1) + ':</strong> ' + renderMath(r.question) + '</p>'
                            + '<p>Your answer: <strong>' + (r.user_answer !== null ? renderMath(r.options[r.user_answer]) : 'Not answered') + '</strong></p>'
                            + (!r.is_correct ? '<p>Correct: <strong>' + renderMath(r.options[r.correct]) + '</strong></p>' : '')
                            + (r.explanation ? '<p class="aqs-explanation">💡 ' + renderMath(r.explanation) + '</p>' : '')
                            + '</div>';
                    });
                });
            } else {
                data.results.forEach(function (r, i) {
                    const cls = r.is_correct ? 'aqs-correct' : 'aqs-incorrect';
                    rh += '<div class="aqs-review-item ' + cls + '"><p><strong>Q' + (i + 1) + ':</strong> ' + renderMath(r.question) + '</p>'
                        + '<p>Your answer: <strong>' + (r.user_answer !== null ? renderMath(r.options[r.user_answer]) : 'Not answered') + '</strong></p>'
                        + (!r.is_correct ? '<p>Correct: <strong>' + renderMath(r.options[r.correct]) + '</strong></p>' : '')
                        + (r.explanation ? '<p class="aqs-explanation">💡 ' + renderMath(r.explanation) + '</p>' : '')
                        + '</div>';
                });
            }
            $('#aqs-review-list').html(rh);

            /* Populate certificate */
            const grade    = pct >= 70 ? 'A' : pct >= 55 ? 'B' : pct >= 40 ? 'C' : pct >= 30 ? 'D' : 'F';
            const certId   = 'CERT-' + (quizData.quiz_token || quizData.id).toUpperCase().slice(0,8) + '-' + Date.now().toString(36).toUpperCase();
            const certDate = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
            const certTitle = pct >= 70 ? 'Certificate of Achievement' : 'Certificate of Completion';

            $('#cert-main-title').text(certTitle);
            $('#cert-name').text(participantName);
            $('#cert-quiz-title').text(quizData.title);
            $('#cert-subject-line').text(quizData.subject ? 'Subject: ' + quizData.subject : '');
            $('#cert-score').text(score + ' / ' + total);
            $('#cert-pct').text(pct + '%');
            $('#cert-grade').text(grade);
            $('#cert-date').text(certDate);
            $('#cert-id').text(certId);

            /* Colour seal by score */
            const sealEl = document.querySelector('.aqs-cert-seal-ring');
            if (sealEl) {
                sealEl.style.borderColor = pct >= 70 ? '#b8860b' : pct >= 55 ? '#2563eb' : '#6b7280';
            }
        }

        $('#aqs-retake-btn').on('click', function () {
            var maxAtt = parseInt(quizData.allow_retakes) || 0;
            if (maxAtt > 0 && attemptsUsed >= maxAtt) {
                return; /* No more attempts left */
            }
            $(this).prop('disabled', false).text('Retake Quiz');
            $('#aqs-results-screen, #aqs-leaderboard-section, #aqs-review-section').hide();
            $('#aqs-entry-screen').show();
        });

        $(document).on('click', '#aqs-lb-btn', function () {
            const lb = $('#aqs-leaderboard-section');
            if (lb.is(':visible')) { lb.hide(); $(this).text('🏆 Leaderboard'); return; }
            $(this).text('⏳ Loading...');
            lb.html('<p class="aqs-loading">Loading leaderboard...</p>').show();
            $.post(AQS.ajax_url, { action:'aqs_get_leaderboard', nonce:AQS.public_nonce, token:quizData.quiz_token }, function (res) {
                $('#aqs-lb-btn').text('🏆 Hide Leaderboard');
                if (!res.success) { lb.html('<p>Could not load leaderboard.</p>'); return; }
                lb.html('<h3>🏆 Leaderboard — Top Scores</h3>' + buildLeaderboardHtml(res.data.leaderboard));
            });
        });

        $(document).on('click', '#aqs-cert-btn',          function () { $('#aqs-cert-modal').css('display','flex'); });
        $(document).on('click', '#aqs-close-cert',        function () { $('#aqs-cert-modal').hide(); });
        $(document).on('click', '#aqs-print-cert-btn',    function () { printElement(document.getElementById('aqs-certificate'), ''); });
        $(document).on('click', '.aqs-cert-modal-wrap',   function (e) { if ($(e.target).is('.aqs-cert-modal-wrap')) $('#aqs-cert-modal').hide(); });

        $(document).on('click', '#aqs-download-cert-pdf-btn', function () {
            var $btn = $(this);
            $btn.prop('disabled', true).text('⏳ Generating…');
            aqsLoadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', function () {
                aqsLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', function () {
                    var el = document.getElementById('aqs-certificate');
                    /* Hide corner decorations that don't render well on canvas */
                    var corners = el.querySelectorAll('.aqs-cert-corner-tl,.aqs-cert-corner-tr,.aqs-cert-corner-bl,.aqs-cert-corner-br');
                    corners.forEach(function(c){ c.style.display='none'; });

                    html2canvas(el, {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: '#fffdf5',
                        logging: false
                    }).then(function (canvas) {
                        /* Restore corners */
                        corners.forEach(function(c){ c.style.display=''; });

                        var imgData  = canvas.toDataURL('image/png');
                        var jsPDF    = window.jspdf.jsPDF;
                        var isWide   = canvas.width >= canvas.height;
                        var pdf      = new jsPDF({ orientation: isWide ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
                        var pgW      = pdf.internal.pageSize.getWidth();
                        var pgH      = pdf.internal.pageSize.getHeight();
                        var margin   = 8;
                        var maxW     = pgW - margin * 2;
                        var maxH     = pgH - margin * 2;
                        var ratio    = Math.min(maxW / canvas.width, maxH / canvas.height);
                        var imgW     = canvas.width  * ratio;
                        var imgH     = canvas.height * ratio;
                        var x        = (pgW - imgW) / 2;
                        var y        = (pgH - imgH) / 2;

                        pdf.addImage(imgData, 'PNG', x, y, imgW, imgH, '', 'FAST');

                        var safeName = ($('#cert-name').text() || 'certificate')
                            .replace(/[^a-z0-9]/gi, '_').toLowerCase();
                        pdf.save(safeName + '_certificate.pdf');
                        $btn.prop('disabled', false).text('⬇️ Download PDF');
                    }).catch(function () {
                        corners.forEach(function(c){ c.style.display=''; });
                        $btn.prop('disabled', false).text('⬇️ Download PDF');
                        alert('PDF generation failed. Try "Print" and choose "Save as PDF" instead.');
                    });
                });
            });
        });

        /* ─────────────────────────────────────────────────────
           TIMER
        ───────────────────────────────────────────────────── */
        function startTimer() {
            updateTimerDisplay();
            timerInterval = setInterval(function () {
                secondsLeft = Math.max(0, secondsLeft - 1);
                updateTimerDisplay();
                if (secondsLeft <= 0) { clearInterval(timerInterval); alert('⏰ Time is up!'); submitQuiz(); }
            }, 1000);
        }
        function updateTimerDisplay() {
            const m = Math.floor(secondsLeft / 60), s = secondsLeft % 60;
            $('#aqs-timer-display').text(pad(m) + ':' + pad(s));
            if (secondsLeft <= 60) $('#aqs-timer').addClass('aqs-timer-danger');
            else $('#aqs-timer').removeClass('aqs-timer-danger');
        }
        function pad(n) { return n < 10 ? '0' + n : '' + n; }

        /* ─────────────────────────────────────────────────────
           PROFESSIONAL AMBIENT SOUND
           Soft binaural-ish pads: two detuned filtered sines +
           gentle low-pass noise layer — sounds like a calm studio.
        ───────────────────────────────────────────────────── */
        function startAmbient() {
            if (soundMuted) return;
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const master = audioCtx.createGain();
                master.gain.setValueAtTime(0, audioCtx.currentTime);
                master.gain.linearRampToValueAtTime(0.018, audioCtx.currentTime + 3);
                master.connect(audioCtx.destination);
                ambientNodes = [master];

                /* Harmonic pads — 174 Hz (F3) + 396 Hz (G4) + 528 Hz (C5) */
                [[174, 0], [174.4, 0.008], [396, 0.006], [396.6, 0.005], [528, 0.005]].forEach(function (pair) {
                    const freq = pair[0], vol = pair[1];
                    const osc  = audioCtx.createOscillator();
                    const g    = audioCtx.createGain();
                    const filt = audioCtx.createBiquadFilter();
                    filt.type = 'lowpass'; filt.frequency.value = 800;
                    osc.type  = 'sine'; osc.frequency.value = freq;
                    g.gain.value = vol;
                    osc.connect(filt); filt.connect(g); g.connect(master);
                    osc.start();
                    ambientNodes.push(osc, g, filt);
                });

                /* Very soft noise breath */
                const bufLen  = audioCtx.sampleRate * 2;
                const buf     = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
                const data    = buf.getChannelData(0);
                for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
                const noise   = audioCtx.createBufferSource();
                noise.buffer  = buf; noise.loop = true;
                const nfilt   = audioCtx.createBiquadFilter();
                nfilt.type    = 'bandpass'; nfilt.frequency.value = 200; nfilt.Q.value = 0.8;
                const ng      = audioCtx.createGain(); ng.gain.value = 0.004;
                noise.connect(nfilt); nfilt.connect(ng); ng.connect(master);
                noise.start();
                ambientNodes.push(noise, nfilt, ng);
            } catch (e) { console.warn('[AQS] ambient sound error', e); }
        }

        function stopAmbient() {
            if (!audioCtx) return;
            try {
                const master = ambientNodes[0];
                if (master) master.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.2);
                setTimeout(function () {
                    ambientNodes.forEach(function (n) { try { if (n.stop) n.stop(); if (n.disconnect) n.disconnect(); } catch(e){} });
                    try { audioCtx.close(); } catch(e){}
                    audioCtx = null; ambientNodes = [];
                }, 1300);
            } catch (e) {}
        }

        /* ─────────────────────────────────────────────────────
           BACKGROUND MUSIC PLAYER
           Plays the admin-configured audio track on loop for
           the entire duration of the quiz.
        ───────────────────────────────────────────────────── */
        var bgAudio = null;

        /* Pre-unlock audio context on first user gesture so it works in AJAX callbacks */
        function _unlockAudioContext() {
            try {
                var url     = (AQS.quiz_bg_music_url     || '').trim();
                var enabled = (AQS.quiz_bg_music_enabled || '1');
                if (url && enabled !== '0' && !bgAudio) {
                    bgAudio        = new Audio(url);
                    bgAudio.loop   = true;
                    bgAudio.volume = 0.35;
                    bgAudio.muted  = false; /* Play immediately when user interacts */
                    bgAudio.play().catch(function(){});
                }
            } catch(e){}
        }

        function startBgMusic() {
            var url     = (AQS.quiz_bg_music_url     || '').trim();
            var enabled = (AQS.quiz_bg_music_enabled || '1');
            if (!url || enabled === '0') return;
            try {
                if (bgAudio) {
                    /* Reuse the pre-unlocked Audio object from _unlockAudioContext() */
                    bgAudio.muted  = soundMuted;
                    bgAudio.volume = 0.35;
                    bgAudio.currentTime = 0;
                    bgAudio.play().catch(function () {
                        /* Show tap-to-enable floating button if still blocked */
                        $('#aqs-tap-audio-btn').fadeIn(400);
                    });
                } else {
                    bgAudio        = new Audio(url);
                    bgAudio.loop   = true;
                    bgAudio.volume = 0.35;
                    bgAudio.muted  = soundMuted;
                    bgAudio.play().catch(function () {
                        $('#aqs-tap-audio-btn').fadeIn(400);
                    });
                }
                bgAudio.addEventListener('ended', function () {
                    bgAudio.currentTime = 0;
                    bgAudio.play().catch(function () {});
                });
            } catch (e) { console.warn('[AQS] bg music error', e); }
        }

        /* Tap-to-enable audio button handler (shown when autoplay blocked) */
        $(document).on('click', '#aqs-tap-audio-btn', function () {
            if (bgAudio) {
                bgAudio.muted  = false;
                bgAudio.volume = 0.35;
                bgAudio.play().catch(function(){});
            }
            $(this).fadeOut(300);
        });

        function stopBgMusic() {
            if (!bgAudio) return;
            try {
                bgAudio.pause();
                bgAudio.currentTime = 0;
            } catch (e) {}
            bgAudio = null;
        }

        $(document).on('click', '#aqs-sound-toggle', function () {
            soundMuted = !soundMuted;
            $(this).text(soundMuted ? '🔇' : '🔊');
            if (ambientNodes[0]) ambientNodes[0].gain.value = soundMuted ? 0 : 0.018;
            if (bgAudio) bgAudio.muted = soundMuted;
        });

        /* ─────────────────────────────────────────────────────
           PROFESSIONAL CHIME SOUNDS
           correct : ascending major triad   C5–E5–G5
           wrong   : soft descending minor   E4–C4
           section : triumphant four-note    C5–E5–G5–C6
        ───────────────────────────────────────────────────── */
        function playChime(type) {
            if (soundMuted) return;
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const master = ctx.createGain();
                master.connect(ctx.destination);

                function note(freq, startAt, dur, vol) {
                    const osc  = ctx.createOscillator();
                    const gain = ctx.createGain();
                    const rev  = ctx.createBiquadFilter();
                    rev.type   = 'highshelf'; rev.frequency.value = 3000; rev.gain.value = -4;
                    osc.type   = 'sine'; osc.frequency.value = freq;
                    gain.gain.setValueAtTime(0,   ctx.currentTime + startAt);
                    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + startAt + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + dur);
                    osc.connect(rev); rev.connect(gain); gain.connect(master);
                    osc.start(ctx.currentTime + startAt);
                    osc.stop( ctx.currentTime + startAt + dur + 0.05);
                }

                if (type === 'correct') {
                    note(523.25, 0,    0.5, 0.18);   // C5
                    note(659.25, 0.12, 0.5, 0.16);   // E5
                    note(783.99, 0.24, 0.7, 0.14);   // G5
                } else if (type === 'wrong') {
                    note(329.63, 0,    0.45, 0.14);  // E4
                    note(261.63, 0.18, 0.55, 0.12);  // C4
                } else if (type === 'section') {
                    note(523.25, 0,    0.4, 0.16);   // C5
                    note(659.25, 0.1,  0.4, 0.15);   // E5
                    note(783.99, 0.2,  0.4, 0.14);   // G5
                    note(1046.5, 0.32, 0.8, 0.16);   // C6
                }

                setTimeout(function () { try { ctx.close(); } catch(e){} }, 2000);
            } catch (e) {}
        }

        /* ─────────────────────────────────────────────────────
           ANIMATED PARTICLE BACKGROUND
        ───────────────────────────────────────────────────── */
        function startParticles() {
            const canvas = document.getElementById('aqs-particle-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            canvas.width  = window.innerWidth;
            canvas.height = window.innerHeight;
            const particles = [];
            const count = 55;
            for (let i = 0; i < count; i++) {
                particles.push({
                    x   : Math.random() * canvas.width,
                    y   : Math.random() * canvas.height,
                    r   : Math.random() * 3.5 + 1,
                    dx  : (Math.random() - 0.5) * 0.45,
                    dy  : (Math.random() - 0.5) * 0.45,
                    op  : Math.random() * 0.35 + 0.08,
                    hue : Math.random() * 60 + 220    // blue-purple range
                });
            }
            function draw() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                particles.forEach(function (p) {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    ctx.fillStyle = 'hsla(' + p.hue + ',70%,65%,' + p.op + ')';
                    ctx.fill();
                    p.x += p.dx; p.y += p.dy;
                    if (p.x < 0 || p.x > canvas.width)  p.dx *= -1;
                    if (p.y < 0 || p.y > canvas.height)  p.dy *= -1;
                });
                /* Soft connecting lines between nearby particles */
                for (let i = 0; i < particles.length; i++) {
                    for (let j = i + 1; j < particles.length; j++) {
                        const dx = particles[i].x - particles[j].x;
                        const dy = particles[i].y - particles[j].y;
                        const d  = Math.sqrt(dx * dx + dy * dy);
                        if (d < 110) {
                            ctx.beginPath();
                            ctx.moveTo(particles[i].x, particles[i].y);
                            ctx.lineTo(particles[j].x, particles[j].y);
                            ctx.strokeStyle = 'hsla(240,60%,70%,' + (0.12 * (1 - d / 110)) + ')';
                            ctx.lineWidth   = 0.6;
                            ctx.stroke();
                        }
                    }
                }
                particleAnim = requestAnimationFrame(draw);
            }
            draw();

            window.addEventListener('resize', function () {
                canvas.width  = window.innerWidth;
                canvas.height = window.innerHeight;
            });
        }

        function stopParticles() {
            if (particleAnim) { cancelAnimationFrame(particleAnim); particleAnim = null; }
            const canvas = document.getElementById('aqs-particle-canvas');
            if (canvas) { const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); }
        }
    }

    /* =========================================================
       LEADERBOARD BUILDER (shared)
    ========================================================= */
    function buildLeaderboardHtml(entries) {
        if (!entries || !entries.length) return '<p class="aqs-empty">No scores recorded yet.</p>';
        const medals = ['🥇', '🥈', '🥉'];
        let rows = '';
        entries.forEach(function (e, i) {
            const pct   = e.total > 0 ? Math.round((e.score / e.total) * 100) : 0;
            const badge = pct >= 70 ? 'aqs-badge-success' : pct >= 45 ? 'aqs-badge-warn' : 'aqs-badge-fail';
            const mins  = e.time_taken ? Math.floor(e.time_taken / 60) : '—';
            const secs  = e.time_taken ? String(e.time_taken % 60).padStart(2, '0') : '';
            const time  = e.time_taken ? mins + ':' + secs : '—';
            rows += '<tr>'
                + '<td><strong>' + (medals[i] || (i + 1) + '.') + '</strong></td>'
                + '<td>' + escHtml(e.participant_name) + '</td>'
                + '<td>' + e.score + '/' + e.total + '</td>'
                + '<td><span class="aqs-badge ' + badge + '">' + pct + '%</span></td>'
                + '<td>' + time + '</td>'
                + '</tr>';
        });
        return '<div class="aqs-table-wrap"><table class="aqs-table aqs-lb-table">'
            + '<thead><tr><th>#</th><th>Name</th><th>Score</th><th>%</th><th>Time</th></tr></thead>'
            + '<tbody>' + rows + '</tbody></table></div>';
    }

    /* =========================================================
       UTILITIES
    ========================================================= */
    function safeParseJSON(str, fallback) {
        try { return JSON.parse(str || ''); } catch (e) { return fallback; }
    }

    function printElement(el, title) {
        const win = window.open('', '_blank', 'width=960,height=720');
        if (!win) { alert('Please allow pop-ups to print.'); return; }
        const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
        win.document.write('<!DOCTYPE html><html><head>');
        win.document.write('<title>' + (title || 'Print') + '</title>');
        win.document.write('<style>');
        win.document.write([
            '* { box-sizing: border-box; margin: 0; padding: 0; }',
            'body { font-family: "Segoe UI", Arial, sans-serif; font-size: 13px; color: #1a1a2e; background: #fff; padding: 0; }',
            '.aqs-print-page { padding: 32px 40px; max-width: 900px; margin: 0 auto; }',
            /* Print header */
            '.aqs-print-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4f46e5; padding-bottom: 14px; margin-bottom: 20px; }',
            '.aqs-print-header-title { font-size: 20px; font-weight: 700; color: #4f46e5; }',
            '.aqs-print-header-sub { font-size: 12px; color: #64748b; margin-top: 3px; }',
            '.aqs-print-header-date { font-size: 11px; color: #64748b; text-align: right; }',
            /* Tables */
            'table { width: 100%; border-collapse: collapse; margin-top: 4px; }',
            'thead th { background: #4f46e5; color: #fff; padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 700; letter-spacing: 0.4px; }',
            'tbody tr:nth-child(even) { background: #f8f7ff; }',
            'tbody tr:hover { background: #eef2ff; }',
            'td { padding: 9px 14px; border-bottom: 1px solid #e5e7eb; font-size: 13px; vertical-align: middle; }',
            /* Badges */
            '.no-print { display: none !important; }',
            '.aqs-badge { display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 600; white-space: nowrap; }',
            '.aqs-badge-success { background: #d1fae5; color: #065f46; }',
            '.aqs-badge-warn    { background: #fef3c7; color: #92400e; }',
            '.aqs-badge-fail    { background: #fee2e2; color: #991b1b; }',
            /* Summary row */
            '.aqs-print-summary { display: flex; gap: 24px; background: #f8f7ff; border: 1px solid #e0e7ff; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; flex-wrap: wrap; }',
            '.aqs-print-summary-item { text-align: center; }',
            '.aqs-print-summary-item strong { display: block; font-size: 20px; font-weight: 700; color: #4f46e5; }',
            '.aqs-print-summary-item span { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }',
            /* Certificate */
            '.aqs-certificate { max-width: 720px; margin: 0 auto; border: 3px double #b8860b; border-radius: 12px; padding: 40px; background: #fffdf5; }',
            '.aqs-cert-border { text-align: center; }',
            '.aqs-cert-logo { font-size: 3rem; margin-bottom: 8px; }',
            '.aqs-cert-label { font-size: 1.8rem; font-weight: 800; color: #b8860b; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 16px; }',
            '.aqs-cert-presented { color: #555; margin-bottom: 8px; }',
            '.aqs-cert-name { font-size: 2rem; font-weight: 700; color: #1e3a5f; margin: 8px 0 16px; font-style: italic; }',
            '.aqs-cert-body { color: #333; margin-bottom: 20px; line-height: 1.7; }',
            '.aqs-cert-score-row { display: flex; justify-content: center; gap: 32px; margin: 20px 0; }',
            '.aqs-cert-score-box { text-align: center; }',
            '.aqs-cert-score-box span { display: block; font-size: 1.4rem; font-weight: 700; color: #1e3a5f; }',
            '.aqs-cert-score-box label { font-size: .75rem; color: #888; text-transform: uppercase; }',
            '.aqs-cert-footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5c97e; }',
            '.aqs-cert-line { width: 140px; border-bottom: 1px solid #333; margin-bottom: 4px; }',
            '.aqs-cert-footer p { font-size: .85rem; font-weight: 600; margin: 2px 0; }',
            '.aqs-cert-footer label { font-size: .7rem; color: #888; }',
            '.aqs-cert-seal { font-size: 2rem; color: #b8860b; }',
            /* Analysis / review */
            '.aqs-analysis-summary { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; }',
            '.aqs-review-item { padding: 12px 16px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #ccc; }',
            '.aqs-correct { background: #ecfdf5; border-left-color: #10b981; }',
            '.aqs-incorrect { background: #fef2f2; border-left-color: #ef4444; }',
            '.aqs-explanation { color: #6b7280; font-style: italic; margin-top: 4px; }',
            '@media print {',
            '  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
            '  .no-print { display: none !important; }',
            '  thead th { background: #4f46e5 !important; color: #fff !important; }',
            '  tbody tr:nth-child(even) { background: #f8f7ff !important; }',
            '}'
        ].join('\n'));
        win.document.write('</style></head><body>');
        win.document.write('<div class="aqs-print-page">');
        win.document.write('<div class="aqs-print-header">');
        win.document.write('<div><div class="aqs-print-header-title">' + escHtml(title || 'Attendance Report') + '</div>');
        win.document.write('<div class="aqs-print-header-sub">Generated by AI Quiz System</div></div>');
        win.document.write('<div class="aqs-print-header-date">Printed: ' + now + '</div>');
        win.document.write('</div>');
        win.document.write(el.outerHTML || el.innerHTML);
        win.document.write('</div></body></html>');
        win.document.close();
        win.focus();
        setTimeout(function () { win.print(); }, 600);
    }

    /* ================================================================
       aqsPrintQuiz — print a quiz question paper (full-page, printable)
       Called from: auto-print after publish, .aqs-print-quiz-btn clicks.
    ================================================================ */
    function aqsPrintQuiz(quizData) {
        var letters = ['A', 'B', 'C', 'D', 'E'];
        var win = window.open('', '_blank', 'width=800,height=900');
        if (!win) { alert('Pop-up blocked. Please allow pop-ups and try again.'); return; }
        var now = new Date().toLocaleString();
        var css = [
            'body{font-family:Georgia,serif;margin:0;padding:24px 36px;color:#1e293b;font-size:14px;}',
            'h1{font-size:1.4rem;margin:0 0 4px;color:#1e293b;border-bottom:2px solid #4f46e5;padding-bottom:8px;}',
            '.meta{font-size:.82rem;color:#64748b;margin-bottom:20px;}',
            '.q-block{margin-bottom:18px;page-break-inside:avoid;}',
            '.q-num{font-weight:700;color:#4f46e5;margin-right:6px;}',
            '.q-text{font-weight:600;line-height:1.5;}',
            '.opts{list-style:none;padding:0;margin:6px 0 0 20px;}',
            '.opts li{margin:3px 0;font-size:.92rem;}',
            '.opts li::before{content:attr(data-letter) ") ";font-weight:700;color:#374151;margin-right:4px;}',
            '.answer-key{margin-top:30px;border-top:2px dashed #e5e7eb;padding-top:16px;}',
            '.answer-key h2{font-size:1rem;margin:0 0 10px;color:#4f46e5;}',
            '.ak-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;font-size:.85rem;}',
            '.ak-item{background:#f0fdf4;border:1px solid #86efac;border-radius:4px;padding:4px 8px;text-align:center;}',
            '.ak-item strong{color:#16a34a;}',
            '@media print{body{padding:10px 20px;} .answer-key{page-break-before:always;}}'
        ].join('\n');

        win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escHtml(quizData.title) + '</title><style>' + css + '</style></head><body>');
        win.document.write('<h1>' + escHtml(quizData.title) + '</h1>');
        win.document.write('<div class="meta">Subject: ' + escHtml(quizData.subject) + ' &nbsp;|&nbsp; Questions: ' + quizData.questions.length + ' &nbsp;|&nbsp; Printed: ' + now + '</div>');
        win.document.write('<div style="margin-bottom:12px;border:1px solid #e5e7eb;border-radius:6px;padding:8px 14px;font-size:.84rem;">Name: __________________________________ &nbsp;&nbsp; Date: _____________ &nbsp;&nbsp; Score: _______ / ' + quizData.questions.length + '</div>');

        quizData.questions.forEach(function (q, i) {
            var opts = Array.isArray(q.options) ? q.options : [];
            win.document.write('<div class="q-block"><div><span class="q-num">' + (i + 1) + '.</span><span class="q-text">' + escHtml(q.question) + '</span></div>');
            if (opts.length) {
                win.document.write('<ul class="opts">');
                opts.forEach(function (o, oi) {
                    win.document.write('<li data-letter="' + (letters[oi] || String.fromCharCode(65 + oi)) + '">' + escHtml(o) + '</li>');
                });
                win.document.write('</ul>');
            }
            win.document.write('</div>');
        });

        /* Answer key */
        win.document.write('<div class="answer-key"><h2>Answer Key</h2><div class="ak-grid">');
        quizData.questions.forEach(function (q, i) {
            var ans = (q.correct !== undefined && q.correct !== null) ? (letters[parseInt(q.correct, 10)] || '?') : '?';
            win.document.write('<div class="ak-item">' + (i + 1) + '. <strong>' + ans + '</strong></div>');
        });
        win.document.write('</div></div>');

        win.document.write('</body></html>');
        win.document.close();
        win.focus();
        setTimeout(function () { win.print(); }, 600);
    }

})(jQuery);
