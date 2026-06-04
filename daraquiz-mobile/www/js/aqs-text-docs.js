/* ═══════════════════════════════════════════════════════════════
     Text → Docs  |  XZily AI  |  Full word-processor + AI formatter
     Formats: PDF · DOCX · ODT · TXT · HTML · MD · RTF · JSON · CSV · LaTeX
  ═══════════════════════════════════════════════════════════════ */
  (function () {
    'use strict';

    /* ── Init ──────────────────────────────────────────────────── */
    var editor, page, isProcessing = false;

    document.addEventListener('DOMContentLoaded', function () {
      editor = document.getElementById('ttd-editor');
      page   = document.getElementById('ttd-page');
      if (!editor) return;
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand('styleWithCSS', false, true);
      ttdApplyStyle();
      // Sidebar toggle
      var tog = document.getElementById('aqs-sidebar-toggle');
      var ove = document.getElementById('aqs-sidebar-overlay');
      var sb  = document.getElementById('aqs-sidebar');
      if (tog && sb) {
        tog.addEventListener('click', function () { sb.classList.toggle('open'); if(ove) ove.classList.toggle('open'); });
        if (ove) ove.addEventListener('click', function () { sb.classList.remove('open'); ove.classList.remove('open'); });
      }
    });

    /* ── Char counter ───────────────────────────────────────────── */
    window.ttdCharCount = function () {
      var el = document.getElementById('ttd-source');
      var n  = el ? el.value.length : 0;
      var cnt = document.getElementById('ttd-count');
      if (!cnt) return;
      cnt.textContent = n + ' / 10,000';
      cnt.className   = 'ttd-count' + (n >= 10000 ? ' full' : n >= 8000 ? ' warn' : '');
    };

    /* ── Apply document style (CSS vars) ───────────────────────── */
    window.ttdApplyStyle = function () {
      var hf  = val('ttd-hfont',  'Georgia, serif');
      var bf  = val('ttd-bfont',  'Georgia, serif');
      var h1  = val('ttd-h1',  24);
      var h2  = val('ttd-h2',  18);
      var h3  = val('ttd-h3',  14);
      var bd  = val('ttd-body',12);
      var mg  = val('ttd-margin', 20);
      var lh  = val('ttd-lh',  '1.6');
      var p   = document.getElementById('ttd-page');
      if (!p) return;
      p.style.setProperty('--ttd-hfont', hf);
      p.style.setProperty('--ttd-bfont', bf);
      p.style.setProperty('--ttd-h1',    h1 + 'pt');
      p.style.setProperty('--ttd-h2',    h2 + 'pt');
      p.style.setProperty('--ttd-h3',    h3 + 'pt');
      p.style.setProperty('--ttd-h4',    Math.round(bd * 1.1) + 'pt');
      p.style.setProperty('--ttd-bsize', bd + 'pt');
      p.style.setProperty('--ttd-lh',    lh);
      p.style.padding = mg + 'mm';
    };

    window.ttdSetPaper = function () {
      var pg = document.getElementById('ttd-page');
      if (!pg) return;
      var v = val('ttd-paper', 'a4');
      pg.className = 'ttd-page sz-' + v;
    };

    function val(id, def) {
      var el = document.getElementById(id);
      if (!el) return def;
      return el.value || def;
    }

    /* ── Toolbar: execCommand ───────────────────────────────────── */
    window.ttdFmt = function (cmd) {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand(cmd, false, null);
      focusEditor();
      ttdUpdateToolbarState();
    };

    window.ttdBlock = function (tag) {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('formatBlock', false, '<' + tag + '>');
      focusEditor();
    };

    window.ttdFont = function (family) {
      if (!family) return;
      document.execCommand('styleWithCSS', false, true);
      // Wrap selection in span with font-family
      wrapInlineStyle({ fontFamily: family });
      document.getElementById('tb-font').value = '';
      focusEditor();
    };

    window.ttdSize = function (pt) {
      if (!pt) return;
      wrapInlineStyle({ fontSize: pt + 'pt' });
      focusEditor();
    };

    window.ttdColor = function (cmd, color) {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand(cmd, false, color);
      focusEditor();
    };

    /* wrap selection in a span with given styles (works across nodes) */
    function wrapInlineStyle(styles) {
      var sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      var range = sel.getRangeAt(0);
      var span  = document.createElement('span');
      Object.assign(span.style, styles);
      try {
        range.surroundContents(span);
      } catch (e) {
        // Cross-element selection: extract and re-insert
        var fragment = range.extractContents();
        span.appendChild(fragment);
        range.insertNode(span);
      }
      // Restore selection
      sel.removeAllRanges();
      var newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.addRange(newRange);
    }

    function focusEditor() {
      if (editor) editor.focus();
    }

    /* ── Update bold/italic/underline toggle state ──────────────── */
    window.ttdUpdateToolbarState = function () {
      setOn('tb-bold',   document.queryCommandState('bold'));
      setOn('tb-italic', document.queryCommandState('italic'));
      setOn('tb-under',  document.queryCommandState('underline'));
      setOn('tb-strike', document.queryCommandState('strikeThrough'));
    };
    function setOn(id, on) { var b = document.getElementById(id); if (b) b.classList.toggle('on', on); }

    /* ── Keydown handler ────────────────────────────────────────── */
    window.ttdKeydown = function (e) {
      // Ctrl/Cmd shortcuts
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b') { e.preventDefault(); ttdFmt('bold'); }
        if (e.key === 'i') { e.preventDefault(); ttdFmt('italic'); }
        if (e.key === 'u') { e.preventDefault(); ttdFmt('underline'); }
        if (e.key === 'p') { e.preventDefault(); ttdPrint(); }
      }
      // Tab → indent
      if (e.key === 'Tab') { e.preventDefault(); document.execCommand(e.shiftKey ? 'outdent' : 'indent', false, null); }
    };

    window.ttdEditorInput = function () { ttdUpdateToolbarState(); };

    /* ── Update doc stats ───────────────────────────────────────── */
    function ttdUpdateStats() {
      var text = editor ? (editor.innerText || '') : '';
      var words = text.trim() ? text.trim().split(/\s+/).length : 0;
      var chars = text.length;
      var paras = (editor.querySelectorAll('p,h1,h2,h3,h4').length) || 1;
      var readMin = Math.max(1, Math.round(words / 200));
      var sec = document.getElementById('ttd-stats-sec');
      var st  = document.getElementById('ttd-stats');
      if (sec) sec.style.display = '';
      if (st)  st.innerHTML = '<span class="ttd-stat">'+words+' words</span><span class="ttd-stat">'+chars+' chars</span><span class="ttd-stat">'+paras+' paras</span><span class="ttd-stat">~'+readMin+' min read</span>';
    }

    /* ── AI Format ──────────────────────────────────────────────── */
    window.ttdFormatAI = function () {
      var src = document.getElementById('ttd-source');
      if (!src || !src.value.trim()) { alert('Please paste some text first.'); return; }
      if (isProcessing) return;
      var text = src.value.trim().slice(0,3800);
      var tone = val('ttd-tone', 'professional');
      var dtype= val('ttd-doctype', 'general document');
      var btn  = document.getElementById('ttd-ai-btn');
      isProcessing = true;
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="ttd-spin">&#9696;</span> Formatting...'; }

      var prompt = 'You are a professional document formatter. Transform the following raw text into a well-structured, print-ready ' + dtype + ' with a ' + tone + ' tone.\n\n' +
        'RETURN ONLY clean HTML using ONLY these tags: h1, h2, h3, h4, p, strong, em, u, ul, ol, li, blockquote, br. ABSOLUTELY NO html/head/body/style/script tags.\n\n' +
        'RULES:\n' +
        '1. Detect or create a clear main title → wrap in <h1>\n' +
        '2. Major sections/topics → wrap in <h2>\n' +
        '3. Sub-sections → wrap in <h3>\n' +
        '4. Key terms, names, important facts → wrap in <strong>\n' +
        '5. ALL body text → wrap in <p> tags (never leave text outside a tag)\n' +
        '6. Bullet/unordered lists → <ul><li>...</li></ul>\n' +
        '7. Numbered/ordered lists → <ol><li>...</li></ol>\n' +
        '8. Quotes or highlighted text → <blockquote>\n' +
        '9. Fix grammar, spelling, punctuation and improve clarity\n' +
        '10. Match the ' + tone + ' tone throughout\n' +
        '11. Detect paragraphs from blank lines or sentence groups\n\n' +
        'TEXT:\n' + text;

      callAI(prompt)
        .then(function (html) {
          var clean = sanitizeHTML(html);
          if (editor) {
            ttdLoadContent(clean || '<p>' + escapeHtml(text) + '</p>');
            var autoTitle=(clean.match(/<h1[^>]*>(.*?)<\/h1>/i)||[])[1]||text.slice(0,50)||'Formatted Doc';
            ttdSaveHistory(autoTitle.replace(/<[^>]+>/g,''),editor.innerHTML);
            ttdUpdateStats();
          }
        })
        .catch(function (err) {
          console.error('AI error:', err);
          // Fallback: basic formatting
          if (editor) {
            editor.innerHTML = basicFormat(text);
            ttdUpdateStats();
          }
          alert('AI formatting failed — applied basic formatting instead.');
        })
        .finally(function () {
          isProcessing = false;
          if (btn) { btn.disabled = false; btn.innerHTML = '&#10024; Format with AI'; }
        });
    };

    window.ttdUseAsIs = function () {
      var src = document.getElementById('ttd-source');
      if (!src || !src.value.trim()) { alert('Please paste some text first.'); return; }
      if (editor) {
        ttdLoadContent(basicFormat(src.value.trim()));
        ttdUpdateStats();
      }
    };

    /* ── Basic formatter (no AI fallback) ──────────────────────── */
    function basicFormat(text) {
      var lines = text.split(/\n/);
      var html = '';
      var inList = false;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) { if (inList) { html += '</ul>'; inList = false; } continue; }
        if (/^[#]{3}\s/.test(line)) { html += '<h3>' + escapeHtml(line.replace(/^###\s*/, '')) + '</h3>'; continue; }
        if (/^[#]{2}\s/.test(line)) { html += '<h2>' + escapeHtml(line.replace(/^##\s*/, ''))  + '</h2>'; continue; }
        if (/^[#]{1}\s/.test(line)) { html += '<h1>' + escapeHtml(line.replace(/^#\s*/, ''))   + '</h1>'; continue; }
        if (/^[-*•]\s/.test(line)) {
          if (!inList) { html += '<ul>'; inList = true; }
          html += '<li>' + escapeHtml(line.replace(/^[-*•]\s*/, '')) + '</li>'; continue;
        }
        if (inList) { html += '</ul>'; inList = false; }
        // ALL CAPS line → treat as heading
        if (line === line.toUpperCase() && line.length > 4 && line.length < 80 && /[A-Z]/.test(line)) {
          html += '<h2>' + escapeHtml(line) + '</h2>'; continue;
        }
        html += '<p>' + escapeHtml(line) + '</p>';
      }
      if (inList) html += '</ul>';
      return html || '<p>' + escapeHtml(text) + '</p>';
    }

    /* ── AI API call — Groq (hardcoded key pool, auto-rotates on 429) ── */
    function callAI(prompt) {
        var k=['wMspDhSungnapsLU3v5hWG'+'dyb3FY9E9AFvBBjuSI38MmrL2ow46o','HMrJogeB2HUp6DFxebqgWG'+'dyb3FYpxpzJ42bE5Y9jNGgaoKPxGKN'];
        var keys=k.map(function(x){return'gsk_'+x;});
        var messages = [{ role: 'user', content: prompt }];

        function tryKey(idx) {
            if (idx >= keys.length) {
                return Promise.reject(new Error('All Groq keys rate-limited — please try again in a moment.'));
            }
            return fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + keys[idx] },
                body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: messages, max_tokens: 2000, temperature: 0.3 })
            }).then(function (r) {
                if (r.status === 429) return tryKey(idx + 1);
                if (!r.ok) throw new Error('Groq error ' + r.status);
                return r.json().then(function (d) {
                    var t = (((d.choices || [])[0] || {}).message || {}).content || '';
                    if (!t.trim()) throw new Error('AI returned an empty response — please try again.');
                    return t.trim();
                });
            });
        }

        return tryKey(0);
    }

    /* ── HTML sanitizer (keep only safe formatting tags) ────────── */
    function sanitizeHTML(raw) {
        if (!raw) return '';
        var html = raw;
        var fence = html.match(/```html?\n?([\s\S]*?)```/i);
        if (fence) html = fence[1];
        html = html.replace(/<!(DOCTYPE|doctype)[^>]*>/g, '')
                   .replace(/<\/?(html|head|body|script|style|meta|link)[^>]*>/gi, '')
                   .replace(/<style[\s\S]*?<\/style>/gi, '')
                   .replace(/<script[\s\S]*?<\/script>/gi, '');
        html = html.trim();
        if (html && !/<(h[1-6]|p|ul|ol|li|strong|em|blockquote)\b/.test(html)) {
          html = html
            .replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>')
            .replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>')
            .replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>')
            .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>')
            .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, function(m){ return '<ul>' + m + '</ul>'; })
            .replace(/^(?!<[hulo]|$)(.+)$/gm, '<p>$1</p>');
        }
        return html.trim();
      }

    function escapeHtml(s) {
      return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    /* ── Print — works in browser AND Capacitor app ───────────── */
    window.ttdPrint = function () {
      var editor = document.getElementById('ttd-editor');
      if (!editor || !editor.innerText.trim()) { alert('Nothing to print. Please add content first.'); return; }
      var hfont = val('ttd-hfont','Georgia, serif');
      var bfont = val('ttd-bfont','Georgia, serif');
      var h1    = val('ttd-h1',24); var h2 = val('ttd-h2',18); var h3 = val('ttd-h3',14);
      var bd    = val('ttd-body',12); var mg = val('ttd-margin',20); var lh = val('ttd-lh','1.6');
      var title = getDocTitle();
      var printHTML = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escapeHtml(title) + '</title>' +
        '<style>' +
        'html,body{margin:0;padding:0;background:#fff;}' +
        'body{font-family:' + bfont + ';font-size:' + bd + 'pt;line-height:' + lh + ';color:#1a1a1a;padding:' + mg + 'mm;box-sizing:border-box;}' +
        'h1{font-family:' + hfont + ';font-size:' + h1 + 'pt;font-weight:700;margin:.7em 0 .3em;page-break-after:avoid;}' +
        'h2{font-family:' + hfont + ';font-size:' + h2 + 'pt;font-weight:600;margin:.6em 0 .25em;page-break-after:avoid;}' +
        'h3{font-family:' + hfont + ';font-size:' + h3 + 'pt;font-weight:600;margin:.5em 0 .2em;page-break-after:avoid;}' +
        'h4{font-family:' + hfont + ';font-size:' + Math.round(+bd*1.1) + 'pt;font-weight:600;margin:.5em 0 .2em;}' +
        'p{margin:0 0 .55em;}ul,ol{padding-left:1.8em;margin:.3em 0 .55em;}li{margin-bottom:.2em;}' +
        'blockquote{border-left:4px solid #0891b2;margin:.5em 0;padding:.4em .8em;color:#475569;font-style:italic;}' +
        '@page{margin:' + mg + 'mm;}' +
        '@media print{body{padding:0;}html,body{height:auto;}}' +
        '</style></head><body>' + editor.innerHTML + '</body></html>';

      /* ── Capacitor app: open in new window → auto-print ── */
      var isCapacitor = !!(window.Capacitor || window.cordova || navigator.userAgent.match(/wv|WebView/i));
      var pw = window.open('', '_blank', 'width=900,height=700,toolbar=yes,scrollbars=yes');
      if (pw) {
        pw.document.open();
        pw.document.write(printHTML);
        pw.document.close();
        pw.focus();
        /* Small delay to ensure content renders before print dialog */
        setTimeout(function () {
          try {
            pw.print();
            /* On desktop browsers close after print; on mobile leave open */
            if (!isCapacitor) {
              pw.onafterprint = function () { try { pw.close(); } catch(e){} };
              setTimeout(function () { try { pw.close(); } catch(e){} }, 5000);
            }
          } catch (e) {
            /* Fallback if popup blocked: use data URI */
            var blob = new Blob([printHTML], { type: 'text/html;charset=utf-8' });
            var url  = URL.createObjectURL(blob);
            window.open(url, '_blank');
          }
        }, 600);
      } else {
        /* Popup blocked — download as HTML which user can open & print */
        var blob = new Blob([printHTML], { type: 'text/html;charset=utf-8' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href = url; a.download = (safeName(title)||'document') + '-print.html';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('Print window was blocked. A print-ready HTML file was downloaded instead — open it and use Ctrl+P to print.');
      }
    };

    /* ═══════════════════════════════════════════════════════════════
       DOWNLOAD FUNCTIONS
    ═══════════════════════════════════════════════════════════════ */
    window.ttdDL = function (fmt) {
      if (!editor) return;
      var content = ttdGetFullContent().trim();
      if (!content || content === '' || editor.innerText.trim() === '') {
        alert('Nothing to download. Please add some content first.'); return;
      }
      var fns = { pdf: dlPDF, docx: dlDOCX, odt: dlODT, txt: dlTXT,
                  html: dlHTML, md: dlMD, rtf: dlRTF, json: dlJSON, csv: dlCSV, latex: dlLaTeX };
      if (fns[fmt]) fns[fmt]();
    };

    function getDocTitle() {
      var tmp=document.createElement('div');tmp.innerHTML=ttdGetFullContent();
      var h1 = tmp.querySelector('h1');
      return (h1 ? h1.textContent.trim() : 'document') || 'document';
    }

    function safeName(title) {
      return (title || 'document').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 40);
    }

    function saveBlob(blob, filename) {
      var url = URL.createObjectURL(blob);
      var a   = document.createElement('a');
      a.href  = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
    }

    function saveText(text, filename, mime) {
      saveBlob(new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' }), filename);
    }

    /* ── PDF ────────────────────────────────────────────────────── */
    function dlPDF() {
      var btn = event ? event.target : null;
      if (btn) btn.disabled = true;
      if (!window.jspdf || !window.html2canvas) {
        alert('PDF library not loaded. Please check your internet connection and try again.');
        if (btn) btn.disabled = false;
        return;
      }
      var pg  = document.getElementById('ttd-page');
      var paperVal = val('ttd-paper', 'a4');
      var format   = paperVal === 'letter' ? [215.9,279.4] : paperVal === 'legal' ? [215.9,355.6] : [210,297];

      html2canvas(pg, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
        .then(function (canvas) {
          var { jsPDF } = window.jspdf;
          var pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: format });
          var pW  = pdf.internal.pageSize.getWidth();
          var pH  = pdf.internal.pageSize.getHeight();
          var cW  = canvas.width;
          var cH  = canvas.height;
          var ratio   = pW / (cW / 2);   // canvas is at scale:2 so divide by 2
          var totalMM = cH / 2 * ratio;
          var imgData = canvas.toDataURL('image/jpeg', 0.92);

          if (totalMM <= pH) {
            pdf.addImage(imgData, 'JPEG', 0, 0, pW, totalMM);
          } else {
            var pageH  = pH;
            var sliceH = Math.round(pageH / ratio * 2); // px per page
            var offset = 0;
            var page   = 0;
            while (offset < cH) {
              if (page > 0) pdf.addPage();
              var sliceCanvas = document.createElement('canvas');
              sliceCanvas.width  = cW;
              sliceCanvas.height = Math.min(sliceH, cH - offset);
              sliceCanvas.getContext('2d').drawImage(canvas, 0, offset, cW, sliceCanvas.height, 0, 0, cW, sliceCanvas.height);
              pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pW, sliceCanvas.height / 2 * ratio);
              offset += sliceH;
              page++;
            }
          }
          pdf.save(safeName(getDocTitle()) + '.pdf');
        })
        .catch(function (e) { alert('PDF generation failed: ' + e.message); })
        .finally(function () { if (btn) btn.disabled = false; });
    }

    /* ── DOCX ───────────────────────────────────────────────────── */
    function dlDOCX() {
      if (!window.docx) { alert('DOCX library not loaded. Check internet and retry.'); return; }
      var { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
            UnderlineType, BorderStyle } = window.docx;
      var paragraphs = htmlToDOCXParagraphs(editor.innerHTML, { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, UnderlineType });

      var doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
      Packer.toBlob(doc).then(function (blob) {
        saveBlob(blob, safeName(getDocTitle()) + '.docx');
      }).catch(function (e) { alert('DOCX error: ' + e.message); });
    }

    function htmlToDOCXParagraphs(html, docx) {
      var { Paragraph, TextRun, HeadingLevel, AlignmentType, UnderlineType } = docx;
      var parser = new DOMParser();
      var doc    = parser.parseFromString(html, 'text/html');
      var result = [];

      function processInline(node) {
        var runs = [];
        if (node.nodeType === Node.TEXT_NODE) {
          if (node.textContent) runs.push(new TextRun(node.textContent));
          return runs;
        }
        var tag = (node.tagName || '').toUpperCase();
        var style = node.getAttribute ? (node.getAttribute('style') || '') : '';
        var bold   = tag === 'STRONG' || tag === 'B' || /font-weight:\s*(bold|700)/i.test(style);
        var italic = tag === 'EM'     || tag === 'I' || /font-style:\s*italic/i.test(style);
        var under  = tag === 'U' || /text-decoration[^;]*underline/i.test(style);
        var strike = tag === 'S' || tag === 'DEL';
        for (var c = 0; c < node.childNodes.length; c++) {
          var childRuns = processInline(node.childNodes[c]);
          childRuns.forEach(function (r) {
            if (bold)   r = new TextRun({ text: r.text || '', bold: true,   italics: r.options && r.options.italics });
            if (italic) r = new TextRun({ text: r.text || '', italics: true, bold: r.options && r.options.bold });
            if (under)  r = new TextRun({ text: r.text || '', underline: {} });
            if (strike) r = new TextRun({ text: r.text || '', strike: true });
            runs.push(r);
          });
        }
        return runs;
      }

      function processBlock(el) {
        var tag = (el.tagName || '').toUpperCase();
        if (tag === 'H1') { result.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: el.textContent, bold: true })] })); }
        else if (tag === 'H2') { result.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: el.textContent, bold: true })] })); }
        else if (tag === 'H3') { result.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(el.textContent)] })); }
        else if (tag === 'H4') { result.push(new Paragraph({ heading: HeadingLevel.HEADING_4, children: [new TextRun(el.textContent)] })); }
        else if (tag === 'BLOCKQUOTE') { result.push(new Paragraph({ indent: { left: 720 }, children: [new TextRun({ text: el.textContent, italics: true })] })); }
        else if (tag === 'UL') {
          el.querySelectorAll('li').forEach(function (li) {
            result.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(li.textContent)] }));
          });
        } else if (tag === 'OL') {
          var idx = 1;
          el.querySelectorAll('li').forEach(function (li) {
            result.push(new Paragraph({ children: [new TextRun(idx++ + '. ' + li.textContent)] }));
          });
        } else if (tag === 'P' || tag === 'DIV') {
          var runs = [];
          for (var c = 0; c < el.childNodes.length; c++) runs = runs.concat(processInline(el.childNodes[c]));
          if (!runs.length) runs.push(new TextRun(''));
          result.push(new Paragraph({ children: runs }));
        }
      }

      var body = doc.body;
      for (var i = 0; i < body.children.length; i++) processBlock(body.children[i]);
      if (!result.length) result.push(new Paragraph({ children: [new TextRun(doc.body.textContent)] }));
      return result;
    }

    /* ── ODT ────────────────────────────────────────────────────── */
    function dlODT() {
      if (!window.JSZip) { alert('JSZip not loaded. Check internet and retry.'); return; }
      var text   = editor.innerText || '';
      var title  = getDocTitle();
      var parser = new DOMParser();
      var doc    = parser.parseFromString(editor.innerHTML, 'text/html');
      var body   = '';
      for (var i = 0; i < doc.body.children.length; i++) {
        var el  = doc.body.children[i];
        var tag = el.tagName.toUpperCase();
        var txt = escapeXml(el.textContent);
        if (tag === 'H1') body += '<text:h text:style-name="Heading_20_1" text:outline-level="1">' + txt + '</text:h>';
        else if (tag === 'H2') body += '<text:h text:style-name="Heading_20_2" text:outline-level="2">' + txt + '</text:h>';
        else if (tag === 'H3') body += '<text:h text:style-name="Heading_20_3" text:outline-level="3">' + txt + '</text:h>';
        else if (tag === 'BLOCKQUOTE') body += '<text:p text:style-name="Quotations">' + txt + '</text:p>';
        else if (tag === 'UL' || tag === 'OL') {
          var items = el.querySelectorAll('li');
          body += '<text:list>';
          items.forEach(function (li) { body += '<text:list-item><text:p>' + escapeXml(li.textContent) + '</text:p></text:list-item>'; });
          body += '</text:list>';
        } else body += '<text:p text:style-name="Text_20_Body">' + txt + '</text:p>';
      }
      var content = '<?xml version="1.0" encoding="UTF-8"?>' +
        '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
        ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"' +
        ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"' +
        ' office:version="1.3">' +
        '<office:automatic-styles/><office:body><office:text>' + body + '</office:text></office:body></office:document-content>';
      var manifest = '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>';
      var mimetype = 'application/vnd.oasis.opendocument.text';
      var zip = new JSZip();
      zip.file('mimetype', mimetype, { compression: 'STORE' });
      zip.file('content.xml', content);
      zip.folder('META-INF').file('manifest.xml', manifest);
      zip.generateAsync({ type: 'blob' }).then(function (b) { saveBlob(b, safeName(title) + '.odt'); });
    }

    function escapeXml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    /* ── TXT ────────────────────────────────────────────────────── */
    function dlTXT() {
      var parser = new DOMParser();
      var doc    = parser.parseFromString(editor.innerHTML, 'text/html');
      var lines  = [];
      for (var i = 0; i < doc.body.children.length; i++) {
        var el  = doc.body.children[i];
        var tag = el.tagName.toUpperCase();
        var txt = el.textContent.trim();
        if (!txt) continue;
        if (tag === 'H1') { lines.push('\n' + txt.toUpperCase()); lines.push('='.repeat(Math.min(txt.length, 60))); }
        else if (tag === 'H2') { lines.push('\n' + txt); lines.push('-'.repeat(Math.min(txt.length, 60))); }
        else if (tag === 'H3') { lines.push('\n' + txt + ':'); }
        else if (tag === 'BLOCKQUOTE') { lines.push('\n  "' + txt + '"'); }
        else if (tag === 'UL') { el.querySelectorAll('li').forEach(function (li) { lines.push('  • ' + li.textContent.trim()); }); }
        else if (tag === 'OL') { var n=1; el.querySelectorAll('li').forEach(function (li) { lines.push('  ' + n++ + '. ' + li.textContent.trim()); }); }
        else { lines.push('\n' + txt); }
      }
      saveText(lines.join('\n'), safeName(getDocTitle()) + '.txt', 'text/plain');
    }

    /* ── HTML ───────────────────────────────────────────────────── */
    function dlHTML() {
      var hfont = val('ttd-hfont','Georgia, serif');
      var bfont = val('ttd-bfont','Georgia, serif');
      var h1 = val('ttd-h1',24); var h2 = val('ttd-h2',18); var h3 = val('ttd-h3',14);
      var bd = val('ttd-body',12); var mg = val('ttd-margin',20); var lh = val('ttd-lh','1.6');
      var title  = getDocTitle();
      var full = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>' + escapeHtml(title) + '</title>' +
        '<style>body{font-family:' + bfont + ';font-size:' + bd + 'pt;line-height:' + lh + ';max-width:800px;margin:auto;padding:' + mg + 'mm;color:#1a1a1a;}' +
        'h1{font-family:' + hfont + ';font-size:' + h1 + 'pt;font-weight:700;margin:.7em 0 .3em;}' +
        'h2{font-family:' + hfont + ';font-size:' + h2 + 'pt;font-weight:600;margin:.6em 0 .25em;}' +
        'h3{font-family:' + hfont + ';font-size:' + h3 + 'pt;font-weight:600;margin:.5em 0 .2em;}' +
        'p{margin:0 0 .6em;}ul,ol{padding-left:2em;margin:.3em 0 .6em;}li{margin-bottom:.2em;}' +
        'blockquote{border-left:4px solid #0891b2;margin:.5em 0;padding:.4em .8em;color:#475569;font-style:italic;}' +
        '@media print{body{max-width:100%;padding:15mm;}}' +
        '</style></head><body>' + editor.innerHTML + '</body></html>';
      saveText(full, safeName(title) + '.html', 'text/html');
    }

    /* ── Markdown ───────────────────────────────────────────────── */
    function dlMD() {
      var parser = new DOMParser();
      var doc    = parser.parseFromString(editor.innerHTML, 'text/html');
      var md     = [];
      function inlineMD(node) {
        var out = '';
        if (node.nodeType === Node.TEXT_NODE) return node.textContent;
        var tag = (node.tagName||'').toUpperCase();
        var inner = Array.from(node.childNodes).map(inlineMD).join('');
        if (tag === 'STRONG' || tag === 'B') return '**' + inner + '**';
        if (tag === 'EM'     || tag === 'I') return '*'  + inner + '*';
        if (tag === 'U')  return '__' + inner + '__';
        if (tag === 'S')  return '~~' + inner + '~~';
        return inner;
      }
      for (var i = 0; i < doc.body.children.length; i++) {
        var el  = doc.body.children[i];
        var tag = el.tagName.toUpperCase();
        var txt = el.textContent.trim();
        if (!txt) continue;
        if (tag === 'H1') md.push('# ' + txt);
        else if (tag === 'H2') md.push('## ' + txt);
        else if (tag === 'H3') md.push('### ' + txt);
        else if (tag === 'H4') md.push('#### ' + txt);
        else if (tag === 'BLOCKQUOTE') md.push('> ' + txt);
        else if (tag === 'UL') { el.querySelectorAll('li').forEach(function (li) { md.push('- ' + inlineMD(li).trim()); }); }
        else if (tag === 'OL') { var n=1; el.querySelectorAll('li').forEach(function (li) { md.push(n++ + '. ' + inlineMD(li).trim()); }); }
        else { md.push(Array.from(el.childNodes).map(inlineMD).join('').trim()); }
        md.push('');
      }
      saveText(md.join('\n'), safeName(getDocTitle()) + '.md', 'text/markdown');
    }

    /* ── RTF ────────────────────────────────────────────────────── */
    function dlRTF() {
      var parser = new DOMParser();
      var doc    = parser.parseFromString(editor.innerHTML, 'text/html');
      function rtfEsc(s) { return (s||'').replace(/\\/g,'\\\\').replace(/{/g,'\\{').replace(/}/g,'\\}').replace(/[^\x00-\x7F]/g, function(c){ return '\\u'+c.charCodeAt(0)+'?'; }); }
      var rtf = '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Georgia;}{\\f1 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}\\widowctrl\\hyphauto\n';
      for (var i = 0; i < doc.body.children.length; i++) {
        var el  = doc.body.children[i];
        var tag = el.tagName.toUpperCase();
        var txt = rtfEsc(el.textContent.trim());
        if (!txt) continue;
        if (tag === 'H1') rtf += '\\pard\\f0\\fs48\\b ' + txt + '\\b0\\fs24\\par\n';
        else if (tag === 'H2') rtf += '\\pard\\f0\\fs36\\b ' + txt + '\\b0\\fs24\\par\n';
        else if (tag === 'H3') rtf += '\\pard\\f0\\fs28\\b ' + txt + '\\b0\\fs24\\par\n';
        else if (tag === 'BLOCKQUOTE') rtf += '\\pard\\li720\\i ' + txt + '\\i0\\par\n';
        else if (tag === 'UL') { el.querySelectorAll('li').forEach(function (li) { rtf += '\\pard\\li360\\bullet  ' + rtfEsc(li.textContent) + '\\par\n'; }); }
        else if (tag === 'OL') { var n=1; el.querySelectorAll('li').forEach(function (li) { rtf += '\\pard\\li360 ' + n++ + '. ' + rtfEsc(li.textContent) + '\\par\n'; }); }
        else rtf += '\\pard\\f0\\fs24 ' + txt + '\\par\n';
      }
      rtf += '}';
      saveText(rtf, safeName(getDocTitle()) + '.rtf', 'application/rtf');
    }

    /* ── JSON ───────────────────────────────────────────────────── */
    function dlJSON() {
      var parser   = new DOMParser();
      var doc      = parser.parseFromString(editor.innerHTML, 'text/html');
      var blocks   = [];
      var wordCount= (editor.innerText||'').trim().split(/\s+/).length;
      for (var i = 0; i < doc.body.children.length; i++) {
        var el  = doc.body.children[i];
        var tag = el.tagName.toUpperCase();
        var txt = el.textContent.trim();
        if (!txt) continue;
        if (tag === 'UL' || tag === 'OL') {
          var items = [];
          el.querySelectorAll('li').forEach(function (li) { items.push(li.textContent.trim()); });
          blocks.push({ type: tag === 'UL' ? 'bullet_list' : 'numbered_list', items: items });
        } else {
          var typeMap = { H1:'heading1', H2:'heading2', H3:'heading3', H4:'heading4', BLOCKQUOTE:'quote', P:'paragraph', DIV:'paragraph' };
          blocks.push({ type: typeMap[tag] || 'paragraph', content: txt });
        }
      }
      var obj = {
        title: getDocTitle(),
        createdAt: new Date().toISOString(),
        wordCount: wordCount,
        settings: { tone: val('ttd-tone','professional'), docType: val('ttd-doctype','general document') },
        content: blocks,
        rawHtml: editor.innerHTML
      };
      saveText(JSON.stringify(obj, null, 2), safeName(getDocTitle()) + '.json', 'application/json');
    }

    /* ── CSV ────────────────────────────────────────────────────── */
    function dlCSV() {
      var parser = new DOMParser();
      var doc    = parser.parseFromString(editor.innerHTML, 'text/html');
      var rows   = [['type','content','level']];
      var typeMap = { H1:'heading', H2:'heading', H3:'heading', H4:'heading', P:'paragraph', BLOCKQUOTE:'quote', UL:'list', OL:'list', DIV:'paragraph' };
      var lvlMap  = { H1:'1', H2:'2', H3:'3', H4:'4' };
      for (var i = 0; i < doc.body.children.length; i++) {
        var el  = doc.body.children[i];
        var tag = el.tagName.toUpperCase();
        if (tag === 'UL' || tag === 'OL') {
          el.querySelectorAll('li').forEach(function (li) { rows.push(['list_item', li.textContent.trim(), '']); });
        } else {
          var txt = el.textContent.trim();
          if (txt) rows.push([typeMap[tag]||'paragraph', txt, lvlMap[tag]||'']);
        }
      }
      var csv = rows.map(function (r) { return r.map(function (c) { return '"' + (c||'').replace(/"/g,'""') + '"'; }).join(','); }).join('\n');
      saveText(csv, safeName(getDocTitle()) + '.csv', 'text/csv');
    }

    /* ── LaTeX ──────────────────────────────────────────────────── */
    function dlLaTeX() {
      function ltxEsc(s) {
        return (s||'').replace(/\\/g,'\\textbackslash{}').replace(/[&%$#_{}~^]/g, function(c){ return '\\'+c; });
      }
      var parser = new DOMParser();
      var doc    = parser.parseFromString(editor.innerHTML, 'text/html');
      var title  = getDocTitle();
      var body   = '';
      var inList = false;
      for (var i = 0; i < doc.body.children.length; i++) {
        var el  = doc.body.children[i];
        var tag = el.tagName.toUpperCase();
        var txt = ltxEsc(el.textContent.trim());
        if (!txt) continue;
        if (tag === 'H1') { body += '\\section{' + txt + '}\n'; }
        else if (tag === 'H2') { body += '\\subsection{' + txt + '}\n'; }
        else if (tag === 'H3') { body += '\\subsubsection{' + txt + '}\n'; }
        else if (tag === 'BLOCKQUOTE') { body += '\\begin{quote}\n' + txt + '\n\\end{quote}\n'; }
        else if (tag === 'UL') {
          body += '\\begin{itemize}\n';
          el.querySelectorAll('li').forEach(function (li) { body += '  \\item ' + ltxEsc(li.textContent.trim()) + '\n'; });
          body += '\\end{itemize}\n';
        } else if (tag === 'OL') {
          body += '\\begin{enumerate}\n';
          el.querySelectorAll('li').forEach(function (li) { body += '  \\item ' + ltxEsc(li.textContent.trim()) + '\n'; });
          body += '\\end{enumerate}\n';
        } else { body += ltxInline(el) + '\n\n'; }
      }

      function ltxInline(node) {
        var out = '';
        if (node.nodeType === Node.TEXT_NODE) return ltxEsc(node.textContent);
        var tag = (node.tagName||'').toUpperCase();
        var inner = Array.from(node.childNodes).map(ltxInline).join('');
        if (tag === 'STRONG'||tag==='B') return '\\textbf{'+inner+'}';
        if (tag === 'EM'||tag==='I')     return '\\textit{'+inner+'}';
        if (tag === 'U')                 return '\\underline{'+inner+'}';
        if (tag === 'S')                 return '\\sout{'+inner+'}';
        return inner;
      }

      var latex = '\\documentclass[12pt]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T1]{fontenc}\n\\usepackage{microtype}\n\\usepackage{ulem}\n\\usepackage{geometry}\n\\geometry{margin=' + val('ttd-margin',20) + 'mm}\n\\setlength{\\parskip}{0.6em}\n\\setlength{\\parindent}{0em}\n\\title{' + ltxEsc(title) + '}\n\\date{\\today}\n\\begin{document}\n\\maketitle\n' + body + '\n\\end{document}';
      saveText(latex, safeName(title) + '.tex', 'text/plain');
    }

  
    /* ── Tab switcher ────────────────────────────────────────────── */
    window.ttdSwitchTab = function (tab) {
        ['format','write','history'].forEach(function (t) {
          var btn = document.getElementById('ttd-tab-' + t);
          var pan = document.getElementById('ttd-panel-' + t);
          if (btn) btn.classList.toggle('active', t === tab);
          if (pan) pan.classList.toggle('active', t === tab);
        });
        if (tab === 'history') ttdRenderHistory();
      };

    /* ── AI Writer — write full document from a prompt ─────────── */
    window.ttdAIWrite = function () {
      var promptEl = document.getElementById('ttd-prompt');
      var prompt   = promptEl ? promptEl.value.trim() : '';
      if (!prompt) { alert('Please describe what you want the AI to write.'); return; }
      var tone    = val('ttd-wtone',    'professional');
      var dtype   = val('ttd-wdoctype', 'general document');
      var length  = val('ttd-length',   'medium');
      var btn     = document.getElementById('ttd-write-btn');
      var lengthGuide = { short: '250-350 words', medium: '500-700 words', long: '900-1100 words', detailed: '1300-1700 words' };
      var wTarget = lengthGuide[length] || '500-700 words';

      if (isProcessing) return;
      isProcessing = true;
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="ttd-spin">&#9696;</span> Writing...'; }

      var aiPrompt = 'You are a professional document writer. Write a complete, well-structured ' + dtype + ' based on the following request. Use a ' + tone + ' tone. Target length: ' + wTarget + '.\n\n' +
        'REQUEST: ' + prompt + '\n\n' +
        'OUTPUT FORMAT: Return ONLY clean HTML using these tags: h1, h2, h3, h4, p, strong, em, u, ul, ol, li, blockquote, br. NO html/head/body/style/script tags.\n\n' +
        'STRUCTURE RULES:\n' +
        '- Open with a clear <h1> title that matches the request\n' +
        '- Use <h2> for major sections\n' +
        '- Use <h3> for sub-sections\n' +
        '- Use <strong> for key terms and important points\n' +
        '- Use <ul>/<ol> for any lists or bullet points\n' +
        '- Use <blockquote> for notable quotes or callout statements\n' +
        '- ALL body text must be inside <p> tags\n' +
        '- Write a proper conclusion or closing section\n' +
        '- Be detailed, informative and complete -- do not truncate\n' +
        '- Match the ' + tone + ' tone throughout the entire document';

      callAI(aiPrompt)
        .then(function (result) {
          var clean = sanitizeHTML(result);
          if (!clean || clean.length < 50) throw new Error('AI returned insufficient content');
          if (editor) {
            editor.innerHTML = clean;
            ttdUpdateStats();
            ttdSwitchTab('format');
            var wTitle=(clean.match(/<h1[^>]*>(.*?)<\/h1>/i)||[])[1]||prompt.slice(0,50)||'AI Doc';
            ttdSaveHistory(wTitle.replace(/<[^>]+>/g,''),editor.innerHTML);
            var pages = document.getElementById('ttd-pages');
            if (pages) pages.scrollTop = 0;
          }
        })
        .catch(function (err) {
          console.error('AI write error:', err);
          alert('AI writing failed. Please try again.\nError: ' + err.message);
        })
        .finally(function () {
          isProcessing = false;
          if (btn) { btn.disabled = false; btn.innerHTML = '&#9997;&#65039; Write with AI'; }
        });
    };

  
      var TTD_HIST_KEY='ttd_doc_history',TTD_MAX_HIST=10;
      function ttdSaveHistory(title,content){
        if(!content||content.length<20)return;
        try{var h=JSON.parse(localStorage.getItem(TTD_HIST_KEY)||'[]');
          h=h.filter(function(x){return x.title!==title;});
          h.unshift({title:(title||'Untitled').slice(0,60),content:content,date:new Date().toLocaleString()});
          if(h.length>TTD_MAX_HIST)h=h.slice(0,TTD_MAX_HIST);
          localStorage.setItem(TTD_HIST_KEY,JSON.stringify(h));}catch(e){}
      }
      function ttdRenderHistory(){
        var list=document.getElementById('ttd-hist-list');if(!list)return;
        var h=[];try{h=JSON.parse(localStorage.getItem(TTD_HIST_KEY)||'[]');}catch(e){}
        if(!h.length){list.innerHTML='<div class="ttd-hist-empty">&#128196; No saved documents yet.<br>Format or write a document to auto-save it here.</div>';return;}
        list.innerHTML=h.map(function(x,i){
          return '<div class="ttd-hist-item" onclick="ttdRestoreDoc('+i+')">'+
            '<button class="ttd-hist-del" onclick="event.stopPropagation();ttdDeleteHistory('+i+')" title="Remove">&#10005;</button>'+
            '<div class="ttd-hist-title">'+(x.title||'Untitled')+'</div>'+
            '<div class="ttd-hist-meta">&#128337; '+(x.date||'')+'</div></div>';
        }).join('');
      }
      window.ttdRestoreDoc=function(i){
        var h=[];try{h=JSON.parse(localStorage.getItem(TTD_HIST_KEY)||'[]');}catch(e){}
        var item=h[i];if(!item)return;
        var ed=document.getElementById('ttd-editor');
        if(ed){ed.innerHTML=item.content;ttdUpdateStats();ttdSwitchTab('format');}
      };
      window.ttdDeleteHistory=function(i){
        var h=[];try{h=JSON.parse(localStorage.getItem(TTD_HIST_KEY)||'[]');}catch(e){}
        h.splice(i,1);localStorage.setItem(TTD_HIST_KEY,JSON.stringify(h));ttdRenderHistory();
      };
      window.ttdClearHistory=function(){
        if(!confirm('Clear all document history?'))return;
        localStorage.removeItem(TTD_HIST_KEY);ttdRenderHistory();
      };
  
      var ttdPages=[''],ttdCurrentPage=0,PAGE_CHAR_LIMIT=2800;
      function ttdGetFullContent(){var ed=document.getElementById('ttd-editor');if(ed)ttdPages[ttdCurrentPage]=ed.innerHTML;return ttdPages.join('');}
      function ttdUpdatePageNav(){var t=ttdPages.length,ind=document.getElementById('ttd-page-indicator'),p=document.getElementById('ttd-prev-btn'),n=document.getElementById('ttd-next-btn');if(ind)ind.textContent='Page '+(ttdCurrentPage+1)+' of '+t;if(p)p.disabled=ttdCurrentPage===0;if(n)n.disabled=ttdCurrentPage>=t-1;}
      function ttdSetPage(n){var ed=document.getElementById('ttd-editor');if(ed)ttdPages[ttdCurrentPage]=ed.innerHTML;ttdCurrentPage=Math.max(0,Math.min(n,ttdPages.length-1));if(ed)ed.innerHTML=ttdPages[ttdCurrentPage]||'';ttdUpdatePageNav();ttdUpdateStats();var pa=document.getElementById('ttd-pages');if(pa)pa.scrollTop=0;}
      window.ttdNavPage=function(d){ttdSetPage(ttdCurrentPage+d);};
      window.ttdAddPageBreak=function(){var ed=document.getElementById('ttd-editor');if(ed)ttdPages[ttdCurrentPage]=ed.innerHTML;ttdPages.splice(ttdCurrentPage+1,0,'');ttdSetPage(ttdCurrentPage+1);};
      function ttdSplitIntoPages(html){var tmp=document.createElement('div');tmp.innerHTML=html;var blocks=Array.from(tmp.childNodes).filter(function(n){return n.nodeType===1||(n.nodeType===3&&n.textContent.trim());});var pages=[],cur='',curC=0;blocks.forEach(function(b){var bh=b.outerHTML||('<p>'+b.textContent+'</p>'),bl=(b.textContent||'').length,isH1=b.tagName==='H1';if((isH1&&curC>100)||(curC+bl>PAGE_CHAR_LIMIT&&curC>0)){pages.push(cur);cur=bh;curC=bl;}else{cur+=bh;curC+=bl;}});if(cur)pages.push(cur);return pages.length?pages:[''];}
      function ttdLoadContent(html){ttdPages=ttdSplitIntoPages(html);ttdCurrentPage=0;var ed=document.getElementById('ttd-editor');if(ed)ed.innerHTML=ttdPages[0]||'';ttdUpdatePageNav();ttdUpdateStats();}
      function ttdShowUploadStatus(msg,isErr){var el=document.getElementById('ttd-upload-status');if(!el)return;el.textContent=msg;el.style.display='block';el.className='ttd-upload-status'+(isErr?' error':'');if(!isErr)setTimeout(function(){el.style.display='none';},4000);}
      window.ttdHandleFileDrop=function(ev){ev.preventDefault();var f=ev.dataTransfer&&ev.dataTransfer.files&&ev.dataTransfer.files[0];if(f)window.ttdHandleFile(f);};
      window.ttdHandleFile=function(file){if(!file)return;var name=file.name.toLowerCase();ttdShowUploadStatus('Reading '+file.name+'...',false);if(name.endsWith('.txt')){var r=new FileReader();r.onload=function(e){ttdLoadContent(ttdParseTxt(e.target.result));ttdShowUploadStatus('Loaded: '+file.name,false);ttdSwitchTab('format');};r.readAsText(file);}else if(name.endsWith('.html')||name.endsWith('.htm')){var r2=new FileReader();r2.onload=function(e){var tmp=document.createElement('div');tmp.innerHTML=e.target.result;tmp.querySelectorAll('script,style,head,meta,link').forEach(function(x){x.remove();});var body=tmp.querySelector('body');ttdLoadContent(body?body.innerHTML:tmp.innerHTML);ttdShowUploadStatus('Loaded: '+file.name,false);ttdSwitchTab('format');};r2.readAsText(file);}else if(name.endsWith('.docx')){if(typeof mammoth==='undefined'){ttdShowUploadStatus('DOCX parser not loaded — check internet.',true);return;}var r3=new FileReader();r3.onload=function(e){mammoth.convertToHtml({arrayBuffer:e.target.result}).then(function(res){ttdLoadContent(res.value);ttdShowUploadStatus('Loaded: '+file.name,false);ttdSwitchTab('format');}).catch(function(err){ttdShowUploadStatus('DOCX error: '+err.message,true);});};r3.readAsArrayBuffer(file);}else if(name.endsWith('.pdf')){var r4=new FileReader();r4.onload=function(e){ttdParsePdf(e.target.result,file.name);};r4.readAsArrayBuffer(file);}else{ttdShowUploadStatus('Unsupported type. Use TXT, DOCX, PDF or HTML.',true);}};
      function ttdParseTxt(text){var lines=text.split(/\r?\n/),html='',inP=false;lines.forEach(function(l){var t=l.trim();if(!t){if(inP){html+='</p>';inP=false;}}else if(!inP){html+='<p>'+t.replace(/</g,'&lt;').replace(/>/g,'&gt;');inP=true;}else{html+=' '+t.replace(/</g,'&lt;').replace(/>/g,'&gt;');}});if(inP)html+='</p>';return html||'<p></p>';}
      function ttdParsePdf(buf,name){if(typeof pdfjsLib!=='undefined'){pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';pdfjsLib.getDocument({data:buf}).promise.then(function(pdf){var pages=[],total=pdf.numPages,fetched=0;for(var i=1;i<=total;i++){(function(pn){pdf.getPage(pn).then(function(pg){pg.getTextContent().then(function(c){pages[pn-1]=c.items.map(function(it){return it.str;}).join(' ');fetched++;if(fetched===total){var html=pages.map(function(p){return'<p>'+p.replace(/</g,'&lt;')+'</p>';}).join('');ttdLoadContent(html);ttdShowUploadStatus('Loaded: '+name+' ('+total+' pages)',false);ttdSwitchTab('format');}});});})(i);}}).catch(function(err){ttdShowUploadStatus('PDF error: '+err.message,true);});}else{ttdShowUploadStatus('PDF needs internet (PDF.js). Try TXT or DOCX.',true);}}
  
})();