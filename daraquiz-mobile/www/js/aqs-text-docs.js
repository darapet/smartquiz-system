/* Text to Docs — AI text correction + multi-format download */
  /* Formats: PDF, DOCX, ODT, TXT, HTML, Markdown, RTF, JSON, CSV, LaTeX */
  (function ($) {
      'use strict';

      if (!$('#ttd-input').length) return;

      var MAX_CHARS = 10000;
      var correctedText = '';
      var isProcessing  = false;

      /* ── Sidebar toggle ─────────────────────────────────────── */
      var $overlay = $('#aqs-sidebar-overlay');
      $('#aqs-sidebar-toggle').on('click', function () { $('#aqs-sidebar').addClass('open'); $overlay.addClass('open'); });
      $overlay.on('click', function () { $('#aqs-sidebar').removeClass('open'); $overlay.removeClass('open'); });

      /* ── Character counter ──────────────────────────────────── */
      $('#ttd-input').on('input', function () {
          var len  = this.value.length;
          var pct  = len / MAX_CHARS;
          $('#ttd-char-count').text(len.toLocaleString());
          $('#ttd-counter-fill').css('width', (pct * 100) + '%');
          var color = pct > 0.9 ? '#e11d48' : pct > 0.7 ? '#f59e0b' : '#6366f1';
          $('#ttd-counter-fill').css('background', color);
          $('#ttd-char-count').css('color', pct > 0.9 ? '#e11d48' : pct > 0.7 ? '#f59e0b' : '#6b7280');
      });

      /* ── Clear ──────────────────────────────────────────────── */
      $('#ttd-clear-btn').on('click', function () {
          if (!$('#ttd-input').val() || confirm('Clear all text?')) {
              $('#ttd-input').val('').trigger('input');
              correctedText = '';
              $('#ttd-output-section, #ttd-dl-section').hide();
          }
      });

      /* ── Copy ───────────────────────────────────────────────── */
      $('#ttd-copy-btn').on('click', function () {
          var text = $('#ttd-output-body').text();
          if (navigator.clipboard) {
              navigator.clipboard.writeText(text).then(function () { flash('Copied!'); }).catch(function () { legacyCopy(text); });
          } else { legacyCopy(text); }
      });
      function legacyCopy(text) {
          var ta = document.createElement('textarea');
          ta.value = text; document.body.appendChild(ta);
          ta.select(); document.execCommand('copy');
          document.body.removeChild(ta); flash('Copied!');
      }
      function flash(msg) {
          var $btn = $('#ttd-copy-btn');
          var orig = $btn.html();
          $btn.html('&#10003; ' + msg);
          setTimeout(function () { $btn.html(orig); }, 1800);
      }

      /* ── Use As-Is (skip AI) ────────────────────────────────── */
      $('#ttd-raw-btn').on('click', function () {
          var text = $('#ttd-input').val().trim();
          if (!text) { alert('Please paste some text first.'); return; }
          correctedText = text;
          showOutput(text, false);
      });

      /* ── AI Correct button ──────────────────────────────────── */
      $('#ttd-ai-btn').on('click', async function () {
          var text = $('#ttd-input').val().trim();
          if (!text) { alert('Please paste some text first.'); return; }
          if (isProcessing) return;
          isProcessing = true;

          $('#ttd-ai-btn').prop('disabled', true).html('&#9203; Processing...');
          $('#ttd-progress').css('display', 'flex');
          $('#ttd-output-section, #ttd-dl-section').hide();

          try {
              var result = await correctWithAI(text);
              correctedText = result;
              showOutput(result, true);
          } catch (e) {
              alert('AI error: ' + e.message + '\nYou can still use "Use Text As-Is" to download without AI correction.');
          } finally {
              isProcessing = false;
              $('#ttd-ai-btn').prop('disabled', false).html('&#10024; AI Correct &amp; Format');
              $('#ttd-progress').hide();
          }
      });

      function showOutput(text, aiCorrected) {
          $('#ttd-output-body').text(text);
          var words  = text.trim().split(/\s+/).filter(Boolean).length;
          var chars  = text.length;
          var paras  = text.split(/\n+/).filter(function (p) { return p.trim(); }).length;
          var readMin = Math.ceil(words / 200);
          $('#ttd-output-stats').html(
              stat('Words', words.toLocaleString()) +
              stat('Characters', chars.toLocaleString()) +
              stat('Paragraphs', paras) +
              stat('Read time', '~' + readMin + ' min') +
              (aiCorrected ? stat('Status', '&#10024; AI corrected') : stat('Status', 'Raw text'))
          );
          $('#ttd-output-section').show();
          $('#ttd-dl-section').show();
          $('html,body').animate({ scrollTop: $('#ttd-output-section').offset().top - 20 }, 450);
      }
      function stat(label, val) {
          return '<div class="ttd-stat"><strong>' + val + '</strong>&nbsp;' + label + '</div>';
      }

      /* ── AI Correction ──────────────────────────────────────── */
      async function correctWithAI(text) {
          var tone   = $('#ttd-tone').val() || 'professional';
          var toneMap = {
              professional: 'professional and clear',
              academic:     'academic with formal citations-ready structure',
              casual:       'friendly and conversational',
              formal:       'formal and legal-grade',
              technical:    'technical and precise'
          };
          var prompt = 'You are a professional editor and document writer. Your task:\n' +
              '1. Correct ALL spelling errors\n' +
              '2. Fix grammar and punctuation\n' +
              '3. Improve sentence clarity and flow\n' +
              '4. Organize into proper paragraphs\n' +
              '5. Use a ' + (toneMap[tone] || 'professional') + ' tone\n' +
              '6. Keep the original meaning and ALL content — do not add new information\n\n' +
              'IMPORTANT: Return ONLY the corrected text. No commentary, no labels, no explanations.\n\n' +
              'TEXT TO CORRECT:\n' + text;

          setProgress('Connecting to AI...');

          /* 1. Groq — fast, best quality */
          if (typeof window.groqFetch === 'function') {
              try {
                  setProgress('Correcting with Groq AI...');
                  var ctrl = new AbortController();
                  var tid  = setTimeout(function () { ctrl.abort(); }, 30000);
                  var res  = await window.groqFetch({
                      model: 'llama-3.1-8b-instant',
                      messages: [
                          { role: 'system', content: 'You are a professional editor. Return ONLY the corrected text, nothing else.' },
                          { role: 'user',   content: prompt }
                      ],
                      max_tokens: 4096, temperature: 0.15
                  }, { signal: ctrl.signal });
                  clearTimeout(tid);
                  if (res.ok) {
                      var data = await res.json();
                      var t = (((data.choices || [])[0] || {}).message || {}).content || '';
                      if (t.trim().length > 10) return t.trim();
                  }
              } catch (e) { /* fallthrough */ }
          }

          /* 2. Pollinations — free, no key */
          setProgress('Correcting with AI (free)...');
          var MODELS = ['openai', 'openai-fast', 'mistral'];
          for (var i = 0; i < MODELS.length; i++) {
              try {
                  var ctrl2 = new AbortController();
                  var tid2  = setTimeout(function () { ctrl2.abort(); }, 25000);
                  var res2  = await fetch('https://text.pollinations.ai/openai', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      signal: ctrl2.signal,
                      body: JSON.stringify({
                          model: MODELS[i], temperature: 0.15, private: true,
                          messages: [
                              { role: 'system', content: 'You are a professional editor. Return ONLY the corrected text, nothing else.' },
                              { role: 'user',   content: prompt }
                          ]
                      })
                  });
                  clearTimeout(tid2);
                  if (!res2.ok) continue;
                  var data2  = await res2.json();
                  var t2 = ((((data2.choices || [])[0] || {}).message) || {}).content || '';
                  if (t2.trim().length > 10) return t2.trim();
              } catch (e2) { /* try next model */ }
          }

          throw new Error('All AI sources failed. Please check your internet connection and try again.');
      }

      function setProgress(msg) { $('#ttd-progress-msg').text(msg); }

      /* ── Download dispatcher ────────────────────────────────── */
      $(document).on('click', '.ttd-dl-btn', async function () {
          var fmt   = $(this).data('format');
          var text  = correctedText || $('#ttd-input').val().trim();
          var title = ($('#ttd-title').val() || 'document').trim();
          if (!text) { alert('No text to download.'); return; }

          var $btn = $(this);
          var orig = $btn.html();
          $btn.html('<span class="ttd-dl-icon">&#8987;</span><span class="ttd-dl-name">...</span>').css('opacity',.6);
          try {
              switch (fmt) {
                  case 'txt':   downloadTxt(text, title);        break;
                  case 'html':  downloadHtml(text, title);       break;
                  case 'md':    downloadMd(text, title);         break;
                  case 'rtf':   downloadRtf(text, title);        break;
                  case 'json':  downloadJson(text, title);       break;
                  case 'csv':   downloadCsv(text, title);        break;
                  case 'latex': downloadLatex(text, title);      break;
                  case 'pdf':   await downloadPdf(text, title);  break;
                  case 'docx':  await downloadDocx(text, title); break;
                  case 'odt':   await downloadOdt(text, title);  break;
              }
          } catch (e) { alert('Download error: ' + e.message); }
          $btn.html(orig).css('opacity', 1);
      });

      /* ── Blob download helper ───────────────────────────────── */
      function blobDl(content, filename, type) {
          var blob = new Blob([content], { type: type });
          var url  = URL.createObjectURL(blob);
          var a    = document.createElement('a');
          a.href = url; a.download = filename;
          document.body.appendChild(a); a.click();
          setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1200);
      }

      /* ── Format implementations ─────────────────────────────── */

      function downloadTxt(text, title) {
          blobDl(text, safe(title) + '.txt', 'text/plain;charset=utf-8');
      }

      function downloadHtml(text, title) {
          var paras = text.split(/\n+/).map(function (p) {
              return p.trim() ? '<p>' + eh(p) + '</p>' : '';
          }).join('\n');
          var html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n' +
              '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
              '<title>' + eh(title) + '</title>\n' +
              '<style>body{font-family:Georgia,serif;max-width:780px;margin:48px auto;padding:0 24px;' +
              'line-height:1.8;color:#1e293b}h1{font-size:1.8rem;margin-bottom:8px}' +
              '.meta{color:#94a3b8;font-size:.83rem;margin-bottom:28px}p{margin-bottom:1em}</style>\n' +
              '</head>\n<body>\n<h1>' + eh(title) + '</h1>\n' +
              '<div class="meta">Generated by XZILY AI Text to Docs &middot; ' + new Date().toLocaleDateString() + '</div>\n' +
              paras + '\n</body>\n</html>';
          blobDl(html, safe(title) + '.html', 'text/html;charset=utf-8');
      }

      function downloadMd(text, title) {
          var md = '# ' + title + '\n\n' +
              '> Generated by XZILY AI Text to Docs — ' + new Date().toLocaleDateString() + '\n\n' +
              text;
          blobDl(md, safe(title) + '.md', 'text/markdown;charset=utf-8');
      }

      function downloadRtf(text, title) {
          var paras = text.split(/\n+/).map(function (p) {
              return p.trim() ? '{\\pard ' + er(p) + '\\par}' : '';
          }).filter(Boolean).join('\n');
          var rtf = '{\\rtf1\\ansi\\ansicpg1252\\deff0\n' +
              '{\\fonttbl{\\f0\\froman Times New Roman;}{\\f1\\fswiss Arial;}}\n' +
              '{\\colortbl;\\red30\\green41\\blue59;}\n' +
              '\\f1\\fs24\\cf1\n' +
              '{\\pard\\b\\fs36 ' + er(title) + '\\par}\n' +
              '{\\pard\\fs18\\cf1 Generated by XZILY AI · ' + new Date().toLocaleDateString() + '\\par}\n' +
              '\\pard\\fs24\\par\n' + paras + '\n}';
          blobDl(rtf, safe(title) + '.rtf', 'application/rtf;charset=utf-8');
      }

      function downloadJson(text, title) {
          var paras = text.split(/\n+/).filter(function (p) { return p.trim(); });
          var obj = {
              title:     title,
              generated: new Date().toISOString(),
              generator: 'XZILY AI Text to Docs',
              stats: {
                  wordCount: text.trim().split(/\s+/).filter(Boolean).length,
                  charCount: text.length,
                  paragraphs: paras.length
              },
              paragraphs: paras,
              fullText:   text
          };
          blobDl(JSON.stringify(obj, null, 2), safe(title) + '.json', 'application/json;charset=utf-8');
      }

      function downloadCsv(text, title) {
          var lines = text.split(/\n+/).filter(function (l) { return l.trim(); });
          var rows  = [['#', 'Paragraph', 'Words', 'Characters']];
          lines.forEach(function (line, i) {
              rows.push([i + 1, '"' + line.replace(/"/g, '""') + '"',
                  line.trim().split(/\s+/).filter(Boolean).length, line.length]);
          });
          blobDl(rows.map(function (r) { return r.join(','); }).join('\n'),
              safe(title) + '.csv', 'text/csv;charset=utf-8');
      }

      function downloadLatex(text, title) {
          var paras = text.split(/\n+/).map(function (p) {
              return p.trim() ? el(p) : '';
          }).join('\n\n');
          var tex = '\\documentclass[12pt,a4paper]{article}\n' +
              '\\usepackage[utf8]{inputenc}\n\\usepackage[T1]{fontenc}\n' +
              '\\usepackage{geometry}\\geometry{margin=2.5cm}\n' +
              '\\usepackage{parskip}\\usepackage{microtype}\n' +
              '\\title{' + el(title) + '}\n' +
              '\\author{XZILY AI Text to Docs}\n\\date{\\today}\n' +
              '\\begin{document}\n\\maketitle\n\n' + paras + '\n\n\\end{document}\n';
          blobDl(tex, safe(title) + '.tex', 'application/x-latex;charset=utf-8');
      }

      async function downloadPdf(text, title) {
          if (typeof window.jspdf === 'undefined') { alert('PDF library loading, please try again in a moment.'); return; }
          var { jsPDF } = window.jspdf;
          var doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
          var pageW = doc.internal.pageSize.getWidth();
          var pageH = doc.internal.pageSize.getHeight();
          var ml    = 20, mr = 20, mt = 25, y = mt;

          /* Header */
          doc.setFillColor(79, 70, 229);
          doc.rect(0, 0, pageW, 14, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(8); doc.setFont('helvetica', 'normal');
          doc.text('XZILY AI • Text to Docs', ml, 9);
          doc.text(new Date().toLocaleDateString(), pageW - mr, 9, { align: 'right' });

          /* Title */
          doc.setTextColor(30, 41, 59);
          doc.setFontSize(20); doc.setFont('helvetica', 'bold');
          y = 32;
          var titleLines = doc.splitTextToSize(title, pageW - ml - mr);
          doc.text(titleLines, ml, y);
          y += titleLines.length * 8 + 4;

          /* Divider */
          doc.setDrawColor(99, 102, 241); doc.setLineWidth(0.5);
          doc.line(ml, y, pageW - mr, y); y += 8;

          /* Body */
          doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
          var paras = text.split(/\n+/).filter(function (p) { return p.trim(); });
          paras.forEach(function (para) {
              var lines = doc.splitTextToSize(para, pageW - ml - mr);
              if (y + lines.length * 6 > pageH - 20) {
                  doc.addPage();
                  /* Page header */
                  doc.setFillColor(79, 70, 229); doc.rect(0, 0, pageW, 14, 'F');
                  doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
                  doc.text('XZILY AI • Text to Docs', ml, 9);
                  doc.text(new Date().toLocaleDateString(), pageW - mr, 9, { align: 'right' });
                  doc.setTextColor(30, 41, 59); doc.setFontSize(11); doc.setFont('helvetica', 'normal');
                  y = 25;
              }
              doc.text(lines, ml, y);
              y += lines.length * 6 + 3;
          });

          /* Page footer */
          var totalPages = doc.internal.getNumberOfPages();
          for (var i = 1; i <= totalPages; i++) {
              doc.setPage(i);
              doc.setFontSize(8); doc.setTextColor(148, 163, 184);
              doc.text('Page ' + i + ' of ' + totalPages, pageW / 2, pageH - 8, { align: 'center' });
          }

          doc.save(safe(title) + '.pdf');
      }

      async function downloadDocx(text, title) {
          if (typeof window.docx === 'undefined') { alert('DOCX library loading, please try again in a moment.'); return; }
          var D = window.docx;
          var paras = text.split(/\n+/).filter(function (p) { return p.trim(); });

          var children = [
              new D.Paragraph({
                  children: [new D.TextRun({ text: title, bold: true, size: 40, color: '4F46E5' })],
                  spacing: { after: 240 }
              }),
              new D.Paragraph({
                  children: [new D.TextRun({ text: 'Generated by XZILY AI Text to Docs · ' + new Date().toLocaleDateString(), size: 18, color: '94A3B8' })],
                  spacing: { after: 400 }
              })
          ];

          paras.forEach(function (para) {
              children.push(new D.Paragraph({
                  children: [new D.TextRun({ text: para, size: 24 })],
                  spacing: { after: 200 }
              }));
          });

          var doc = new D.Document({
              sections: [{
                  properties: {
                      page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
                  },
                  children: children
              }]
          });

          var blob = await D.Packer.toBlob(doc);
          triggerBlobDownload(blob, safe(title) + '.docx');
      }

      async function downloadOdt(text, title) {
          if (typeof window.JSZip === 'undefined') { alert('ODT library loading, please try again in a moment.'); return; }
          var paras   = text.split(/\n+/).filter(function (p) { return p.trim(); });
          var bodyXml = paras.map(function (p) {
              return '<text:p text:style-name="P1">' + eh(p) + '</text:p>';
          }).join('\n');

          var content = '<?xml version="1.0" encoding="UTF-8"?>\n' +
              '<office:document-content' +
              ' xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
              ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"' +
              ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"' +
              ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">' +
              '<office:automatic-styles>' +
              '<style:style style:name="H1" style:family="paragraph">' +
              '<style:text-properties fo:font-size="20pt" fo:font-weight="bold" fo:color="#4F46E5"/>' +
              '<style:paragraph-properties fo:margin-bottom="0.4cm"/></style:style>' +
              '<style:style style:name="P1" style:family="paragraph">' +
              '<style:text-properties fo:font-size="12pt" fo:color="#1e293b"/>' +
              '<style:paragraph-properties fo:margin-bottom="0.25cm" fo:line-height="150%"/></style:style>' +
              '</office:automatic-styles>' +
              '<office:body><office:text>' +
              '<text:p text:style-name="H1">' + eh(title) + '</text:p>\n' + bodyXml +
              '</office:text></office:body></office:document-content>';

          var manifest = '<?xml version="1.0" encoding="UTF-8"?>\n' +
              '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">' +
              '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>' +
              '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>' +
              '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>' +
              '</manifest:manifest>';

          var styles = '<?xml version="1.0" encoding="UTF-8"?>' +
              '<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
              ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"' +
              ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">' +
              '<office:styles/></office:document-styles>';

          var zip = new window.JSZip();
          zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
          zip.file('content.xml', content);
          zip.file('styles.xml', styles);
          zip.folder('META-INF').file('manifest.xml', manifest);

          var blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text' });
          triggerBlobDownload(blob, safe(title) + '.odt');
      }

      /* ── Utilities ──────────────────────────────────────────── */
      function triggerBlobDownload(blob, filename) {
          var url = URL.createObjectURL(blob);
          var a   = document.createElement('a');
          a.href = url; a.download = filename;
          document.body.appendChild(a); a.click();
          setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1200);
      }

      function eh(str) {
          return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      function er(str) { /* RTF escape */
          return String(str)
              .replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}')
              .replace(/[^\x00-\x7F]/g, function (ch) {
                  var c = ch.charCodeAt(0);
                  return c > 255 ? '\\u' + c + '?' : "\\'" + c.toString(16).padStart(2, '0');
              });
      }

      function el(str) { /* LaTeX escape */
          return String(str)
              .replace(/\\/g, '\\textbackslash{}')
              .replace(/[&%$#_{}~^]/g, function (c) { return '\\' + c; });
      }

      function safe(str) { /* safe filename */
          return String(str).replace(/[^a-z0-9_\-\s]/gi, '').replace(/\s+/g, '_').substring(0, 60) || 'document';
      }

  })(jQuery);
  