/* AQS Document Quiz Builder  v2.0
   Two parser modes on one page:
     Mode A — Extract existing MCQ questions (numbered, A/B/C/D) from the document
     Mode B — Read plain text / notes and use AI to create fresh MCQ questions

   Both modes lead to the same editable preview → save as draft / publish → quiz + challenge links.
   Triggered only on the ?tab=parser page (detects #aqs-pz-wrap).
*/
(function ($) {
    'use strict';

    if (!$('#aqs-pz-wrap').length) return;

    /* ── State ──────────────────────────────────────────────────────── */
    var questions     = [];   // unified list used by both modes
    var uploadedFile  = null;
    var extractedText = '';   // raw doc text (populated after extraction)
    var currentQuizId = null;
    var parserMode    = '';   // 'mcq' | 'ai'

    /* ── Helpers ─────────────────────────────────────────────────────── */
    function esc(str) {
        return String(str || '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function showProgress(msg) {
        $('#aqs-pz-status').text(msg || 'Working…');
        $('#aqs-pz-pbar-fill').css('width','0%');
        $('#aqs-pz-progress').show();
    }

    function hideProgress() { $('#aqs-pz-progress').hide(); }

    function setStatus(msg) { $('#aqs-pz-status').text(msg); }

    function setBar(pct) { $('#aqs-pz-pbar-fill').css('width', Math.min(100,pct) + '%'); }

    function updateCount() {
        $('#aqs-pz-q-count').text(
            questions.length + ' question' + (questions.length !== 1 ? 's' : '')
        );
    }

    /* ── Mode toggle (Exam / Practice) ─────────────────────────────── */
    $('#aqs-pz-wrap').on('click', '.aqs-toggle', function () {
        $(this).closest('.aqs-toggle-group').find('.aqs-toggle').removeClass('active');
        $(this).addClass('active');
        $('#aqs-pz-mode').val($(this).data('mode'));
    });

    /* ══════════════════════════════════════════════════════════════════
       FILE UPLOAD
    ══════════════════════════════════════════════════════════════════ */
    $('#aqs-pz-browse-btn').on('click', function () { $('#aqs-pz-file-input').click(); });
    $('#aqs-pz-file-input').on('change', function () { if (this.files[0]) setFile(this.files[0]); });

    var dropZoneEl = document.getElementById('aqs-pz-upload-zone');
    if (dropZoneEl) {
        dropZoneEl.addEventListener('dragover',  function (e) { e.preventDefault(); dropZoneEl.classList.add('drag-over'); });
        dropZoneEl.addEventListener('dragleave', function ()  { dropZoneEl.classList.remove('drag-over'); });
        dropZoneEl.addEventListener('drop', function (e) {
            e.preventDefault(); dropZoneEl.classList.remove('drag-over');
            if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
        });
    }

    function setFile(file) {
        uploadedFile  = file;
        extractedText = '';
        questions     = [];
        parserMode    = '';
        $('#aqs-pz-file-name').text(file.name);
        $('#aqs-pz-upload-zone').hide();
        $('#aqs-pz-file-info').show();
        $('#aqs-pz-mode-choice').show();
        /* Reset downstream UI */
        $('#aqs-pz-ai-settings, #aqs-pz-mcq-actions').hide();
        $('#aqs-pz-no-mcq, #aqs-pz-progress').hide();
        $('#aqs-pz-step-questions, #aqs-pz-step-publish').hide();
        $('#aqs-pz-questions-list').empty();
        /* Clear active selection on mode cards */
        $('#aqs-pz-mode-mcq, #aqs-pz-mode-ai').removeClass('active');
    }

    $('#aqs-pz-remove-file').on('click', function () {
        uploadedFile = null; extractedText = ''; questions = []; parserMode = '';
        $('#aqs-pz-file-input').val('');
        $('#aqs-pz-upload-zone').show();
        $('#aqs-pz-file-info, #aqs-pz-mode-choice').hide();
        $('#aqs-pz-ai-settings, #aqs-pz-mcq-actions, #aqs-pz-no-mcq, #aqs-pz-progress').hide();
        $('#aqs-pz-step-questions, #aqs-pz-step-publish').hide();
        $('#aqs-pz-questions-list').empty();
        $('#aqs-pz-mode-mcq, #aqs-pz-mode-ai').removeClass('active');
    });

    /* ══════════════════════════════════════════════════════════════════
       MODE SELECTION CARDS
    ══════════════════════════════════════════════════════════════════ */
    $('#aqs-pz-mode-mcq').on('click', function () {
        parserMode = 'mcq';
        $(this).addClass('active');
        $('#aqs-pz-mode-ai').removeClass('active');
        $('#aqs-pz-ai-settings').hide();
        $('#aqs-pz-mcq-actions').show();
        $('#aqs-pz-no-mcq').hide();
    });

    $('#aqs-pz-mode-ai').on('click', function () {
        parserMode = 'ai';
        $(this).addClass('active');
        $('#aqs-pz-mode-mcq').removeClass('active');
        $('#aqs-pz-mcq-actions').hide();
        $('#aqs-pz-ai-settings').show();
        $('#aqs-pz-no-mcq').hide();
    });

    /* ══════════════════════════════════════════════════════════════════
       MODE A — EXTRACT EXISTING MCQ QUESTIONS
    ══════════════════════════════════════════════════════════════════ */
    $('#aqs-pz-parse-btn').on('click', async function () {
        if (!uploadedFile) { alert('Upload a file first.'); return; }
        showProgress('Extracting text from document…');
        $('#aqs-pz-parse-btn').prop('disabled', true);
        $('#aqs-pz-no-mcq').hide();

        try {
            if (!extractedText) extractedText = await extractTextFromFile(uploadedFile);
            setStatus('Detecting MCQ questions…'); setBar(60);

            var found = parseMCQ(extractedText);
            hideProgress();
            $('#aqs-pz-parse-btn').prop('disabled', false);

            if (!found.length) {
                /* No MCQ detected — show notice and offer AI mode */
                $('#aqs-pz-no-mcq').show();
                return;
            }

            questions = found;
            renderQuestions();
            /* Show "Answer All with AI" for any unanswered questions */
            var unanswered = questions.filter(function (q) { return q.correct_answer_index < 0; }).length;
            if (unanswered > 0) $('#aqs-pz-ai-all-btn').show();
            showSteps();
        } catch (e) {
            hideProgress();
            $('#aqs-pz-parse-btn').prop('disabled', false);
            alert('Could not read file: ' + e.message);
        }
    });

    /* ── MCQ text parser ─────────────────────────────────────────────── */
    function parseMCQ(text) {
        var result = [];
        var clean  = text.replace(/\*\*([^*\n]+)\*\*/g,'$1').replace(/\*([^*\n]+)\*/g,'$1');
        var blocks = clean.split(/\n(?=\s*\d+[.)]\s)/);

        blocks.forEach(function (block) {
            var qMatch = block.match(/^\s*\d+[.)]\s+([\s\S]+)/);
            if (!qMatch) return;
            var lines        = qMatch[1].split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
            var qLines = [], opts = [], correctIdx = -1, expl = '', inOpts = false;

            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*([^*]+)\*/g,'$1').trim();
                var optM = line.match(/^[-•*]?\s*\(?([A-Da-d])\)?[.):\]]\s*(.*)/);
                if (optM) { inOpts = true; opts.push(optM[2].trim()); continue; }
                var ansM = line.match(/^(?:answer|correct(?:\s+answer)?|ans)[:\s]+\(?([A-Da-d])\)?/i);
                if (ansM) { correctIdx = ansM[1].toUpperCase().charCodeAt(0) - 65; continue; }
                var expM = line.match(/^(?:explanation|reason|note)[:\s]+(.*)/i);
                if (expM) { expl = expM[1].trim(); continue; }
                if (!inOpts) qLines.push(line);
            }

            var question = qLines.join(' ').trim();
            if (question && opts.length >= 2) {
                result.push({
                    question:             question,
                    options:              opts,
                    correct_answer_index: correctIdx >= 0 ? Math.min(correctIdx, opts.length - 1) : -1,
                    explanation:          expl
                });
            }
        });
        return result;
    }

    /* ══════════════════════════════════════════════════════════════════
       MODE B — GENERATE QUESTIONS FROM TEXT WITH AI
    ══════════════════════════════════════════════════════════════════ */
    $('#aqs-pz-generate-btn').on('click', async function () {
        if (!uploadedFile) { alert('Upload a file first.'); return; }
        var subject = $('#aqs-pz-subject').val().trim() || 'General';
        var numQ    = Math.max(1, Math.min(50, parseInt($('#aqs-pz-num-questions').val()) || 10));
        var diff    = $('#aqs-pz-difficulty').val() || 'medium';

        showProgress('Extracting text from document…');
        $('#aqs-pz-generate-btn').prop('disabled', true);
        questions = [];

        try {
            if (!extractedText) extractedText = await extractTextFromFile(uploadedFile);
            setStatus('Contacting AI…'); setBar(20);

            var result = await generateWithAI(extractedText, numQ, subject, diff);
            hideProgress();
            $('#aqs-pz-generate-btn').prop('disabled', false);

            if (!result.length) { alert('AI did not return any questions. Please try again.'); return; }

            questions = result;
            renderQuestions();
            showSteps();
        } catch (e) {
            hideProgress();
            $('#aqs-pz-generate-btn').prop('disabled', false);
            alert('AI error: ' + e.message);
        }
    });

    /* ══════════════════════════════════════════════════════════════════
       TEXT EXTRACTION  (PDF.js + Mammoth)
    ══════════════════════════════════════════════════════════════════ */
    async function extractTextFromFile(file) {
        var name = file.name.toLowerCase();
        if (name.endsWith('.pdf'))                           return extractPDF(file);
        if (name.endsWith('.docx') || name.endsWith('.doc')) return extractDocx(file);
        throw new Error('Unsupported file type. Please use PDF or DOCX.');
    }

    async function extractPDF(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js library is not loaded. Please refresh the page.');
                    pdfjsLib.GlobalWorkerOptions.workerSrc =
                        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    var pdf = await pdfjsLib.getDocument({ data: e.target.result }).promise;
                    var pages = [];
                    for (var i = 1; i <= pdf.numPages; i++) {
                        var page = await pdf.getPage(i);
                        var content = await page.getTextContent();
                        var pageText = '';
                        var lastY = null;
                        content.items.forEach(function (item) {
                            if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) pageText += '\n';
                            pageText += item.str;
                            lastY = item.transform[5];
                        });
                        pages.push(pageText);
                    }
                    var full = pages.join('\n\n');
                    if (!full.trim()) throw new Error('PDF appears to be empty or image-only. Try a text-based PDF.');
                    resolve(full);
                } catch (err) { reject(err); }
            };
            reader.onerror = function () { reject(new Error('Could not read file.')); };
            reader.readAsArrayBuffer(file);
        });
    }

    async function extractDocx(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    if (typeof mammoth === 'undefined') throw new Error('Mammoth.js library is not loaded. Please refresh the page.');
                    var result = await mammoth.extractRawText({ arrayBuffer: e.target.result });
                    if (!result.value || !result.value.trim()) throw new Error('Document appears to be empty or could not be read.');
                    resolve(result.value);
                } catch (err) { reject(err); }
            };
            reader.onerror = function () { reject(new Error('Could not read file.')); };
            reader.readAsArrayBuffer(file);
        });
    }

})(window.jQuery || null);

