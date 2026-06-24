/* ═══════════════════════════════════════════════════════════════
   XZily AI — Text → Docs  |  Full Word Processor Engine  v3.4
   Features: AI Format/Write/Translate/Summarize/Expand
             30+ Google Fonts · Image Upload & Resize
             Excel-Style Tables · Chart from Data
             Find & Replace · Zoom · Templates · Multi-Page
             PDF · DOCX · HTML · TXT · MD · RTF · LaTeX · JSON · CSV
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── State ─────────────────────────────────────────────────── */
  var wpPages = [''], wpCurrentPage = 0, wpIsProcessing = false;
  var wpZoom = 1, wpShowLabels = false;
  var wpFindMatches = [], wpFindIndex = -1;
  var wpCtxCell = null, wpCtxTable = null;
  var wpChartType = 'bar', wpChartInstance = null;
  var wpSavedSelection = null;
  var wpReflowTimer = null;
  var PAGE_CHAR_LIMIT = 2800, MAX_PAGES = 9999 /* no practical limit */;

  /* ── Color palettes ─────────────────────────────────────────── */
  var TEXT_COLORS = [
    '#000000','#1a1a1a','#374151','#4b5563','#6b7280','#9ca3af','#ffffff',
    '#dc2626','#ef4444','#f97316','#f59e0b','#eab308','#22c55e','#16a34a',
    '#14b8a6','#0891b2','#3b82f6','#1d4ed8','#6366f1','#7c3aed','#8b5cf6',
    '#a855f7','#ec4899','#db2777','#be185d','#9f1239'
  ];
  var HIGHLIGHT_COLORS = [
    '#fde68a','#fef08a','#bbf7d0','#bfdbfe','#ddd6fe','#fecaca','#fed7aa',
    '#e9d5ff','#99f6e4','#a7f3d0','#fce7f3','#f5f3ff','#eff6ff','transparent'
  ];
  var CELL_COLORS = [
    '#ffffff','#f1f5f9','#fef3c7','#dbeafe','#dcfce7','#fce7f3','#ede9fe',
    '#fee2e2','#ffedd5','#ecfdf5','#f0f9ff','#fdf4ff','#fff7ed','#f7fee7',
    '#1e293b','#374151','#1d4ed8','#15803d','#9f1239','#6d28d9'
  ];

  /* ── Init ───────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    document.execCommand('defaultParagraphSeparator', false, 'p');
    document.execCommand('styleWithCSS', false, true);
    wpRenderPages();
    wpBuildColorPalettes();
    wpBuildTablePicker();
    wpBuildTemplates();
    wpRenderHistory();
    wpSetupKeyboardShortcuts();
    wpSetupContextMenu();
    wpSetupImageDrop();
    wpUpdateStats();
    /* ── Import study content sent from study.html ── */
    (function() {
      try {
        var raw = localStorage.getItem('aqs_wdoc_import');
        if (!raw) return;
        var imp = JSON.parse(raw);
        if (!imp || !imp.html || (Date.now() - imp.ts) > 120000) return; /* ignore if older than 2 min */
        localStorage.removeItem('aqs_wdoc_import');
        /* Split imported HTML into pages by heading boundaries */
        var parser = new DOMParser();
        var doc2   = parser.parseFromString(imp.html, 'text/html');
        /* Chunk into rough page-sized pieces (~2500 chars each) */
        var chunks = [], curChunk = '';
        Array.from(doc2.body.childNodes).forEach(function(node) {
          var piece = node.outerHTML || (node.textContent ? '<p>' + node.textContent + '</p>' : '');
          if (!piece.trim()) return;
          if (curChunk.length + piece.length > 2500 && curChunk) {
            chunks.push(curChunk); curChunk = piece;
          } else { curChunk += piece; }
        });
        if (curChunk) chunks.push(curChunk);
        if (!chunks.length) return;
        wpPages = chunks;
        wpCurrentPage = 0;
        wpRenderPages();
        wpUpdateStats();
        wpSetStatus('📚 Study content imported from AI Study ✅');
      } catch(e) { /* silently ignore import errors */ }
    })();
    wpSetStatus('Word Processor ready — v3.4');
    wpAdjustHeaderOffset();
    wpSetupDocSettingsListeners();
  });

  /* ── Live-apply Document Style on any setting change ─────────── */
  function wpSetupDocSettingsListeners() {
    var ids = [
      'wp-ds-font','wp-ds-size','wp-ds-lspace','wp-ds-pspace',
      'wp-ds-margin','wp-ds-page','wp-ds-divider',
      'dsm-font','dsm-size','dsm-h1','dsm-h2','dsm-h3',
      'dsm-h4','dsm-h5','dsm-h6','dsm-lspace','dsm-pspace',
      'dsm-margin','dsm-page'
    ];
    ids.forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', function() {
        wpApplyDocSettings(wpGetDocSettings());
      });
    });
    /* Also handle the dsm-divider checkbox if present */
    var dsmDiv = document.getElementById('dsm-divider');
    if (dsmDiv) dsmDiv.addEventListener('change', function() { wpApplyDocSettings(wpGetDocSettings()); });
  }

  /* ── Dynamic header height offset ──────────────────────────── */
  function wpAdjustHeaderOffset() {
    var appbar = document.querySelector('.wp-appbar');
    var ribbon  = document.getElementById('wp-ribbon');
    if (!appbar || !ribbon) return;
    var h = appbar.getBoundingClientRect().height + ribbon.getBoundingClientRect().height;
    h = Math.ceil(h) + 1; // +1 to avoid sub-pixel gap
    document.documentElement.style.setProperty('--wp-header-h', h + 'px');
    var sidebar = document.getElementById('wp-sidebar');
    if (window.innerWidth > 768) {
      if (sidebar) { sidebar.style.top = h + 'px'; sidebar.style.height = 'calc(100vh - ' + h + 'px)'; }
    }
    var layout = document.querySelector('.wp-layout');
    if (layout) layout.style.marginTop = h + 'px';
  }
  window.addEventListener('resize', function() { setTimeout(wpAdjustHeaderOffset, 100); });

  /* ── Active editor ─────────────────────────────────────────── */
  function wpGetEditor() {
    return document.getElementById(wpCurrentPage === 0 ? 'wp-editor-0' : 'wp-editor-' + wpCurrentPage)
           || document.querySelector('.wp-page-editor');
  }

  /* ── Mode selection ─────────────────────────────────────────── */
  window.wpChooseMode = function (mode) {
    sessionStorage.setItem('wp_mode_chosen', '1');
    var overlay = document.getElementById('wp-mode-overlay');
    if (overlay) { overlay.classList.add('hidden'); overlay.style.display = 'none'; }
    if (mode === 'format') { wpSwitchTab('format'); focusSource(); }
    else if (mode === 'write') { wpSwitchTab('write'); var p = document.getElementById('wp-prompt'); if(p) p.focus(); }
    else if (mode === 'blank') { /* already ready */ }
    else if (mode === 'template') { wpSwitchTab('template'); }
    else if (mode === 'upload') { wpSwitchTab('format'); document.getElementById('wp-file-input').click(); }
  };
  function focusSource() { setTimeout(function(){ var el = document.getElementById('wp-source'); if(el) el.focus(); }, 100); }

  /* ── Color palettes ─────────────────────────────────────────── */
  function wpBuildColorPalettes() {
    buildPalette('wp-txtcol-palette', TEXT_COLORS, function(c) { wpApplyTextColor(c); });
    buildPalette('wp-hlcol-palette', HIGHLIGHT_COLORS, function(c) { wpApplyHighlight(c); });
    buildPalette('wp-cell-color-palette', CELL_COLORS, function(c) { wpApplyCellBg(c); });
  }
  function buildPalette(containerId, colors, handler) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    colors.forEach(function(c) {
      var sw = document.createElement('div');
      sw.className = 'wp-color-swatch';
      sw.style.background = c === 'transparent' ? 'repeating-conic-gradient(#ccc 0% 25%,#fff 0% 50%) 0 0/10px 10px' : c;
      if (c === '#ffffff' || c === 'transparent') sw.style.border = '1.5px solid #d1d5db';
      sw.title = c;
      sw.onclick = function() { handler(c); };
      el.appendChild(sw);
    });
  }

  /* ── Apply text / highlight colors ─────────────────────────── */
  window.wpApplyTextColor = function(color) {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('foreColor', false, color);
    var sw = document.getElementById('wp-txtcol-swatch'); if(sw) sw.style.background = color;
    var menu = document.getElementById('wp-txtcol-dd-menu'); if(menu) menu.classList.remove('open');
    wpFocusEditor();
  };
  window.wpApplyHighlight = function(color) {
    document.execCommand('styleWithCSS', false, true);
    if (color === 'transparent') {
      document.execCommand('hiliteColor', false, 'transparent');
    } else {
      document.execCommand('hiliteColor', false, color);
    }
    var sw = document.getElementById('wp-hlcol-swatch'); if(sw) sw.style.background = color === 'transparent' ? '#fff' : color;
    var menu = document.getElementById('wp-hlcol-dd-menu'); if(menu) menu.classList.remove('open');
    wpFocusEditor();
  };

  /* ── Apply cell background ──────────────────────────────────── */
  window.wpApplyCellBg = function(color) {
    if (wpCtxCell) {
      wpCtxCell.style.backgroundColor = color || '';
      wpSavePageState();
    }
    wpHideModal('wp-cell-color-modal');
    wpHideCtxMenu();
  };
  window.wpShowCellColorPicker = function() {
    wpHideCtxMenu();
    wpShowModal('wp-cell-color-modal');
  };

  /* ── Table picker ───────────────────────────────────────────── */
  function wpBuildTablePicker() {
    var grid = document.getElementById('wp-tbl-grid');
    var lbl  = document.getElementById('wp-tbl-lbl');
    if (!grid) return;
    grid.innerHTML = '';
    for (var r = 1; r <= 8; r++) {
      for (var c = 1; c <= 8; c++) {
        (function(row, col) {
          var cell = document.createElement('div');
          cell.className = 'wp-tbl-cell';
          cell.dataset.row = row; cell.dataset.col = col;
          cell.addEventListener('mouseover', function() {
            if (lbl) lbl.textContent = row + ' × ' + col + ' table';
            grid.querySelectorAll('.wp-tbl-cell').forEach(function(cl) {
              cl.classList.toggle('hi', parseInt(cl.dataset.row) <= row && parseInt(cl.dataset.col) <= col);
            });
          });
          cell.addEventListener('click', function() {
            wpInsertTable(row, col);
            var picker = document.getElementById('wp-tbl-picker'); if(picker) picker.classList.remove('open');
          });
          grid.appendChild(cell);
        })(r, c);
      }
    }
  }

  /* ── Insert table ───────────────────────────────────────────── */
  window.wpInsertTable = function(rows, cols) {
    rows = Math.max(1, Math.min(rows || 3, 30));
    cols = Math.max(1, Math.min(cols || 3, 15));
    var picker = document.getElementById('wp-tbl-picker'); if(picker) picker.classList.remove('open');
    var ed = wpGetEditor(); if (!ed) return;
    ed.focus();

    var html = '<table style="border-collapse:collapse;width:100%;table-layout:fixed;margin:.6em 0;">';
    html += '<thead><tr>';
    for (var c = 0; c < cols; c++) {
      html += '<th contenteditable="true" style="border:1px solid #d1d5db;padding:6px 10px;background:#f1f5f9;font-weight:700;min-width:60px;">Col ' + (c + 1) + '</th>';
    }
    html += '</tr></thead><tbody>';
    for (var rr = 0; rr < rows - 1; rr++) {
      html += '<tr>';
      for (var cc = 0; cc < cols; cc++) {
        html += '<td contenteditable="true" style="border:1px solid #d1d5db;padding:6px 10px;min-width:60px;">&nbsp;</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table><p><br></p>';

    var sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      var range = sel.getRangeAt(0);
      var tmp = document.createElement('div');
      tmp.innerHTML = html;
      var frag = document.createDocumentFragment();
      while (tmp.firstChild) frag.appendChild(tmp.firstChild);
      range.collapse(false);
      range.insertNode(frag);
      range.collapse(false);
      sel.removeAllRanges(); sel.addRange(range);
    } else {
      document.execCommand('insertHTML', false, html);
    }
    wpAddColResizeHandles(ed);
    wpUpdateStats();
    wpSavePageState();
  };

  /* ── Column resize handles ──────────────────────────────────── */
  function wpAddColResizeHandles(ed) {
    if (!ed) return;
    ed.querySelectorAll('td, th').forEach(function(cell) {
      if (cell.querySelector('.col-resize-handle')) return;
      var handle = document.createElement('div');
      handle.className = 'col-resize-handle';
      handle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        var startX = e.clientX, startW = cell.offsetWidth;
        handle.classList.add('dragging');
        function onMove(ev) { cell.style.width = Math.max(40, startW + ev.clientX - startX) + 'px'; }
        function onUp() {
          handle.classList.remove('dragging');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          wpSavePageState();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      cell.appendChild(handle);
    });
  }

  /* ── Context menu for tables ────────────────────────────────── */
  function wpSetupContextMenu() {
    document.addEventListener('contextmenu', function(e) {
      var cell = e.target.closest ? e.target.closest('td, th') : null;
      if (!cell) { wpHideCtxMenu(); return; }
      var ed = cell.closest ? cell.closest('.wp-page-editor') : null;
      if (!ed) { wpHideCtxMenu(); return; }
      e.preventDefault();
      wpCtxCell  = cell;
      wpCtxTable = cell.closest('table');
      var menu = document.getElementById('wp-ctx-menu');
      if (!menu) return;
      menu.style.left = e.clientX + 'px';
      menu.style.top  = (e.clientY + 2) + 'px';
      menu.classList.add('open');
    });
    document.addEventListener('click', function() { wpHideCtxMenu(); });
  }
  function wpHideCtxMenu() {
    var m = document.getElementById('wp-ctx-menu'); if(m) m.classList.remove('open');
  }

  /* ── Table commands ─────────────────────────────────────────── */
  window.wpTableCmd = function(cmd) {
    wpHideCtxMenu();
    if (!wpCtxCell || !wpCtxTable) return;
    var cell = wpCtxCell, tbl = wpCtxTable;
    var row  = cell.parentNode;
    var tbody = tbl.querySelector('tbody') || tbl;
    var rows  = Array.from(tbl.querySelectorAll('tr'));
    var cells = Array.from(row.children);
    var colIdx = cells.indexOf(cell);

    if (cmd === 'insertRowAbove') {
      var newRow = row.cloneNode(false);
      cells.forEach(function() { var td = document.createElement('td'); td.contentEditable = 'true'; td.style.cssText = 'border:1px solid #d1d5db;padding:6px 10px;min-width:60px;'; td.innerHTML = '&nbsp;'; newRow.appendChild(td); });
      row.parentNode.insertBefore(newRow, row);
    } else if (cmd === 'insertRowBelow') {
      var newRow2 = row.cloneNode(false);
      cells.forEach(function() { var td = document.createElement('td'); td.contentEditable = 'true'; td.style.cssText = 'border:1px solid #d1d5db;padding:6px 10px;min-width:60px;'; td.innerHTML = '&nbsp;'; newRow2.appendChild(td); });
      if (row.nextSibling) row.parentNode.insertBefore(newRow2, row.nextSibling);
      else row.parentNode.appendChild(newRow2);
    } else if (cmd === 'insertColLeft') {
      rows.forEach(function(tr, ri) {
        var nc = document.createElement(ri === 0 && tbl.querySelector('thead') ? 'th' : 'td');
        nc.contentEditable = 'true'; nc.style.cssText = 'border:1px solid #d1d5db;padding:6px 10px;min-width:60px;'; nc.innerHTML = '&nbsp;';
        var c = tr.children[colIdx]; if(c) tr.insertBefore(nc, c); else tr.appendChild(nc);
      });
    } else if (cmd === 'insertColRight') {
      rows.forEach(function(tr, ri) {
        var nc = document.createElement(ri === 0 && tbl.querySelector('thead') ? 'th' : 'td');
        nc.contentEditable = 'true'; nc.style.cssText = 'border:1px solid #d1d5db;padding:6px 10px;min-width:60px;'; nc.innerHTML = '&nbsp;';
        var c = tr.children[colIdx + 1]; if(c) tr.insertBefore(nc, c); else tr.appendChild(nc);
      });
    } else if (cmd === 'deleteRow') {
      if (rows.length <= 1) { tbl.remove(); } else { row.remove(); }
    } else if (cmd === 'deleteCol') {
      rows.forEach(function(tr) { var c = tr.children[colIdx]; if(c) c.remove(); });
      var allRows = tbl.querySelectorAll('tr');
      allRows.forEach(function(tr){ if(tr.children.length === 0) tr.remove(); });
    } else if (cmd === 'deleteTable') {
      if (confirm('Delete this table?')) tbl.remove();
    } else if (cmd === 'sortAZ') { wpSortColumn(tbl, colIdx, true); }
    else if (cmd === 'sortZA')  { wpSortColumn(tbl, colIdx, false); }
    else if (cmd === 'mergeCells') { wpMergeCells(tbl); }
    else if (cmd === 'sumCol') { wpSumColumn(tbl, colIdx, cell); }

    wpAddColResizeHandles(tbl.closest('.wp-page-editor'));
    wpSavePageState();
    wpUpdateStats();
  };

  function wpSortColumn(tbl, colIdx, asc) {
    var tbody = tbl.querySelector('tbody') || tbl;
    var rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort(function(a, b) {
      var av = (a.cells[colIdx] ? a.cells[colIdx].textContent.trim() : '');
      var bv = (b.cells[colIdx] ? b.cells[colIdx].textContent.trim() : '');
      var an = parseFloat(av), bn = parseFloat(bv);
      if (!isNaN(an) && !isNaN(bn)) return asc ? an - bn : bn - an;
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    rows.forEach(function(r) { tbody.appendChild(r); });
  }

  function wpSumColumn(tbl, colIdx, targetCell) {
    var tbody = tbl.querySelector('tbody') || tbl;
    var rows = Array.from(tbody.querySelectorAll('tr'));
    var sum = 0;
    rows.forEach(function(r) {
      var c = r.cells[colIdx]; if (!c) return;
      var v = parseFloat(c.textContent.trim()); if (!isNaN(v)) sum += v;
    });
    var sumRow = document.createElement('tr');
    for (var i = 0; i < (rows[0] ? rows[0].cells.length : 1); i++) {
      var td = document.createElement('td');
      td.contentEditable = 'true';
      td.style.cssText = 'border:1px solid #d1d5db;padding:6px 10px;font-weight:700;background:#f0f9ff;';
      td.textContent = i === colIdx ? 'Σ ' + sum.toLocaleString() : '';
      sumRow.appendChild(td);
    }
    tbody.appendChild(sumRow);
  }

  function wpMergeCells(tbl) {
    var selectedCells = tbl.querySelectorAll('[data-sel]');
    if (selectedCells.length < 2) { alert('Select cells to merge first (hold Shift and click cells).'); return; }
    var firstCell = selectedCells[0];
    var combinedText = Array.from(selectedCells).map(function(c){ return c.textContent.trim(); }).filter(Boolean).join(' ');
    firstCell.setAttribute('colspan', selectedCells.length);
    firstCell.textContent = combinedText;
    for (var i = 1; i < selectedCells.length; i++) { selectedCells[i].remove(); }
    tbl.querySelectorAll('[data-sel]').forEach(function(c){ c.removeAttribute('data-sel'); });
  }

  /* ── Image insert & resize ──────────────────────────────────── */
  window.wpInsertImageFromFile = function(input) {
    var file = input.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      wpInsertImageSrc(e.target.result, file.name);
    };
    reader.readAsDataURL(file);
    input.value = '';
  };

  function wpInsertImageSrc(src, name) {
    var ed = wpGetEditor(); if (!ed) return;
    ed.focus();
    var html = '<div class="wp-img-wrap align-center" contenteditable="false" style="max-width:100%;display:block;margin:.5em auto;">' +
      '<img src="' + src + '" alt="' + (name || 'image') + '" style="max-width:100%;height:auto;display:block;" draggable="true">' +
      '<div class="wp-img-resize-handle" title="Drag to resize"></div>' +
      '<div class="wp-img-caption" contenteditable="true" style="font-size:10px;color:#6b7280;text-align:center;font-style:italic;outline:none;" data-placeholder="Add caption…"></div>' +
    '</div><p><br></p>';
    document.execCommand('insertHTML', false, html);
    wpSetupImageHandlers(ed);
    wpUpdateStats();
    wpSavePageState();
  }

  function wpSetupImageHandlers(ed) {
    if (!ed) return;
    ed.querySelectorAll('.wp-img-wrap').forEach(function(wrap) {
      if (wrap._wpSetup) return;
      wrap._wpSetup = true;
      var img = wrap.querySelector('img');
      var handle = wrap.querySelector('.wp-img-resize-handle');
      if (!img) return;

      img.addEventListener('click', function(e) {
        e.stopPropagation();
        ed.querySelectorAll('.wp-img-wrap').forEach(function(w){ w.classList.remove('selected'); });
        ed.querySelectorAll('img').forEach(function(i){ i.classList.remove('wp-img-selected'); });
        wrap.classList.add('selected');
        img.classList.add('wp-img-selected');
        // Show image toolbar
        wpShowImageToolbar(wrap, img);
      });

      if (handle) {
        handle.addEventListener('mousedown', function(e) {
          e.preventDefault();
          var startX = e.clientX, startW = img.offsetWidth;
          function onMove(ev) {
            var w = Math.max(40, startW + ev.clientX - startX);
            img.style.width = w + 'px'; img.style.height = 'auto';
          }
          function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            wpSavePageState();
          }
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      }
    });
  }

  function wpShowImageToolbar(wrap, img) {
    var old = document.getElementById('wp-img-toolbar');
    if (old) old.remove();
    var bar = document.createElement('div');
    bar.id = 'wp-img-toolbar';
    bar.style.cssText = 'position:fixed;z-index:650;background:#1e293b;border-radius:8px;padding:5px 8px;display:flex;gap:5px;align-items:center;box-shadow:0 4px 20px rgba(0,0,0,.3);';
    var rect = img.getBoundingClientRect();
    bar.style.top = (rect.top - 48) + 'px';
    bar.style.left = rect.left + 'px';

    function makeBtn(label, fn) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'background:none;border:none;color:#e2e8f0;cursor:pointer;padding:3px 8px;border-radius:4px;font-size:11.5px;font-weight:600;';
      b.onmouseenter = function(){ b.style.background='rgba(255,255,255,.15)'; };
      b.onmouseleave = function(){ b.style.background='none'; };
      b.onclick = fn;
      bar.appendChild(b);
    }
    makeBtn('◀ Left',  function(){ wrap.classList.remove('align-center','align-right'); wrap.classList.add('align-left'); wrap.style.float='left'; wrap.style.marginRight='12px'; wrap.style.display='inline-block'; wpSavePageState(); });
    makeBtn('⬛ Center', function(){ wrap.classList.remove('align-left','align-right'); wrap.classList.add('align-center'); wrap.style.float='none'; wrap.style.margin='.5em auto'; wrap.style.display='block'; wpSavePageState(); });
    makeBtn('Right ▶', function(){ wrap.classList.remove('align-left','align-center'); wrap.classList.add('align-right'); wrap.style.float='right'; wrap.style.marginLeft='12px'; wrap.style.display='inline-block'; wpSavePageState(); });
    var sep = document.createElement('span'); sep.style.cssText='width:1px;height:18px;background:rgba(255,255,255,.2);display:inline-block;'; bar.appendChild(sep);
    makeBtn('🗑 Remove', function(){ wrap.remove(); bar.remove(); wpUpdateStats(); wpSavePageState(); });
    makeBtn('✕', function(){ bar.remove(); img.classList.remove('wp-img-selected'); wrap.classList.remove('selected'); });
    document.body.appendChild(bar);
    setTimeout(function(){ document.addEventListener('click', function handler(e){ if (!bar.contains(e.target) && e.target !== img){ bar.remove(); img.classList.remove('wp-img-selected'); wrap.classList.remove('selected'); document.removeEventListener('click', handler); } }); }, 0);
  }

  /* ── Image drag-drop into editor ─────────────────────────────  */
  function wpSetupImageDrop() {
    document.addEventListener('drop', function(e) {
      var ed = e.target.closest ? e.target.closest('.wp-page-editor') : null;
      if (!ed) return;
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      for (var i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) {
          e.preventDefault();
          var reader = new FileReader();
          (function(file){ reader.onload = function(ev){ wpInsertImageSrc(ev.target.result, file.name); }; reader.readAsDataURL(file); })(files[i]);
        }
      }
    });
  }

  /* ── Chart engine ───────────────────────────────────────────── */
  window.wpSelectChartType = function(type, btn) {
    wpChartType = type;
    document.querySelectorAll('.wp-chart-type-btn').forEach(function(b){ b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
  };

  window.wpShowChartModal = function() {
    var ed = wpGetEditor(); if (!ed) return;
    var tbl = ed.querySelector('table');
    if (tbl) {
      var csv = wpTableToCSV(tbl);
      var dataEl = document.getElementById('wp-chart-data'); if(dataEl) dataEl.value = csv;
    }
    wpShowModal('wp-chart-modal');
    setTimeout(wpPreviewChart, 100);
  };

  function wpTableToCSV(tbl) {
    var rows = Array.from(tbl.querySelectorAll('tr'));
    return rows.map(function(r){ return Array.from(r.querySelectorAll('td,th')).map(function(c){ return '"'+c.textContent.trim().replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
  }

  window.wpPreviewChart = function() {
    var dataEl = document.getElementById('wp-chart-data');
    var titleEl = document.getElementById('wp-chart-title');
    var canvas = document.getElementById('wp-chart-canvas');
    if (!dataEl || !canvas) return;
    var csv = dataEl.value.trim();
    if (!csv) return;
    var lines = csv.split('\n').map(function(l){ return l.split(',').map(function(v){ return v.trim().replace(/^"|"$/g,''); }); });
    if (lines.length < 2) return;
    var headers = lines[0];
    var labels = lines.slice(1).map(function(l){ return l[0] || ''; });
    var datasets = [];
    var COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899','#8b5cf6','#f97316'];
    for (var di = 1; di < headers.length; di++) {
      var dvals = lines.slice(1).map(function(l){ return parseFloat(l[di]) || 0; });
      datasets.push({
        label: headers[di] || ('Series ' + di),
        data: dvals,
        backgroundColor: wpChartType === 'pie' || wpChartType === 'doughnut' || wpChartType === 'polarArea'
          ? COLORS.slice(0, labels.length) : COLORS[(di - 1) % COLORS.length] + 'cc',
        borderColor: wpChartType === 'line' ? COLORS[(di - 1) % COLORS.length] : undefined,
        borderWidth: 2,
        fill: false
      });
    }
    if (wpChartInstance) { wpChartInstance.destroy(); wpChartInstance = null; }
    try {
      wpChartInstance = new Chart(canvas, {
        type: wpChartType,
        data: { labels: labels, datasets: datasets },
        options: {
          responsive: true, maintainAspectRatio: true,
          plugins: {
            title: { display: !!(titleEl && titleEl.value), text: titleEl ? titleEl.value : '' },
            legend: { display: datasets.length > 1 || wpChartType === 'pie' || wpChartType === 'doughnut' }
          }
        }
      });
    } catch(e) { console.error('Chart error:', e); }
  };

  window.wpInsertChart = function() {
    var canvas = document.getElementById('wp-chart-canvas');
    if (!canvas || !wpChartInstance) { alert('Please preview the chart first.'); return; }
    var dataUrl = canvas.toDataURL('image/png', 0.92);
    var titleEl = document.getElementById('wp-chart-title');
    var title = titleEl ? titleEl.value : 'Chart';
    wpHideModal('wp-chart-modal');
    wpInsertImageSrc(dataUrl, title || 'chart.png');
    wpSetStatus('Chart inserted into document');
  };

  /* ── Analyze table data ─────────────────────────────────────── */
  window.wpAnalyzeTable = function() {
    var ed = wpGetEditor();
    if (!ed) return;
    var tbl = ed.querySelector('table');
    if (!tbl) { alert('No table found. Insert a table with data first, then click Analyze Data.'); return; }
    var csv = wpTableToCSV(tbl);
    var dataEl = document.getElementById('wp-chart-data'); if(dataEl) dataEl.value = csv;
    wpShowModal('wp-chart-modal');
    setTimeout(wpPreviewChart, 150);
    wpSetStatus('Table data loaded — choose chart type and insert');
  };

  /* ── Toolbar: execCommand wrappers ──────────────────────────── */
  window.wpFmt = function(cmd) {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(cmd, false, null);
    wpFocusEditor();
    wpUpdateToolbarState();
    wpSavePageState();
  };

  window.wpBlock = function(tag) {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('formatBlock', false, '<' + tag + '>');
    wpFocusEditor();
    wpSavePageState();
  };

  window.wpFont = function(family) {
    if (!family) return;
    wrapInlineStyle({ fontFamily: family });
    var sel = document.getElementById('tb-font'); if(sel) sel.value = '';
    wpFocusEditor();
    wpSavePageState();
  };

  window.wpSize = function(pt) {
    if (!pt) return;
    wrapInlineStyle({ fontSize: pt + 'pt' });
    wpFocusEditor();
    wpSavePageState();
  };

  window.wpSetLineSpacing = function(lh) {
    var ed = wpGetEditor(); if (!ed) return;
    var sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      // Apply to selected paragraphs
      var range = sel.getRangeAt(0);
      var ancestor = range.commonAncestorContainer;
      if (ancestor.nodeType === 3) ancestor = ancestor.parentNode;
      ancestor.style.lineHeight = lh;
    } else {
      ed.style.lineHeight = lh;
    }
    var wpl = document.getElementById('wp-lh'); if(wpl) wpl.value = lh;
    wpSavePageState();
    var menu = document.getElementById('wp-lspace-dd-menu'); if(menu) menu.classList.remove('open');
  };

  function wrapInlineStyle(styles) {
    var sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      var range = sel.getRangeAt(0);
      var span  = document.createElement('span');
      Object.assign(span.style, styles);
      try { range.surroundContents(span); }
      catch (e) {
        var frag = range.extractContents();
        span.appendChild(frag); range.insertNode(span);
      }
      sel.removeAllRanges();
      var nr = document.createRange(); nr.selectNodeContents(span); sel.addRange(nr);
    } else {
      /* No selection — apply to entire editor (useful on mobile) */
      var ed = wpGetEditor();
      if (!ed) return;
      if (styles.fontFamily) ed.style.fontFamily = styles.fontFamily;
      if (styles.fontSize)   ed.style.fontSize   = styles.fontSize;
      if (styles.lineHeight) ed.style.lineHeight  = styles.lineHeight;
      /* Also stamp on existing paragraphs so content inherits */
      ed.querySelectorAll('p,li,td,th,h1,h2,h3,h4,h5,h6').forEach(function(el) {
        if (styles.fontFamily) el.style.fontFamily = styles.fontFamily;
        if (styles.fontSize)   el.style.fontSize   = styles.fontSize;
        if (styles.lineHeight) el.style.lineHeight  = styles.lineHeight;
      });
    }
  }

  /* ── Insert helpers ─────────────────────────────────────────── */
  window.wpInsertHR = function() {
    document.execCommand('insertHTML', false, '<hr style="border:none;border-top:2px solid #e2e8f0;margin:1em 0;"><p><br></p>');
    wpFocusEditor(); wpSavePageState();
  };

  window.wpInsertPageBreak = function() {
    wpAddPage();
  };

  window.wpInsertChar = function(ch) {
    document.execCommand('insertText', false, ch);
    wpFocusEditor();
    var menu = document.getElementById('wp-special-dd-menu'); if(menu) menu.classList.remove('open');
  };

  /* ── Link ───────────────────────────────────────────────────── */
  window.wpShowLinkModal = function() {
    wpSavedSelection = wpSaveSelectionRange();
    var sel = window.getSelection();
    var lt = document.getElementById('wp-link-text');
    if (sel && !sel.isCollapsed) { if(lt) lt.value = sel.toString(); }
    else { if(lt) lt.value = ''; }
    wpShowModal('wp-link-modal');
    setTimeout(function(){ var el = document.getElementById('wp-link-url'); if(el) el.focus(); }, 100);
  };

  window.wpInsertLink = function() {
    var url  = (document.getElementById('wp-link-url')  || {}).value || '';
    var text = (document.getElementById('wp-link-text') || {}).value || '';
    var target = (document.getElementById('wp-link-target') || {}).value || '_blank';
    if (!url || url === 'https://') { alert('Please enter a URL.'); return; }
    wpHideModal('wp-link-modal');
    if (wpSavedSelection) wpRestoreSelectionRange(wpSavedSelection);
    wpFocusEditor();
    var display = text || url;
    document.execCommand('insertHTML', false, '<a href="' + url + '" target="' + target + '" style="color:#4f46e5;text-decoration:underline;">' + escHtml(display) + '</a>');
    wpSavePageState();
  };

  function wpSaveSelectionRange() {
    var sel = window.getSelection();
    if (sel && sel.rangeCount > 0) return sel.getRangeAt(0).cloneRange();
    return null;
  }
  function wpRestoreSelectionRange(range) {
    var sel = window.getSelection();
    if (!sel || !range) return;
    sel.removeAllRanges(); sel.addRange(range);
  }

  /* ── Paper / style ──────────────────────────────────────────── */
  window.wpSetPaper = function(v) {
    v = (v || 'a4').toLowerCase();
    document.querySelectorAll('.wp-page-item').forEach(function(pg) {
      pg.className = 'wp-page wp-page-item sz-' + v;
    });
    /* Sync toolbar select (lowercase) */
    var tbSel = document.getElementById('tb-paper'); if(tbSel) tbSel.value = v;
    /* Sync sidebar + modal selects (Title Case: A4, Letter, Legal) */
    var tc = v === 'a4' ? 'A4' : (v.charAt(0).toUpperCase() + v.slice(1));
    var ds1 = document.getElementById('wp-ds-page'); if(ds1) ds1.value = tc;
    var ds2 = document.getElementById('dsm-page');   if(ds2) ds2.value = tc;
  };

  window.wpApplyStyle = function() {
    var hf  = getV('wp-hfont',  'Georgia, serif');
    var bf  = getV('wp-bfont',  'Georgia, serif');
    var h1  = parseFloat(getV('wp-h1',  24));
    var h2  = parseFloat(getV('wp-h2',  18));
    var h3  = parseFloat(getV('wp-h3',  14));
    var bd  = parseFloat(getV('wp-body', 12));
    var mg  = getV('wp-margin', 20);
    var lh  = getV('wp-lh',  '1.6');
    var h4pt = Math.round(bd * 1.1);
    document.querySelectorAll('.wp-page-item').forEach(function(pg) {
      /* CSS custom props (cascade fallback) */
      pg.style.setProperty('--wp-hfont', hf);
      pg.style.setProperty('--wp-bfont', bf);
      pg.style.setProperty('--wp-h1',    h1 + 'pt');
      pg.style.setProperty('--wp-h2',    h2 + 'pt');
      pg.style.setProperty('--wp-h3',    h3 + 'pt');
      pg.style.setProperty('--wp-h4',    h4pt + 'pt');
      pg.style.setProperty('--wp-bsize', bd + 'pt');
      pg.style.setProperty('--wp-lh',    lh);
      pg.style.padding = mg + 'mm';
      /* Also stamp inline styles directly so AI-generated inline styles are overridden */
      var ed = pg.querySelector('.wp-page-editor');
      if (!ed) return;
      ed.style.fontFamily = bf;
      ed.style.fontSize   = bd + 'pt';
      ed.style.lineHeight = lh;
      ed.querySelectorAll('p, li, td, th').forEach(function(el) {
        el.style.fontFamily = bf;
        el.style.fontSize   = bd + 'pt';
        el.style.lineHeight = lh;
      });
      ed.querySelectorAll('h1').forEach(function(el){ el.style.fontSize = h1 + 'pt'; el.style.fontFamily = hf; });
      ed.querySelectorAll('h2').forEach(function(el){ el.style.fontSize = h2 + 'pt'; el.style.fontFamily = hf; });
      ed.querySelectorAll('h3').forEach(function(el){ el.style.fontSize = h3 + 'pt'; el.style.fontFamily = hf; });
      ed.querySelectorAll('h4,h5,h6').forEach(function(el){ el.style.fontSize = h4pt + 'pt'; el.style.fontFamily = hf; });
    });
    var tbm = document.getElementById('tb-margin'); if(tbm) tbm.value = mg;
    wpSavePageState();
  };

  function getV(id, def) {
    var el = document.getElementById(id); if (!el) return def;
    return el.value || def;
  }

  /* ── Zoom ───────────────────────────────────────────────────── */
  window.wpSetZoom = function(z) {
    wpZoom = parseFloat(z) || 1;
    var area = document.getElementById('wp-pages');
    if (area) { area.style.transformOrigin = 'top center'; }
    document.querySelectorAll('.wp-page-item').forEach(function(pg) {
      pg.style.transform = 'scale(' + wpZoom + ')';
      pg.style.transformOrigin = 'top center';
      pg.style.marginBottom = ((wpZoom - 1) * pg.offsetHeight / 2) + 'px';
    });
    var sel1 = document.getElementById('tb-zoom'); if(sel1) sel1.value = z;
    var sel2 = document.getElementById('wp-zoom-sel'); if(sel2) sel2.value = z;
    wpSetStatus('Zoom: ' + Math.round(wpZoom * 100) + '%');
  };

  /* ── Toolbar state ──────────────────────────────────────────── */
  window.wpUpdateToolbarState = function() {
    function setOn(id, on) { var b = document.getElementById(id); if(b) b.classList.toggle('on', on); }
    setOn('tb-bold',   document.queryCommandState('bold'));
    setOn('tb-italic', document.queryCommandState('italic'));
    setOn('tb-under',  document.queryCommandState('underline'));
    setOn('tb-strike', document.queryCommandState('strikeThrough'));
  };

  /* ── Keyboard shortcuts ──────────────────────────────────────── */
  function wpSetupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
      var ed = document.activeElement ? document.activeElement.closest('.wp-page-editor') : null;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b') { e.preventDefault(); wpFmt('bold'); }
        if (e.key === 'i') { e.preventDefault(); wpFmt('italic'); }
        if (e.key === 'u') { e.preventDefault(); wpFmt('underline'); }
        if (e.key === 'k') { e.preventDefault(); wpShowLinkModal(); }
        if (e.key === 'h') { e.preventDefault(); wpShowFindReplace(); }
        if (e.key === 'p') { e.preventDefault(); wpPrint(); }
        if (e.key === ']') { e.preventDefault(); wpFmt('indent'); }
        if (e.key === '[') { e.preventDefault(); wpFmt('outdent'); }
        if (e.key === 'z') { e.preventDefault(); wpFmt('undo'); }
        if ((e.key === 'y') || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); wpFmt('redo'); }
      }
      if (!ed) return;
      // Tab in table
      if (e.key === 'Tab') {
        e.preventDefault();
        var sel = window.getSelection();
        if (sel && sel.rangeCount) {
          var node = sel.getRangeAt(0).startContainer;
          var cell = node;
          while (cell && cell.nodeName !== 'TD' && cell.nodeName !== 'TH' && cell.nodeName !== 'TABLE' && cell !== ed) cell = cell.parentNode;
          if (cell && (cell.nodeName === 'TD' || cell.nodeName === 'TH')) {
            var allCells = Array.from(cell.closest('table').querySelectorAll('td,th'));
            var idx = allCells.indexOf(cell);
            var next = e.shiftKey ? allCells[idx - 1] : allCells[idx + 1];
            if (next) {
              next.focus();
              var r = document.createRange(); r.selectNodeContents(next); r.collapse(false);
              sel.removeAllRanges(); sel.addRange(r);
            } else if (!e.shiftKey) {
              var tbl2 = cell.closest('table');
              var cols = cell.closest('tr').cells.length;
              var newRow = tbl2.insertRow(-1);
              for (var ci = 0; ci < cols; ci++) {
                var td = newRow.insertCell(-1);
                td.setAttribute('contenteditable','true');
                td.style.cssText = 'border:1px solid #d1d5db;padding:6px 10px;min-width:60px;';
                td.innerHTML = '&nbsp;';
              }
              var firstNew = newRow.cells[0]; firstNew.focus();
              var nr2 = document.createRange(); nr2.selectNodeContents(firstNew); nr2.collapse(false);
              sel.removeAllRanges(); sel.addRange(nr2);
            }
            return;
          }
        }
        document.execCommand(e.shiftKey ? 'outdent' : 'indent', false, null);
      }
      wpUpdateToolbarState();
    });
  }

  /* ── Find & Replace ─────────────────────────────────────────── */
  window.wpShowFindReplace = function() {
    wpShowModal('wp-fnr-modal');
    setTimeout(function(){ var el = document.getElementById('wp-fnr-find'); if(el){ el.focus(); el.select(); } }, 100);
  };

  window.wpFindHighlight = function() {
    var query = (document.getElementById('wp-fnr-find') || {}).value || '';
    var ed = wpGetEditor();
    if (!ed) return;
    // Remove previous highlights
    ed.querySelectorAll('.wp-find-highlight').forEach(function(h){ h.outerHTML = h.innerHTML; });
    wpFindMatches = []; wpFindIndex = -1;
    var countEl = document.getElementById('wp-fnr-count');
    if (!query) { if(countEl) countEl.textContent = ''; return; }
    var caseSensitive = document.getElementById('wp-fnr-case') && document.getElementById('wp-fnr-case').checked;
    var wholeWord = document.getElementById('wp-fnr-whole') && document.getElementById('wp-fnr-whole').checked;
    var flags = caseSensitive ? 'g' : 'gi';
    var escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var pattern = wholeWord ? '\\b' + escapedQuery + '\\b' : escapedQuery;
    var regex = new RegExp(pattern, flags);

    function highlightIn(node) {
      if (node.nodeType === 3) {
        var text = node.textContent;
        var match;
        var matches = [];
        while ((match = regex.exec(text)) !== null) matches.push(match);
        if (!matches.length) return;
        var frag = document.createDocumentFragment();
        var lastIdx = 0;
        matches.forEach(function(m) {
          if (m.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
          var mark = document.createElement('mark');
          mark.className = 'wp-find-highlight';
          mark.textContent = m[0];
          frag.appendChild(mark);
          wpFindMatches.push(mark);
          lastIdx = m.index + m[0].length;
        });
        if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
        node.parentNode.replaceChild(frag, node);
      } else if (node.nodeType === 1 && !['SCRIPT','STYLE'].includes(node.tagName)) {
        Array.from(node.childNodes).forEach(highlightIn);
      }
    }
    highlightIn(ed);
    if (countEl) countEl.textContent = wpFindMatches.length + ' found';
    if (wpFindMatches.length > 0) { wpFindIndex = 0; wpScrollToMatch(0); }
  };

  function wpScrollToMatch(idx) {
    wpFindMatches.forEach(function(m){ m.classList.remove('current'); });
    if (wpFindMatches[idx]) {
      wpFindMatches[idx].classList.add('current');
      wpFindMatches[idx].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    var countEl = document.getElementById('wp-fnr-count');
    if (countEl) countEl.textContent = (idx + 1) + ' / ' + wpFindMatches.length;
  }

  window.wpFindNext = function() {
    if (!wpFindMatches.length) { wpFindHighlight(); return; }
    wpFindIndex = (wpFindIndex + 1) % wpFindMatches.length;
    wpScrollToMatch(wpFindIndex);
  };
  window.wpFindPrev = function() {
    if (!wpFindMatches.length) return;
    wpFindIndex = (wpFindIndex - 1 + wpFindMatches.length) % wpFindMatches.length;
    wpScrollToMatch(wpFindIndex);
  };

  window.wpReplace = function() {
    if (!wpFindMatches.length) return;
    var replaceText = (document.getElementById('wp-fnr-replace') || {}).value || '';
    var current = wpFindMatches[wpFindIndex];
    if (current) {
      current.outerHTML = escHtml(replaceText);
      wpFindMatches.splice(wpFindIndex, 1);
      if (wpFindIndex >= wpFindMatches.length) wpFindIndex = 0;
      if (wpFindMatches.length) wpScrollToMatch(wpFindIndex);
      wpSavePageState();
    }
  };

  window.wpReplaceAll = function() {
    if (!wpFindMatches.length) wpFindHighlight();
    var replaceText = (document.getElementById('wp-fnr-replace') || {}).value || '';
    var count = wpFindMatches.length;
    wpFindMatches.forEach(function(m){ m.outerHTML = escHtml(replaceText); });
    wpFindMatches = []; wpFindIndex = -1;
    wpSavePageState();
    var countEl = document.getElementById('wp-fnr-count');
    if (countEl) countEl.textContent = count + ' replaced';
    wpSetStatus(count + ' replacements made');
  };

  /* ── AI calls — Groq key pool ───────────────────────────────── */
  function callAI(prompt, maxTokens) {
    /* Safety caps — Groq/Mistral supports up to 8192 output tokens.
       Prompt capped at 10000 chars to avoid HTTP 413 on very large inputs.
       For AI Write, the prompt is mostly instructions so 10000 is safe. */
    var safeMax = Math.min(maxTokens || 2000, 8000);
    var wasTrimmed = prompt.length > 10000;
    var safePrompt = wasTrimmed ? prompt.slice(0, 10000) + '\n\n[Content trimmed to fit AI limit — split long documents into smaller sections for better results]' : prompt;
    if (wasTrimmed) wpShowTruncToast();
    var messages = [{ role: 'user', content: safePrompt }];
    wpSetAIStatus('working', 'AI is working…');
    /* Route through groqFetch (now Mistral-primary with key rotation) */
    if (typeof window.textdocsGroqFetch !== 'function') {
      wpSetAIStatus('error', 'AI not ready');
      return Promise.reject(new Error('AI not ready — no keys configured.'));
    }
    return window.textdocsGroqFetch(
      { messages: messages, max_tokens: safeMax, temperature: 0.3 }
    ).then(function(r) {
      if (!r.ok) { wpSetAIStatus('error', 'Something went wrong'); throw new Error('AI error: ' + r.status); }
      return r.json();
    }).then(function(d) {
      var t = (((d.choices || [])[0] || {}).message || {}).content || '';
      if (!t.trim()) { wpSetAIStatus('error', 'Empty response'); throw new Error('AI returned empty response.'); }
      wpSetAIStatus('ready', 'AI Ready');
      return t.trim();
    });
  }

  function wpSetAIStatus(state, msg) {
    var els = [
      { si: 'wp-ai-status-icon', st: 'wp-ai-status-text', el: document.getElementById('wp-ai-status') },
      { si: 'wp-ai-si', st: 'wp-ai-st', el: document.getElementById('wp-ai-status') }
    ];
    var icons = { ready: '✅', working: '⏱️', busy: '⚠️', error: '❌' };
    var icon = icons[state] || '✅';
    ['wp-ai-status-icon','wp-ai-si'].forEach(function(id){ var e = document.getElementById(id); if(e) e.textContent = icon; });
    ['wp-ai-status-text','wp-ai-st'].forEach(function(id){ var e = document.getElementById(id); if(e) e.textContent = msg; });
    var stat = document.getElementById('wp-ai-status');
    if (stat) stat.className = 'wp-ai-indicator ' + state;
  }

  /* ── Truncation toast — shown when AI prompt is auto-trimmed ─── */
  function wpShowTruncToast() {
    var old = document.getElementById('_wp-trunc-toast'); if (old) old.remove();
    var el = document.createElement('div'); el.id = '_wp-trunc-toast';
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;max-width:420px;width:calc(100% - 32px);background:#1e293b;border:1px solid #f59e0b;border-radius:14px;padding:14px 18px;box-shadow:0 12px 40px rgba(0,0,0,.6);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:flex-start;gap:12px;animation:_wpTruncIn .35s cubic-bezier(.22,1,.36,1) both;';
    el.innerHTML = '<style>@keyframes _wpTruncIn{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}</style>'
      + '<span style="font-size:1.25rem;flex-shrink:0;">✂️</span>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-weight:700;color:#fbbf24;font-size:.88rem;margin-bottom:3px;">Text was too long — trimmed automatically</div>'
      + '<div style="color:#94a3b8;font-size:.80rem;line-height:1.5;">Your content exceeded the AI limit and was trimmed to 8,000 characters. For best results, paste your document in smaller sections.</div>'
      + '</div>'
      + '<button onclick="document.getElementById(\'_wp-trunc-toast\').remove();" style="background:none;border:none;color:#475569;font-size:1rem;cursor:pointer;padding:0;flex-shrink:0;line-height:1;margin-top:1px;">✕</button>';
    document.body.appendChild(el);
    setTimeout(function(){ var t = document.getElementById('_wp-trunc-toast'); if(t) t.remove(); }, 7000);
  }

  /* ── Document Settings helpers ───────────────────────────────── */
  function wpGetDocSettings() {
    var getV2 = function(id, def) { var el = document.getElementById(id); return (el && el.value) ? el.value : def; };
    var chk   = function(id, def) { var el = document.getElementById(id); return el ? el.checked : def; };
    /* Heading sizes: prefer modal values (dsm-*), fallback to sidebar or defaults */
    return {
      font:    getV2('wp-ds-font',    'Times New Roman, Times, Georgia, serif'),
      size:    getV2('wp-ds-size',    '12pt'),
      lspace:  getV2('wp-ds-lspace', '1.15'),
      pspace:  getV2('wp-ds-pspace', '6pt'),
      margin:  getV2('wp-ds-margin', 'normal'),
      page:    getV2('wp-ds-page',   'A4'),
      divider: chk('wp-ds-divider', true),
      h1: getV2('dsm-h1', '26pt'),
      h2: getV2('dsm-h2', '20pt'),
      h3: getV2('dsm-h3', '16pt'),
      h4: getV2('dsm-h4', '14pt'),
      h5: getV2('dsm-h5', '12pt'),
      h6: getV2('dsm-h6', '11pt')
    };
  }

  function wpDocSettingsPrompt(ds) {
    var marginMap = { narrow: '0.5in (1.27cm)', normal: '1in (2.54cm)', wide: '1.5in (3.81cm)' };
    return '\n\nDOCUMENT FORMATTING REQUIREMENTS — apply these as inline style attributes on every relevant HTML element:\n' +
      '• Font family: ' + ds.font + ' (add style="font-family:' + ds.font + '" on body-text elements)\n' +
      '• Body font size: ' + ds.size + ' (add style="font-size:' + ds.size + '" on p, li, td elements)\n' +
      '• Heading sizes: H1=' + (ds.h1||'26pt') + ' H2=' + (ds.h2||'20pt') + ' H3=' + (ds.h3||'16pt') + ' H4=' + (ds.h4||'14pt') + ' H5=' + (ds.h5||'12pt') + ' H6=' + (ds.h6||'11pt') + ' (apply as style="font-size:X" on each heading tag)\n' +
      '• Line height: ' + ds.lspace + ' (add style="line-height:' + ds.lspace + '" on p, li elements)\n' +
      '• Paragraph spacing: ' + ds.pspace + ' after each paragraph (add style="margin-bottom:' + ds.pspace + '" on every <p>)\n' +
      '• Page margins: ' + (marginMap[ds.margin] || '1in') + '\n' +
      '• Page size: ' + ds.page + '\n' +
      (ds.divider ? '• Insert <hr style="border:none;border-top:1px solid #e2e8f0;margin:1em 0;"> between every major section (before each <h2>)\n' : '') +
      'Do NOT use separate <style> blocks — only inline style attributes.\n\n' +
      '━━━ HUMANIZATION — MANDATORY ━━━\n' +
      'Write in a natural, authentic human voice so the content passes any AI detection tool:\n' +
      '• Vary sentence length — mix short punchy sentences with longer elaborative ones\n' +
      '• Use natural transitions: "However,", "In practice,", "Worth noting here is", "That said,"\n' +
      '• Include occasional rhetorical questions or observations to add human depth\n' +
      '• Use contractions naturally where appropriate (e.g. "it\'s", "don\'t", "we\'re")\n' +
      '• Vary paragraph length — not every paragraph should be the same size\n' +
      '• NEVER use robotic AI phrases: "It is important to note that", "In conclusion,", "It can be seen that", "It is worth mentioning that", "Furthermore, it is essential"\n' +
      '• Every sentence must feel uniquely crafted — no template-sounding repetition\n' +
      '• Ground claims in specifics — real numbers, scenarios, or examples where possible\n' +
      '• Write like a knowledgeable human expert, not an AI summarizer';
  }

  function wpApplyDocSettings(ds) {
    var editors = document.querySelectorAll('.wp-page-editor');
    if (!editors.length) return;
    var ptToPx = function(pt) { return Math.round(parseFloat(pt) * 1.333) + 'px'; };
    var sizeMap = { '10pt':'13.3px','11pt':'14.7px','12pt':'16px','13pt':'17.3px','14pt':'18.7px','16pt':'21.3px' };
    var px = sizeMap[ds.size] || ptToPx(ds.size) || '16px';
    /* Standard Word margins: narrow=0.5in, normal=1in, wide=1.5in */
    var marginMM = { narrow:'12.7mm', normal:'25.4mm', wide:'38.1mm' };
    var hMap = { H1: ds.h1||'26pt', H2: ds.h2||'20pt', H3: ds.h3||'16pt', H4: ds.h4||'14pt', H5: ds.h5||'12pt', H6: ds.h6||'11pt' };

    editors.forEach(function(ed) {
      ed.style.fontFamily = ds.font;
      ed.style.fontSize   = px;
      ed.style.lineHeight = ds.lspace;
      ed.querySelectorAll('p,li,td,th').forEach(function(el) {
        el.style.fontFamily = ds.font;
        el.style.fontSize   = px;
        el.style.lineHeight = ds.lspace;
      });
      ed.querySelectorAll('p').forEach(function(p) {
        if (ds.pspace && ds.pspace !== '0') p.style.marginBottom = ds.pspace;
      });
      /* Apply heading sizes */
      Object.keys(hMap).forEach(function(tag) {
        ed.querySelectorAll(tag.toLowerCase()).forEach(function(el) {
          el.style.fontSize = ptToPx(hMap[tag]);
          el.style.fontFamily = ds.font;
        });
      });
      var page = ed.closest('.wp-page');
      if (page) { var m = marginMM[ds.margin] || '25.4mm'; page.style.padding = m; }
      if (ds.divider) {
        ed.querySelectorAll('h2').forEach(function(h2, i) {
          if (i === 0) return;
          var prev = h2.previousElementSibling;
          if (!prev || prev.tagName !== 'HR') {
            var hr = document.createElement('hr');
            hr.style.cssText = 'border:none;border-top:1px solid #e2e8f0;margin:1em 0;';
            h2.parentNode.insertBefore(hr, h2);
          }
        });
      }
    });
    /* Apply paper size to all pages */
    var pageSzMap = { 'A4':'a4','a4':'a4','Letter':'letter','letter':'letter','Legal':'legal','legal':'legal' };
    var paperV = pageSzMap[ds.page] || 'a4';
    document.querySelectorAll('.wp-page-item').forEach(function(pg) {
      pg.className = 'wp-page wp-page-item sz-' + paperV;
    });
    var tbP = document.getElementById('tb-paper'); if(tbP) tbP.value = paperV;
    wpSavePageState();
    /* After style changes layout may shift — schedule overflow reflow */
    wpScheduleReflow();
  }

  /* ── Sidebar toggle (mobile) ─────────────────────────────────── */
  window.wpToggleSidebar = function() {
    var sb = document.getElementById('wp-sidebar');
    if (sb && sb.classList.contains('mob-open')) { wpCloseSidebar(); } else { wpOpenSidebar(); }
  };
  window.wpOpenSidebar = function() {
    var sb = document.getElementById('wp-sidebar');
    var bd = document.getElementById('wp-sidebar-backdrop');
    var fab = document.getElementById('wp-sb-fab');
    if (sb) sb.classList.add('mob-open');
    if (bd) bd.classList.add('open');
    if (fab) { fab.innerHTML = '&#x2715;'; fab.title = 'Close AI Tools'; fab.classList.add('is-open'); }
  };
  window.wpCloseSidebar = function() {
    var sb = document.getElementById('wp-sidebar');
    var bd = document.getElementById('wp-sidebar-backdrop');
    var fab = document.getElementById('wp-sb-fab');
    if (sb) sb.classList.remove('mob-open');
    if (bd) bd.classList.remove('open');
    if (fab) { fab.innerHTML = '&#9776;'; fab.title = 'AI Tools'; fab.classList.remove('is-open'); }
  };

  /* ── AI Format ──────────────────────────────────────────────── */
  window.wpFormatAI = function() {
    var src = document.getElementById('wp-source');
    if (!src || !src.value.trim()) { showHint('wp-ai-hint', 'Please paste some text first.', 'warn'); return; }
    if (wpIsProcessing) return;
    /* Truncate to 4000 chars to reliably avoid HTTP 413 from Groq.
       4000 chars ≈ 1000 tokens — leaves safe budget for the full prompt
       template + up to 4000 output tokens within per-request limits. */
    var rawText = src.value.trim();
    var text  = rawText.length > 4000 ? rawText.slice(0, 4000) : rawText;
    if (rawText.length > 4000) { showHint('wp-ai-hint', '⚠️ Text trimmed to 4000 chars to fit AI limit. Paste in smaller sections for longer documents.', 'warn'); }
    var tone  = getV('wp-tone',    'Professional');
    var dtype = getV('wp-doctype', 'General Document');
    var rawPages = parseFloat(getV('wp-format-pages', '1'));
    var unlimited = (rawPages === 0 || isNaN(rawPages));
    var pages = unlimited ? 20 : (rawPages || 1);
    var ds    = wpGetDocSettings();
    var btn   = document.getElementById('wp-ai-btn');
    wpIsProcessing = true;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="wp-spin">⟳</span> Formatting…'; }
    hideHint('wp-ai-hint');
    /* Scale max tokens: 1 A4 page ≈ 500 words ≈ 700 tokens with HTML overhead.
       Cap at 8000 (Groq/Mistral max) to allow large multi-page documents. */
    var fmtMaxTokens = Math.min(8000, Math.max(2000, Math.round(pages * 700 + text.length / 8)));

    var prompt = 'You are an expert document formatter. Convert the text below into professional, well-structured HTML. Your ONLY job is to FORMAT — preserve every single word, sentence, and paragraph exactly as given.\n\n' +
      'STEP 1 — TYPE CHECK: Does the text fit a "' + dtype + '"? If clearly not, reply ONLY with: MISMATCH:[one sentence why, plus a better document type suggestion]\n\n' +
      'STEP 2 — FORMAT: Structure it as a ' + dtype + ' with ' + tone + ' tone.\n\n' +
      (unlimited ? '━━━ LENGTH REQUIREMENT ━━━\nWrite the COMPLETE formatted document — do NOT stop early, truncate, or skip any section. Cover 100% of the input text.\n\n' : '') +
      '━━━ ABSOLUTE RULES ━━━\n' +
      '✦ PRESERVE EVERY WORD — do NOT summarize, shorten, condense, or omit anything\n' +
      '✦ Output ONLY raw HTML — no markdown, no backticks, no code fences, no explanations\n' +
      '✦ Use ONLY these tags: h1 h2 h3 h4 p strong em u ul ol li blockquote hr table thead tbody tr th td\n' +
      '✦ NO html/head/body/style/script/div/span tags\n' +
      '✦ NO markdown syntax (**bold** → use <strong>, # headings → use <h1> etc.)\n\n' +
      '━━━ STRUCTURE RULES ━━━\n' +
      '1. Document title → <h1> (one per document)\n' +
      '2. Major section headings → <h2>\n' +
      '3. Sub-section headings → <h3>\n' +
      '4. Key terms, important phrases → <strong>\n' +
      '5. Emphasis, citations → <em>\n' +
      '6. ALL body text wrapped in <p> tags — never bare text\n' +
      '7. Bullet lists → <ul><li>…</li></ul>\n' +
      '8. Numbered lists → <ol><li>…</li></ol>\n' +
      '9. Pull-quotes, callouts → <blockquote>\n' +
      '10. Data tables → <table><thead>…</thead><tbody>…</tbody></table>\n' +
      '11. Section dividers → <hr>\n' +
      '12. Match ' + tone + ' tone — formal language, no slang\n\n' +
      wpDocSettingsPrompt(ds) + '\n\n' +
      '━━━ TEXT TO FORMAT (preserve ALL of it) ━━━\n' + text;

    callAI(prompt, fmtMaxTokens)
      .then(function(html) {
        var trimmed = html.trim();
        if (trimmed.toUpperCase().startsWith('MISMATCH:')) {
          showHint('wp-ai-hint', '⚠️ ' + trimmed.slice(9).trim(), 'warn');
          return;
        }
        hideHint('wp-ai-hint');
        var clean = sanitizeHTML(trimmed);
        if (clean) {
          wpLoadContent(clean);
          wpApplyDocSettings(ds);
          var title = (clean.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || text.slice(0,50) || 'Formatted Doc';
          wpSaveHistory(title.replace(/<[^>]+>/g,''), wpGetFullContent());
          wpSetStatus('Document formatted ✅');
        }
      })
      .catch(function(err) {
        var ed = wpGetEditor();
        if (ed) { ed.innerHTML = basicFormat(text); wpUpdateStats(); }
        var errMsg = (err.message || '');
        var hint = errMsg.indexOf('413') !== -1
          ? '⚠️ Text too long for AI — basic formatting applied. Paste in smaller sections for full AI results.'
          : '⚠️ ' + (errMsg || 'AI busy') + ' — basic formatting applied.';
        showHint('wp-ai-hint', hint, 'error');
        wpSetStatus('Basic formatting applied (AI unavailable)');
      })
      .finally(function() {
        wpIsProcessing = false;
        if (btn) { btn.disabled = false; btn.innerHTML = '✨ Format with AI'; }
      });
  };

  window.wpUseAsIs = function() {
    var src = document.getElementById('wp-source');
    if (!src || !src.value.trim()) { alert('Please paste some text first.'); return; }
    wpLoadContent(basicFormat(src.value.trim()));
    wpSetStatus('Text loaded as-is');
  };

  /* ── AI Write ────────────────────────────────────────────────── */
  window.wpAIWrite = function() {
    var promptEl = document.getElementById('wp-prompt');
    var prompt   = promptEl ? promptEl.value.trim() : '';
    if (!prompt) { showHint('wp-write-hint', 'Please describe what you want to write.', 'warn'); return; }
    if (wpIsProcessing) return;
    var tone   = getV('wp-wtone',    'Professional');
    var dtype  = getV('wp-wdoctype', 'General Document');
    var rawPages = parseFloat(getV('wp-length-sel', '1'));
    var unlimited = (rawPages === 0 || isNaN(rawPages));
    var pages  = unlimited ? 20 : (rawPages || 1);
    var ds     = wpGetDocSettings();
    var btn    = document.getElementById('wp-write-btn');
    var pageLabel = unlimited ? 'Unlimited (as long as needed)' : (pages < 1 ? '½ page' : pages + (pages === 1 ? ' page' : ' pages'));
    /* Tokens: A4 page ≈ 500 words ≈ 700 tokens with HTML markup overhead.
       Cap at 8000 (Groq/Mistral max). For large docs the AI must fill every page. */
    var strictWords = unlimited ? null : Math.round(pages * 500);
    var aiMaxTokens = unlimited ? 8000 : Math.min(8000, Math.max(2000, Math.round(pages * 700) + 500));
    var sectionCount = unlimited ? 6 : Math.max(2, Math.round(pages * 1.5));

    wpIsProcessing = true;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="wp-spin">⟳</span> Writing…'; }
    hideHint('wp-write-hint');

    var aiPrompt = 'You are a professional document writer. Write a ' + dtype + ' with a ' + tone + ' tone.\n\n' +
      '━━━ STRICT LENGTH RULE (NON-NEGOTIABLE) ━━━\n' +
      (unlimited
        ? 'Length: Write a complete, thorough document. Cover the topic fully across all sections.\n'
        : 'Required length: EXACTLY ' + pageLabel + ' of A4 content.\n' +
          'Target word count: MINIMUM ' + strictWords + ' words — you MUST reach this.\n' +
          'MAXIMUM allowed: ' + Math.round(strictWords * 1.15) + ' words.\n' +
          'One A4 page = ~500 words. You must write enough to fill ' + pages + ' full pages.\n' +
          'DO NOT stop early. DO NOT summarize or skip sections. Write ALL ' + pages + ' pages fully.\n' +
          'If you are close to your token limit, KEEP WRITING — finish every section before stopping.\n') +
      '• Include ' + sectionCount + ' major sections with full, detailed body paragraphs\n' +
      '• Each section must have at least 2–3 paragraphs of substantial content\n' +
      '• Write a Conclusion section at the very end\n\n' +
      '━━━ ABSOLUTE OUTPUT RULES ━━━\n' +
      '✦ Output ONLY raw HTML — no markdown, no backticks, no code fences, no preamble\n' +
      '✦ Use ONLY: h1 h2 h3 h4 p strong em u ul ol li blockquote table thead tbody tr th td hr\n' +
      '✦ NO html/head/body/style/script/div/span tags\n' +
      '✦ Start immediately with <h1> — no text before or after the HTML\n' +
      '✦ Every paragraph must be wrapped in <p> tags — never bare text\n\n' +
      '━━━ STRUCTURE ━━━\n' +
      '• <h1> document title\n' +
      '• <h2> each major section heading\n' +
      '• <h3> sub-sections inside major sections\n' +
      '• <p> ALL body text — write detailed, thorough paragraphs\n' +
      '• <strong> key terms • <ul>/<ol> lists • <blockquote> quotes • <table> data\n\n' +
      'REQUEST: ' + prompt + '\n' +
      wpDocSettingsPrompt(ds);

    /* Helper: check if content seems complete (has a conclusion or ending tag) */
    function _looksComplete(html) {
      var lower = html.toLowerCase();
      return lower.indexOf('conclusion') !== -1 || lower.indexOf('summary') !== -1 || lower.indexOf('</ol>') !== -1 || (lower.lastIndexOf('</p>') > html.length - 300);
    }

    callAI(aiPrompt, aiMaxTokens)
      .then(function(result) {
        var clean = sanitizeHTML(result);
        if (!clean || clean.length < 50) throw new Error('AI returned insufficient content');

        /* ── Continuation: if doc looks incomplete and we have a page target, ask AI to continue ── */
        var needsContinuation = !unlimited && !_looksComplete(clean) && pages >= 3;
        if (!needsContinuation) return clean;

        wpSetStatus('Continuing document (page ' + Math.ceil(stripHtml(clean).split(/\s+/).length / 500) + '/' + pages + ')…');
        var contPrompt = 'You are continuing a document. Below is what has been written so far. ' +
          'Continue writing from where it left off — do NOT repeat any content already written. ' +
          'The target is ' + pageLabel + ' total (' + strictWords + ' words). The current draft has approximately ' +
          Math.ceil(stripHtml(clean).split(/\s+/).length) + ' words — you need to add roughly ' +
          Math.max(200, strictWords - Math.ceil(stripHtml(clean).split(/\s+/).length)) + ' more words. ' +
          'End with a Conclusion section. Return ONLY raw HTML (same tags as before) — no preamble.\n\n' +
          '━━━ DOCUMENT SO FAR (do not repeat) ━━━\n' + clean.slice(-3000);
        return callAI(contPrompt, Math.min(8000, Math.max(1500, (strictWords - Math.ceil(stripHtml(clean).split(/\s+/).length)) * 1.5)))
          .then(function(cont) {
            var contClean = sanitizeHTML(cont);
            return contClean ? clean + contClean : clean;
          })
          .catch(function() { return clean; }); /* if continuation fails, use what we have */
      })
      .then(function(finalHtml) {
        var clean = typeof finalHtml === 'string' ? finalHtml : sanitizeHTML(finalHtml);
        if (!clean || clean.length < 50) throw new Error('AI returned insufficient content');
        wpLoadContent(clean);
        wpApplyDocSettings(ds);
        var wTitle = (clean.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || prompt.slice(0,50) || 'AI Document';
        wpSaveHistory(wTitle.replace(/<[^>]+>/g,''), wpGetFullContent());
        wpSwitchTab('format');
        wpSetStatus('Document written ✅');
      })
      .catch(function(err) {
        var errMsg = (err.message || '');
        var hint = errMsg.indexOf('413') !== -1
          ? '⚠️ Prompt too large — please shorten your request or choose fewer pages and try again.'
          : '⚠️ ' + (errMsg || 'AI failed') + ' — please try again.';
        showHint('wp-write-hint', hint, 'error');
        wpSetStatus('AI writing failed — please retry');
      })
      .finally(function() {
        wpIsProcessing = false;
        if (btn) { btn.disabled = false; btn.innerHTML = '✍️ Write with AI'; }
      });
  };

  /* ── AI Summarize ────────────────────────────────────────────── */
  window.wpAISummarize = function() {
    var content = wpGetFullContent();
    var text = stripHtml(content).slice(0, 4000);
    if (!text.trim() || text.length < 50) { alert('Please add some content to summarize.'); return; }
    if (wpIsProcessing) return;
    wpIsProcessing = true;
    wpSetStatus('Summarizing…');
    callAI('Summarize the following document in a well-structured HTML format. Use h1 for title, h2 for key sections, bullet points for key findings. Be concise but comprehensive. Return ONLY clean HTML (h1,h2,h3,p,ul,ol,li,strong,em,blockquote). IMPORTANT: Write in a natural human voice — vary sentence length, use contractions, avoid robotic AI phrases like "It is important to note" or "Furthermore". Sound like a knowledgeable human summarizing, not an AI tool:\n\n' + text, 1200)
      .then(function(html) {
        var clean = sanitizeHTML(html);
        if (clean) { wpLoadContent(clean); wpSetStatus('Summary generated ✅'); }
      })
      .catch(function(e) { wpSetStatus('Summarize failed: ' + e.message); })
      .finally(function() { wpIsProcessing = false; });
  };

  /* ── AI Expand ──────────────────────────────────────────────── */
  window.wpAIExpand = function() {
    var content = wpGetFullContent();
    var text = stripHtml(content).slice(0, 3000);
    if (!text.trim() || text.length < 20) { alert('Please add some content to expand.'); return; }
    if (wpIsProcessing) return;
    wpIsProcessing = true;
    wpSetStatus('Expanding document…');
    callAI('Expand and elaborate on the following document content. Add more detail, examples, context, and depth. Maintain the same structure but make it significantly more comprehensive. Return ONLY clean HTML (h1,h2,h3,h4,p,ul,ol,li,strong,em,blockquote,table,thead,tbody,tr,th,td). HUMANIZATION REQUIRED: Write in a natural, authentic human voice — mix short and long sentences, use contractions where natural, include real examples and specifics, avoid robotic AI phrases. The output must pass AI detection tools as genuine human writing:\n\n' + text, 2500)
      .then(function(html) {
        var clean = sanitizeHTML(html);
        if (clean) { wpLoadContent(clean); wpSetStatus('Document expanded ✅'); }
      })
      .catch(function(e) { wpSetStatus('Expand failed: ' + e.message); })
      .finally(function() { wpIsProcessing = false; });
  };

  /* ── AI Translate ────────────────────────────────────────────── */
  window.wpAITranslate = function() { wpShowModal('wp-translate-modal'); };

  /* ── AI Rewrite ──────────────────────────────────────────────── */
  window.wpAIRewrite = function() { wpShowModal('wp-rewrite-modal'); };

  window.wpDoRewrite = function() {
    var content = wpGetFullContent();
    var text    = stripHtml(content);
    if (!text.trim() || text.length < 30) { alert('Please add some content to rewrite.'); return; }
    var tone    = getV('wp-rw-tone',    'Professional');
    var style   = getV('wp-rw-style',   'Full Rewrite');
    var reading = getV('wp-rw-reading', 'Standard');
    var ds      = wpGetDocSettings();
    var btn     = document.getElementById('wp-rw-btn');
    wpHideModal('wp-rewrite-modal');
    if (wpIsProcessing) return;
    wpIsProcessing = true;
    if (btn) { btn.disabled = true; }
    wpSetStatus('Rewriting document…');
    wpSetAIStatus('working', 'Rewriting…');

    var styleInstructions = {
      'Full Rewrite':       'Completely rewrite the entire document from scratch while preserving all the key facts, data, and meaning.',
      'Polish & Refine':    'Polish and refine the existing writing — improve flow, fix awkward phrasing, strengthen sentences. Keep the structure and most original wording intact.',
      'Simplify Language':  'Rewrite using simpler, clearer language. Replace complex vocabulary with everyday words. Keep sentences short and easy to understand.',
      'Make More Formal':   'Rewrite in a formal, professional register. Remove colloquialisms, use precise vocabulary, and ensure a polished academic/business tone.',
      'Make More Casual':   'Rewrite in a friendly, conversational tone. Make it feel approachable and natural — as if explaining to a friend.'
    };
    var readingInstructions = {
      'Simple':      'Target a simple reading level (Grade 6–8) — short sentences, common words, clear explanations.',
      'Standard':    'Target a standard reading level (Grade 9–12) — clear, balanced prose suitable for a general audience.',
      'Advanced':    'Target an advanced reading level (college+) — sophisticated vocabulary, complex sentence structures where appropriate.',
      'Expert':      'Target an expert-level audience — assume deep domain knowledge, use technical terminology precisely.'
    };

    var rwMaxTokens = Math.min(8000, Math.max(2500, Math.round(text.length / 4 + 1000)));

    var rwPrompt = 'You are an expert professional writer and editor. Rewrite the document below according to these exact requirements.\n\n' +
      '━━━ REWRITE INSTRUCTIONS ━━━\n' +
      '• Style: ' + (styleInstructions[style] || styleInstructions['Full Rewrite']) + '\n' +
      '• Tone: ' + tone + ' — authoritative, clear, and purposeful\n' +
      '• Reading Level: ' + (readingInstructions[reading] || readingInstructions['Standard']) + '\n\n' +
      '━━━ ABSOLUTE OUTPUT RULES ━━━\n' +
      '✦ Output ONLY raw HTML — no markdown, no backticks, no code fences, no preamble\n' +
      '✦ Use ONLY: h1 h2 h3 h4 p strong em u ul ol li blockquote table thead tbody tr th td hr\n' +
      '✦ NO html/head/body/style/script/div/span tags — start immediately with <h1>\n' +
      '✦ Preserve ALL key facts, statistics, names, and data — do NOT invent or remove information\n' +
      '✦ Keep the same document structure (same number of sections, same logical flow)\n\n' +
      '━━━ HUMANIZATION — MANDATORY ━━━\n' +
      '✦ Write in a natural human voice that passes AI detection tools\n' +
      '✦ Vary sentence length — mix short punchy sentences with longer elaborative ones\n' +
      '✦ Use natural transitions and contractions where appropriate\n' +
      '✦ NEVER use: "It is important to note that", "Furthermore,", "In conclusion,", "It can be seen that"\n\n' +
      wpDocSettingsPrompt(ds) + '\n\n' +
      '━━━ DOCUMENT TO REWRITE ━━━\n' + text;

    callAI(rwPrompt, rwMaxTokens)
      .then(function(result) {
        var clean = sanitizeHTML(result);
        if (!clean || clean.length < 30) throw new Error('AI returned insufficient content');
        wpLoadContent(clean);
        wpApplyDocSettings(ds);
        var wTitle = (clean.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || 'Rewritten Document';
        wpSaveHistory(wTitle.replace(/<[^>]+>/g,''), wpGetFullContent());
        wpSetStatus('Document rewritten ✅ — ' + style + ' · ' + tone);
        wpSetAIStatus('ready', 'AI Ready');
      })
      .catch(function(err) {
        wpSetStatus('Rewrite failed — ' + (err.message || 'AI error'));
        wpSetAIStatus('error', 'Rewrite failed');
      })
      .finally(function() {
        wpIsProcessing = false;
        if (btn) { btn.disabled = false; }
      });
  };

  window.wpAIFix = function() {
    var ed = wpGetEditor(); if (!ed) return;
    var content = ed.innerHTML;
    if (!content || content.replace(/<[^>]+>/g,'').trim().length < 5) {
      wpSetStatus('Nothing to fix — document is empty.'); return;
    }
    wpSetAIStatus('working', 'Fixing grammar…');
    var text = ed.innerText || ed.textContent || '';
    callAI('Fix all grammar, spelling, punctuation and style issues in the following text. Return ONLY the corrected text with no extra commentary:\n\n' + text, 3000)
      .then(function(fixed) {
        if (fixed && fixed.trim()) {
          var ds = wpGetDocSettings();
          ed.innerHTML = basicFormat ? basicFormat(fixed) : ('<p>' + fixed.replace(/\n/g,'</p><p>') + '</p>');
          wpApplyDocSettings(ds);
          wpSetStatus('Grammar fixed ✅');
        }
      }).catch(function(e) { wpSetStatus('Fix failed: ' + (e.message || 'AI error')); });
  };
  window.wpDoTranslate = function() {
    var lang = getV('wp-trans-lang', 'Spanish');
    var content = wpGetFullContent();
    var text = content.slice(0, 4000);
    if (!text.trim()) { alert('No content to translate.'); return; }
    wpHideModal('wp-translate-modal');
    if (wpIsProcessing) return;
    wpIsProcessing = true;
    wpSetStatus('Translating to ' + lang + '…');
    callAI('Translate the following HTML document to ' + lang + '. Preserve all HTML tags exactly. Only translate the text content. Return ONLY the translated HTML:\n\n' + text, 2500)
      .then(function(html) {
        var clean = sanitizeHTML(html);
        if (clean) { wpLoadContent(clean); wpSetStatus('Translated to ' + lang + ' ✅'); }
      })
      .catch(function(e) { wpSetStatus('Translation failed: ' + e.message); })
      .finally(function() { wpIsProcessing = false; });
  };

  /* ── Web Research / Import ─────────────────────────────────── */
  window.wpWebImport = function() {
    var url   = (document.getElementById('wp-web-url') || {}).value || '';
    var mode  = getV('wp-web-extract-as', 'Summary');
    if (!url || !url.startsWith('http')) { wpWebStatus('Please enter a valid URL.', 'error'); return; }
    if (wpIsProcessing) return;
    wpIsProcessing = true;
    wpWebStatus('Fetching webpage…', 'info');
    // Use allorigins.win as a CORS proxy
    var proxy = 'https://api.allorigins.win/get?url=' + encodeURIComponent(url);
    fetch(proxy).then(function(r){ return r.json(); })
      .then(function(data) {
        var html = data.contents || '';
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        tmp.querySelectorAll('script,style,nav,header,footer,aside,iframe,noscript').forEach(function(el){ el.remove(); });
        var text = (tmp.querySelector('article,main,[role="main"]') || tmp).textContent;
        text = text.replace(/\s+/g,' ').trim().slice(0, 5000);
        if (!text) throw new Error('Could not extract content from that page.');
        wpWebStatus('Formatting with AI…', 'info');
        return callAI('Extract and format the following web page content as a well-structured ' + mode + '. Return ONLY clean HTML (h1,h2,h3,p,ul,ol,li,strong,em,blockquote,table,thead,tbody,tr,th,td):\n\n' + text, 2000);
      })
      .then(function(html) {
        var clean = sanitizeHTML(html);
        if (clean) {
          wpLoadContent(clean);
          wpWebStatus('✅ Content imported and formatted!', 'ok');
          wpSetStatus('Web content imported ✅');
        }
      })
      .catch(function(e) { wpWebStatus('❌ ' + (e.message || 'Failed to fetch'), 'error'); })
      .finally(function() { wpIsProcessing = false; });
  };

  window.wpWebResearch = function() {
    var query = (document.getElementById('wp-web-query') || {}).value || '';
    if (!query.trim()) { wpWebStatus('Please enter a research topic.', 'error'); return; }
    if (wpIsProcessing) return;
    wpIsProcessing = true;
    wpWebStatus('AI researching…', 'info');
    callAI('You are an expert researcher. Write a comprehensive, well-researched document about: "' + query + '". Include key facts, analysis, examples, and actionable insights. Return ONLY clean HTML (h1,h2,h3,p,ul,ol,li,strong,em,blockquote,table,thead,tbody,tr,th,td). No markdown, no code fences.', 2500)
      .then(function(html) {
        var clean = sanitizeHTML(html);
        if (clean) { wpLoadContent(clean); wpWebStatus('✅ Research complete!', 'ok'); wpSetStatus('AI research complete ✅'); }
      })
      .catch(function(e) { wpWebStatus('❌ Research failed: ' + e.message, 'error'); })
      .finally(function() { wpIsProcessing = false; });
  };

  function wpWebStatus(msg, type) {
    var el = document.getElementById('wp-web-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'wp-hint show ' + (type === 'ok' ? 'info' : type === 'error' ? 'error' : 'info');
    el.style.display = 'block';
  }

  /* ── Char counter (no limit — shows current length only) ──── */
  window.wpCharCount = function() {
    var el  = document.getElementById('wp-source');
    var n   = el ? el.value.length : 0;
    var cnt = document.getElementById('wp-count');
    if (!cnt) return;
    var words = el ? el.value.trim().split(/\s+/).filter(Boolean).length : 0;
    cnt.textContent = n.toLocaleString() + ' chars · ' + words.toLocaleString() + ' words';
    cnt.className   = 'wp-char-count';
  };

  /* ── File upload ────────────────────────────────────────────── */
  window.wpHandleFileDrop = function(ev) {
    ev.preventDefault();
    var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) wpHandleFile(f);
  };

  window.wpHandleFile = function(file) {
    if (!file) return;
    var name = file.name.toLowerCase();
    wpShowUploadStatus('📤 Reading ' + file.name + '…', false);
    var fillSource = function(text) {
      var src = document.getElementById('wp-source');
      if (src) { src.value = text; wpCharCount(); }  /* No character limit */
      var words = text.trim().split(/\s+/).filter(Boolean).length;
      var preview = text.slice(0, 100).replace(/\s+/g,' ').trim();
      wpShowUploadStatus('✅ ' + file.name + ' — ' + words + ' words\n"' + preview + (text.length > 100 ? '…' : '') + '"', false);
      wpSwitchTab('format');
    };
    if (name.endsWith('.txt') || name.endsWith('.md')) {
      var r = new FileReader(); r.onload = function(e){ fillSource(e.target.result); }; r.readAsText(file);
    } else if (name.endsWith('.html') || name.endsWith('.htm')) {
      var r2 = new FileReader(); r2.onload = function(e){
        var tmp = document.createElement('div'); tmp.innerHTML = e.target.result;
        tmp.querySelectorAll('script,style,head,meta,link,nav,footer').forEach(function(x){ x.remove(); });
        fillSource((tmp.querySelector('body') || tmp).textContent || '');
      }; r2.readAsText(file);
    } else if (name.endsWith('.docx')) {
      if (typeof mammoth === 'undefined') { wpShowUploadStatus('DOCX parser unavailable.', true); return; }
      var r3 = new FileReader(); r3.onload = function(e){
        mammoth.extractRawText({arrayBuffer: e.target.result})
          .then(function(res){ fillSource(res.value); })
          .catch(function(err){ wpShowUploadStatus('DOCX error: ' + err.message, true); });
      }; r3.readAsArrayBuffer(file);
    } else if (name.endsWith('.pdf')) {
      var r4 = new FileReader(); r4.onload = function(e){ wpParsePDF(e.target.result, fillSource); }; r4.readAsArrayBuffer(file);
    } else {
      wpShowUploadStatus('Unsupported format. Use TXT, DOCX, PDF, HTML, or MD.', true);
    }
  };

  function wpParsePDF(buf, cb) {
    if (typeof pdfjsLib === 'undefined') { wpShowUploadStatus('PDF.js not loaded. Try TXT/DOCX.', true); return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    pdfjsLib.getDocument({ data: buf }).promise.then(function(pdf) {
      var pages = [], total = pdf.numPages, done = 0;
      for (var i = 1; i <= total; i++) {
        pdf.getPage(i).then(function(pg) {
          return pg.getTextContent().then(function(tc) {
            pages.push({ num: pg.pageNumber, text: tc.items.map(function(it){ return it.str; }).join(' ') });
            done++;
            if (done === total) {
              pages.sort(function(a,b){ return a.num - b.num; });
              cb(pages.map(function(p){ return p.text; }).join('\n\n'));
            }
          });
        });
      }
    }).catch(function(e) { wpShowUploadStatus('PDF error: ' + e.message, true); });
  }

  function wpShowUploadStatus(msg, isErr) {
    var el = document.getElementById('wp-upload-status');
    if (!el) return;
    el.style.whiteSpace = 'pre-line'; el.textContent = msg;
    el.style.display = 'block';
    el.className = 'wp-upload-status ' + (isErr ? 'err' : 'ok');
    if (!isErr) setTimeout(function(){ el.style.display = 'none'; }, 8000);
  }

  /* ── Templates ──────────────────────────────────────────────── */
  var TEMPLATES = [
    { name: 'Blank', icon: '📄', desc: 'Clean start', content: '<h1>Document Title</h1><p>Start writing here…</p>' },
    { name: 'Report', icon: '📊', desc: 'Business report', content: '<h1>Business Report</h1><h2>Executive Summary</h2><p>Brief overview of the report findings and recommendations.</p><h2>Background</h2><p>Context and background information for this report.</p><h2>Analysis</h2><p>Detailed analysis of the findings.</p><h2>Recommendations</h2><ul><li>Recommendation 1</li><li>Recommendation 2</li><li>Recommendation 3</li></ul><h2>Conclusion</h2><p>Summary and next steps.</p>' },
    { name: 'Letter', icon: '✉️', desc: 'Formal letter', content: '<p>[Your Name]<br>[Address]<br>[Date]</p><p>[Recipient Name]<br>[Recipient Address]</p><p>Dear [Name],</p><p>I am writing to [purpose of the letter].</p><p>[Main body of the letter — explain your purpose in detail here.]</p><p>[Second paragraph with supporting information.]</p><p>I look forward to your response. Please do not hesitate to contact me if you require any further information.</p><p>Yours sincerely,</p><p><strong>[Your Name]</strong><br>[Title/Position]</p>' },
    { name: 'Resume', icon: '👤', desc: 'CV template', content: '<h1>Your Full Name</h1><p style="text-align:center;color:#6b7280;">email@example.com | +1 234 567 8900 | LinkedIn: /yourprofile | City, Country</p><hr><h2>Professional Summary</h2><p>Motivated and results-driven professional with [X] years of experience in [field]. Proven track record of [key achievement]. Seeking to leverage expertise in [area] to contribute to [type of organization].</p><h2>Experience</h2><h3>Senior [Job Title] — Company Name (2021–Present)</h3><ul><li>Led [project/initiative] resulting in [measurable outcome]</li><li>Managed a team of [X] professionals across [departments]</li><li>Implemented [process/system] improving efficiency by [X]%</li></ul><h3>[Job Title] — Previous Company (2018–2021)</h3><ul><li>Responsible for [key duty]</li><li>Achieved [specific result]</li></ul><h2>Education</h2><p><strong>Bachelor of [Degree]</strong> — University Name (Year)<br>Relevant coursework: [Courses]</p><h2>Skills</h2><ul><li><strong>Technical:</strong> [Skill 1], [Skill 2], [Skill 3]</li><li><strong>Soft Skills:</strong> Leadership, Communication, Problem-solving</li><li><strong>Languages:</strong> English (Native), [Other] (Proficient)</li></ul><h2>Certifications</h2><ul><li>[Certification Name] — Issuing Organization (Year)</li></ul>' },
    { name: 'Proposal', icon: '💼', desc: 'Project proposal', content: '<h1>Project Proposal</h1><h2>Project Overview</h2><p>This proposal outlines [brief description of the project and its objectives].</p><h2>Problem Statement</h2><p>Currently, [describe the problem]. This results in [consequences]. Our solution addresses this by [brief solution description].</p><h2>Proposed Solution</h2><p>We propose to [detailed solution]. This approach will [benefits].</p><h2>Scope of Work</h2><ul><li>Phase 1: [Deliverable] — [Timeline]</li><li>Phase 2: [Deliverable] — [Timeline]</li><li>Phase 3: [Deliverable] — [Timeline]</li></ul><h2>Timeline</h2><table><thead><tr><th>Phase</th><th>Activities</th><th>Duration</th><th>Deadline</th></tr></thead><tbody><tr><td>1</td><td>Research & Planning</td><td>2 weeks</td><td>Week 2</td></tr><tr><td>2</td><td>Development</td><td>4 weeks</td><td>Week 6</td></tr><tr><td>3</td><td>Testing & Launch</td><td>2 weeks</td><td>Week 8</td></tr></tbody></table><h2>Budget</h2><table><thead><tr><th>Item</th><th>Description</th><th>Cost</th></tr></thead><tbody><tr><td>Labor</td><td>Development team</td><td>$XX,XXX</td></tr><tr><td>Materials</td><td>Equipment and tools</td><td>$X,XXX</td></tr><tr><td>Total</td><td></td><td><strong>$XX,XXX</strong></td></tr></tbody></table><h2>Team</h2><p>This project will be led by [Name, Title] with support from [team description].</p><h2>Next Steps</h2><p>Upon approval of this proposal, we will [immediate next steps].</p>' },
    { name: 'Meeting Notes', icon: '📝', desc: 'Meeting template', content: '<h1>Meeting Notes</h1><h2>Meeting Details</h2><table><thead><tr><th>Field</th><th>Details</th></tr></thead><tbody><tr><td>Date</td><td>' + new Date().toLocaleDateString() + '</td></tr><tr><td>Time</td><td>[Start Time] – [End Time]</td></tr><tr><td>Location</td><td>[Room / Video Call Link]</td></tr><tr><td>Facilitator</td><td>[Name]</td></tr><tr><td>Note Taker</td><td>[Name]</td></tr></tbody></table><h2>Attendees</h2><ul><li>[Name] — [Role]</li><li>[Name] — [Role]</li></ul><h2>Agenda</h2><ol><li>Welcome & Introductions</li><li>[Agenda Item 2]</li><li>[Agenda Item 3]</li><li>Action Items Review</li><li>Any Other Business</li></ol><h2>Discussion</h2><h3>Item 1: [Topic]</h3><p>[Summary of discussion points and key decisions made.]</p><h3>Item 2: [Topic]</h3><p>[Summary of discussion.]</p><h2>Action Items</h2><table><thead><tr><th>Action</th><th>Owner</th><th>Due Date</th><th>Status</th></tr></thead><tbody><tr><td>[Action item 1]</td><td>[Name]</td><td>[Date]</td><td>Open</td></tr><tr><td>[Action item 2]</td><td>[Name]</td><td>[Date]</td><td>Open</td></tr></tbody></table><h2>Next Meeting</h2><p>Date: [Date] | Time: [Time] | Location: [Location]</p>' },
    { name: 'Invoice', icon: '🧾', desc: 'Invoice template', content: '<h1>INVOICE</h1><table><thead><tr><th>Field</th><th>Details</th></tr></thead><tbody><tr><td><strong>Invoice No.</strong></td><td>INV-001</td></tr><tr><td><strong>Date</strong></td><td>' + new Date().toLocaleDateString() + '</td></tr><tr><td><strong>Due Date</strong></td><td>[Due Date]</td></tr><tr><td><strong>From</strong></td><td>[Your Company Name]<br>[Address]<br>[Email]</td></tr><tr><td><strong>To</strong></td><td>[Client Name]<br>[Client Address]<br>[Client Email]</td></tr></tbody></table><h2>Invoice Items</h2><table><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody><tr><td>[Service/Product 1]</td><td>1</td><td>$XXX.XX</td><td>$XXX.XX</td></tr><tr><td>[Service/Product 2]</td><td>2</td><td>$XXX.XX</td><td>$XXX.XX</td></tr><tr><td colspan="3"><strong>Subtotal</strong></td><td>$XXX.XX</td></tr><tr><td colspan="3"><strong>Tax (10%)</strong></td><td>$XX.XX</td></tr><tr><td colspan="3"><strong>Total Due</strong></td><td><strong>$XXX.XX</strong></td></tr></tbody></table><h2>Payment Details</h2><p>Payment Method: [Bank Transfer / PayPal / etc.]<br>Account: [Account details]<br>Reference: INV-001</p><p><em>Thank you for your business!</em></p>' },
    { name: 'Newsletter', icon: '📰', desc: 'Newsletter', content: '<h1>Monthly Newsletter — [Month Year]</h1><h2>Welcome!</h2><p>Welcome to this month\'s newsletter! We have some exciting updates and news to share with you.</p><h2>Top Story</h2><p>[Main story content goes here. Write about the most important news or update of the month.]</p><h2>Updates & Announcements</h2><ul><li><strong>[Update 1]:</strong> Brief description</li><li><strong>[Update 2]:</strong> Brief description</li><li><strong>[Update 3]:</strong> Brief description</li></ul><h2>Featured Article</h2><h3>[Article Title]</h3><p>[Article content with relevant information, tips, or insights your audience would find valuable.]</p><h2>Upcoming Events</h2><table><thead><tr><th>Event</th><th>Date</th><th>Location</th></tr></thead><tbody><tr><td>[Event 1]</td><td>[Date]</td><td>[Location]</td></tr><tr><td>[Event 2]</td><td>[Date]</td><td>[Location]</td></tr></tbody></table><h2>Final Thoughts</h2><p>Thank you for reading this month\'s newsletter. We look forward to sharing more updates with you next month!</p>' },
    { name: 'Research Paper', icon: '🔬', desc: 'Academic paper', content: '<h1>Research Paper Title</h1><p style="text-align:center;"><em>Author Name(s) | Institution | ' + new Date().getFullYear() + '</em></p><h2>Abstract</h2><blockquote>This paper examines [topic]. Using [methodology], we found that [key finding]. The results indicate [implication]. This research contributes to [field] by [contribution].</blockquote><h2>1. Introduction</h2><p>The study of [topic] is increasingly important due to [reasons]. Previous research has shown [prior findings] (Citation, Year). However, [gap in knowledge]. This paper addresses this gap by [approach].</p><h3>1.1 Research Questions</h3><ol><li>Research question 1</li><li>Research question 2</li></ol><h2>2. Literature Review</h2><p>A substantial body of work has investigated [topic]. [Author (Year)] demonstrated that [finding]. Building upon this, [Author (Year)] found [related finding].</p><h2>3. Methodology</h2><p>This study employs a [qualitative/quantitative/mixed] research approach. Data was collected through [method] from [participants/sources]. Analysis was conducted using [analysis method].</p><h2>4. Results</h2><p>The analysis revealed the following key findings:</p><ol><li>[Finding 1]: [Description]</li><li>[Finding 2]: [Description]</li></ol><h2>5. Discussion</h2><p>These findings suggest that [interpretation]. This aligns with [prior research], but contrasts with [other research] because [reason].</p><h2>6. Conclusion</h2><p>This research investigated [topic] and found [key conclusions]. The implications for practice include [implications]. Future research should explore [future directions].</p><h2>References</h2><ul><li>Author, A. (Year). <em>Title of work</em>. Publisher.</li><li>Author, B. (Year). Title of article. <em>Journal Name</em>, <em>Vol</em>(Issue), pages.</li></ul>' }
  ];

  function wpBuildTemplates() {
    var grid = document.getElementById('wp-templates-grid');
    if (!grid) return;
    grid.innerHTML = '';
    TEMPLATES.forEach(function(tpl, i) {
      var card = document.createElement('div');
      card.className = 'wp-tmpl-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.innerHTML = '<span class="wp-tmpl-icon">' + tpl.icon + '</span>' +
        '<div><div class="wp-tmpl-name">' + tpl.name + '</div>' +
        '<div class="wp-tmpl-desc">' + tpl.desc + '</div></div>';
      card.onclick = function() { wpLoadTemplate(i); };
      card.onkeydown = function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wpLoadTemplate(i); } };
      grid.appendChild(card);
    });
  }

  window.wpLoadTemplate = function(idx) {
    var tpl = TEMPLATES[idx]; if (!tpl) return;
    if (wpGetFullContent().replace(/<[^>]+>/g,'').trim().length > 50) {
      if (!confirm('Load template "' + tpl.name + '"? Current content will be replaced.')) return;
    }
    wpLoadContent(tpl.content);
    wpSwitchTab('format');
    wpSetStatus('Template "' + tpl.name + '" loaded');
  };

  /* ── Sidebar tab switching ──────────────────────────────────── */
  window.wpSwitchTab = function(tab) {
    ['format','write','history','template','web'].forEach(function(t) {
      var btn = document.getElementById('wp-stab-' + t);
      var pan = document.getElementById('wp-spanel-' + t);
      if (btn) btn.classList.toggle('active', t === tab);
      if (pan) pan.classList.toggle('active', t === tab);
    });
    if (tab === 'history') wpRenderHistory();
    /* Do NOT auto-open sidebar on mobile — user controls it via the FAB button */
  };

  /* ── Document History ───────────────────────────────────────── */
  var WP_HIST_KEY = 'wp_doc_history_v3', WP_MAX_HIST = 15;

  function wpSaveHistory(title, content) {
    if (!content || content.replace(/<[^>]+>/g,'').trim().length < 20) return;
    try {
      var hist = JSON.parse(localStorage.getItem(WP_HIST_KEY) || '[]');
      hist = hist.filter(function(h){ return h.title !== title; });
      hist.unshift({ title: (title || 'Untitled').slice(0, 70), content: content, date: new Date().toLocaleString() });
      if (hist.length > WP_MAX_HIST) hist = hist.slice(0, WP_MAX_HIST);
      localStorage.setItem(WP_HIST_KEY, JSON.stringify(hist));
    } catch(e) {}
  }

  function wpRenderHistory() {
    var list = document.getElementById('wp-hist-list'); if (!list) return;
    var hist = [];
    try { hist = JSON.parse(localStorage.getItem(WP_HIST_KEY) || '[]'); } catch(e) {}
    if (!hist.length) {
      list.innerHTML = '<div class="wp-hist-empty">📄 No saved documents yet.<br>Format or write a document to auto-save here.</div>';
      return;
    }
    list.innerHTML = hist.map(function(h, i) {
      return '<div class="wp-hist-item" onclick="wpRestoreDoc(' + i + ')">' +
        '<button class="wp-hist-del" onclick="event.stopPropagation();wpDeleteHistory(' + i + ')" title="Remove">✕</button>' +
        '<div class="wp-hist-title">' + escHtml(h.title || 'Untitled') + '</div>' +
        '<div class="wp-hist-meta">🕐 ' + escHtml(h.date || '') + '</div>' +
      '</div>';
    }).join('');
  }

  window.wpRestoreDoc = function(index) {
    var hist = []; try { hist = JSON.parse(localStorage.getItem(WP_HIST_KEY) || '[]'); } catch(e) {}
    var item = hist[index]; if (!item) return;
    if (wpGetFullContent().replace(/<[^>]+>/g,'').trim().length > 50) {
      if (!confirm('Restore "' + item.title + '"? Current content will be replaced.')) return;
    }
    wpLoadContent(item.content);
    wpSwitchTab('format');
    wpSetStatus('Document restored: ' + item.title);
  };
  window.wpDeleteHistory = function(index) {
    var hist = []; try { hist = JSON.parse(localStorage.getItem(WP_HIST_KEY) || '[]'); } catch(e) {}
    hist.splice(index, 1);
    localStorage.setItem(WP_HIST_KEY, JSON.stringify(hist));
    wpRenderHistory();
  };
  window.wpShowCellColorModal = function() { wpShowModal('wp-cell-color-modal'); };
  window.wpClearHistory = function() {
    if (!confirm('Clear all document history?')) return;
    localStorage.removeItem(WP_HIST_KEY); wpRenderHistory();
  };

  /* ── Multi-page engine ──────────────────────────────────────── */
  function wpRenderPages(skipSave) {
    var container = document.getElementById('wp-pages');
    if (!container) return;

    // Save current page content first (skip when loading fresh content to avoid overwriting)
    if (!skipSave) {
      var activeEd = document.getElementById('wp-editor-' + wpCurrentPage);
      if (activeEd) wpPages[wpCurrentPage] = activeEd.innerHTML;
    }

    var paperVal = getV('tb-paper', 'a4');
    var hf  = getV('wp-hfont', 'Georgia, serif');
    var bf  = getV('wp-bfont', 'Georgia, serif');
    var h1  = getV('wp-h1', 24); var h2 = getV('wp-h2', 18); var h3 = getV('wp-h3', 14);
    var bd  = getV('wp-body', 12); var mg = getV('wp-margin', 20); var lh = getV('wp-lh', '1.6');

    container.innerHTML = '';
    wpPages.forEach(function(content, i) {
      var pageDiv = document.createElement('div');
      pageDiv.className = 'wp-page wp-page-item sz-' + paperVal;
      pageDiv.id = 'wp-page-' + i;
      pageDiv.style.setProperty('--wp-hfont', hf);
      pageDiv.style.setProperty('--wp-bfont', bf);
      pageDiv.style.setProperty('--wp-h1',    h1 + 'pt');
      pageDiv.style.setProperty('--wp-h2',    h2 + 'pt');
      pageDiv.style.setProperty('--wp-h3',    h3 + 'pt');
      pageDiv.style.setProperty('--wp-h4',    Math.round(Number(bd) * 1.1) + 'pt');
      pageDiv.style.setProperty('--wp-bsize', bd + 'pt');
      pageDiv.style.setProperty('--wp-lh',    lh);
      pageDiv.style.padding = mg + 'mm';

      var edDiv = document.createElement('div');
      edDiv.id = 'wp-editor-' + i;
      edDiv.setAttribute('data-editor-index', i);
      edDiv.contentEditable = 'true';
      edDiv.spellcheck = true;
      edDiv.className = 'wp-page-editor';
      edDiv.setAttribute('data-placeholder', i === 0
        ? 'Your document will appear here. Paste text and click Format with AI, or start typing…'
        : 'Page ' + (i + 1) + ' — continue your document here…');
      edDiv.innerHTML = content || '';

      (function(idx, ed) {
        ed.addEventListener('focus', function() {
          wpCurrentPage = idx;
          wpUpdatePageNav();
          wpUpdateToolbarState();
          document.querySelectorAll('.wp-page-item').forEach(function(pg){ pg.classList.remove('active'); });
          pageDiv.classList.add('active');
        });
        ed.addEventListener('input', function() {
          wpPages[idx] = ed.innerHTML;
          wpUpdateToolbarState();
          wpUpdateStats();
          wpScheduleFullReflow();
        });
        ed.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            /* Trigger reflow immediately after the browser inserts the new block */
            setTimeout(wpRunFullReflow, 0);
          }
        });
        ed.addEventListener('mouseup', wpUpdateToolbarState);
        ed.addEventListener('keyup', wpUpdateToolbarState);
        ed.addEventListener('paste', function(e) {
          // Handle image paste
          var items = e.clipboardData && e.clipboardData.items;
          if (!items) return;
          for (var i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
              e.preventDefault();
              var file = items[i].getAsFile();
              var reader = new FileReader();
              reader.onload = function(ev){ wpInsertImageSrc(ev.target.result, 'pasted-image'); };
              reader.readAsDataURL(file);
              return;
            }
          }
        });
      })(i, edDiv);

      pageDiv.appendChild(edDiv);
      wpAddColResizeHandles(edDiv);
      wpSetupImageHandlers(edDiv);

      var footer = document.createElement('div');
      footer.className = 'wp-page-footer';
      footer.dataset.page = i + 1; footer.dataset.total = wpPages.length;
      footer.textContent = wpShowLabels ? 'Page ' + (i + 1) + ' of ' + wpPages.length : String(i + 1);
      pageDiv.appendChild(footer);
      container.appendChild(pageDiv);
    });

    wpUpdatePageNav();
    wpUpdateStats();
    /* Apply default doc settings so pages show proper margins/font by default */
    setTimeout(function() {
      if (typeof wpGetDocSettings === 'function' && typeof wpApplyDocSettings === 'function') {
        wpApplyDocSettings(wpGetDocSettings());
      }
    }, 80);
  }

  function wpSavePageState() {
    var activeEd = document.getElementById('wp-editor-' + wpCurrentPage);
    if (activeEd) { wpPages[wpCurrentPage] = activeEd.innerHTML; wpUpdateStats(); }
  }

  function wpUpdatePageNav() {
    var t   = wpPages.length;
    var ind = document.getElementById('wp-page-indicator');
    var p   = document.getElementById('wp-prev-btn');
    var n   = document.getElementById('wp-next-btn');
    var pcEl= document.getElementById('tb-page-count');
    if (ind) ind.textContent = 'Page ' + (wpCurrentPage + 1) + ' of ' + t;
    if (p)   p.disabled = wpCurrentPage === 0;
    if (n)   n.disabled = wpCurrentPage >= t - 1;
    var sbp = document.getElementById('wp-sb-pages'); if(sbp) sbp.textContent = t;
  }

  window.wpNavPage = function(d) {
    var newPage = wpCurrentPage + d;
    if (newPage < 0 || newPage >= wpPages.length) return;
    wpSavePageState();
    wpCurrentPage = newPage;
    var target = document.getElementById('wp-page-' + wpCurrentPage);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(function() {
      var ed = document.getElementById('wp-editor-' + wpCurrentPage); if (ed) ed.focus();
    }, 300);
    wpUpdatePageNav();
  };

  /* ── Push one or more elements to the top of the next page ────── */
  /* ════════════════════════════════════════════════════════════════
     BIDIRECTIONAL PAGINATION ENGINE
     — overflow:  push content forward to next page
     — backflow:  pull content back when a page has space (like Word)
     — runs synchronously to stable state on every edit
     ════════════════════════════════════════════════════════════════ */
  var WP_OVERFLOW_BUF = 4; /* px tolerance */

  function wpScheduleFullReflow() {
    clearTimeout(wpReflowTimer);
    wpReflowTimer = setTimeout(wpRunFullReflow, 150);
  }
  /* Keep old alias so any remaining callers still work */
  function wpScheduleReflow() { wpScheduleFullReflow(); }

  function wpRunFullReflow() {
    var MAX_ITER = 80;
    var anythingChanged = false;

    for (var iter = 0; iter < MAX_ITER; iter++) {
      var changed = false;

      /* Safety cap: if pages explode (clientHeight=0 race condition) stop early */
      if (wpPages.length > 60) break;

      /* ── Forward pass: push overflow to next page ── */
      for (var pi = 0; pi < wpPages.length; pi++) {
        var ed = document.getElementById('wp-editor-' + pi);
        if (!ed) continue;
        if (ed.clientHeight <= 0) continue; /* editor not yet laid out — skip to avoid runaway */
        if (ed.scrollHeight > ed.clientHeight + WP_OVERFLOW_BUF) {
          if (_wpPushOverflow(pi, ed)) { changed = true; break; }
        }
      }
      if (changed) { anythingChanged = true; continue; }

      /* ── Backward pass: pull underflow back from next page ── */
      for (var pi2 = 0; pi2 < wpPages.length - 1; pi2++) {
        var ed2 = document.getElementById('wp-editor-' + pi2);
        var ned = document.getElementById('wp-editor-' + (pi2 + 1));
        if (!ed2 || !ned) continue;
        if (ed2.clientHeight <= 0) continue; /* not laid out yet */
        if (_wpPullUnderflow(pi2, ed2, ned)) { changed = true; break; }
      }
      if (changed) { anythingChanged = true; continue; }

      /* ── Heading-orphan pass: push a lone heading at the bottom of a page
             forward so it stays with its following content (like Word's
             "Keep with next" paragraph setting) ── */
      for (var pi3 = 0; pi3 < wpPages.length - 1; pi3++) {
        var ed3 = document.getElementById('wp-editor-' + pi3);
        if (!ed3 || ed3.children.length < 2) continue; /* need at least 2 children */
        var lastEl3 = ed3.lastElementChild;
        if (!lastEl3) continue;
        var t3 = lastEl3.tagName && lastEl3.tagName.toUpperCase();
        if (t3 !== 'H1' && t3 !== 'H2' && t3 !== 'H3') continue;
        /* Lone heading at page bottom — push to next page */
        ed3.removeChild(lastEl3);
        wpPages[pi3] = ed3.innerHTML;
        var ned3 = document.getElementById('wp-editor-' + (pi3 + 1));
        if (ned3) {
          ned3.insertBefore(lastEl3, ned3.firstChild || null);
          wpPages[pi3 + 1] = ned3.innerHTML;
        } else if (true) { /* no page limit */
          wpPages.splice(pi3 + 1, 0, lastEl3.outerHTML || '');
          wpRenderPages(true);
        } else {
          ed3.appendChild(lastEl3); wpPages[pi3] = ed3.innerHTML; /* nowhere to put it */
          continue;
        }
        changed = true; break;
      }
      if (changed) { anythingChanged = true; continue; }

      break; /* stable */
    }

    if (anythingChanged) {
      _wpCleanEmptyPages();
      wpUpdatePageNav();
      wpUpdateStats();
    }
  }

  /* Push the overflowing tail of page `pi` to page `pi+1`.
     Returns true if anything was moved. */
  function _wpPushOverflow(pi, ed) {
    var maxH = ed.clientHeight;
    if (ed.scrollHeight <= maxH + WP_OVERFLOW_BUF) return false;

    var lastEl = ed.lastElementChild;
    if (!lastEl) return false;
    var blockToMove = null;

    if (ed.children.length >= 2) {
      /* Multiple blocks: move the last block */
      ed.removeChild(lastEl);
      blockToMove = lastEl;
    } else {
      /* Single child only */
      var isEmpty = !lastEl.textContent.trim() ||
                    lastEl.innerHTML.replace(/&nbsp;/gi, '').trim() === '' ||
                    lastEl.innerHTML.trim() === '<br>';
      if (isEmpty) {
        ed.removeChild(lastEl);
        blockToMove = lastEl;
      } else if (lastEl.childNodes.length > 1) {
        /* Multiple inline children — peel from the end */
        var moved = [];
        while (lastEl.childNodes.length > 1 && ed.scrollHeight > maxH + WP_OVERFLOW_BUF) {
          var ln = lastEl.lastChild;
          moved.unshift(ln.cloneNode(true));
          lastEl.removeChild(ln);
        }
        if (moved.length) {
          var wrapper = document.createElement(lastEl.tagName.toLowerCase());
          moved.forEach(function(n) { wrapper.appendChild(n); });
          blockToMove = wrapper;
        }
      } else {
        /* Single text node in a single block: binary-search word split */
        var textEl = ed.firstElementChild || ed;
        var full   = textEl.textContent || '';
        if (!full) return false;
        var words  = full.split(/(\s+)/);
        if (words.length <= 2) return false;
        var lo = 1, hi = words.length - 1;
        while (lo < hi) {
          var mid = Math.floor((lo + hi + 1) / 2);
          textEl.textContent = words.slice(0, mid).join('');
          if (ed.scrollHeight <= maxH + WP_OVERFLOW_BUF) { lo = mid; } else { hi = mid - 1; }
        }
        var keepT = words.slice(0, lo).join('');
        var overT = words.slice(lo).join('').trim();
        if (!keepT || !overT) { textEl.textContent = full; return false; }
        textEl.textContent = keepT;
        var overEl = document.createElement((textEl.tagName || 'P').toLowerCase());
        overEl.textContent = overT;
        blockToMove = overEl;
      }
    }

    if (!blockToMove) return false;
    wpPages[pi] = ed.innerHTML;

    /* Insert into existing next page */
    if (pi + 1 < wpPages.length) {
      var nextEd = document.getElementById('wp-editor-' + (pi + 1));
      if (nextEd) {
        nextEd.insertBefore(blockToMove, nextEd.firstChild || null);
        wpPages[pi + 1] = nextEd.innerHTML;
        return true;
      }
    }
    /* Create a new page */
    /* page limit removed */
    wpPages.splice(pi + 1, 0, blockToMove.outerHTML || '');
    wpRenderPages(true);
    return true;
  }

  /* Pull the first block of page `pi+1` back to page `pi` if it fits.
     This is the "backflow" behaviour — like Word pulling content up on delete.
     Returns true if anything was moved. */
  function _wpPullUnderflow(pi, ed, nextEd) {
    var firstBlock = nextEd.firstElementChild;
    if (!firstBlock) return false;

    /* Keep-heading-with-next: never pull a heading back to the previous page.
       Headings belong at the TOP of their following content, not orphaned
       at the bottom of the page before. */
    var fTag = firstBlock.tagName && firstBlock.tagName.toUpperCase();
    if (fTag === 'H1' || fTag === 'H2' || fTag === 'H3') return false;

    /* Measure with a clone to avoid mutating the DOM */
    var clone = firstBlock.cloneNode(true);
    ed.appendChild(clone);
    var fits = ed.scrollHeight <= Math.max(ed.clientHeight, 800) + WP_OVERFLOW_BUF;
    ed.removeChild(clone);
    if (!fits) return false;

    /* Fits — move the real element */
    nextEd.removeChild(firstBlock);
    ed.appendChild(firstBlock);
    wpPages[pi]     = ed.innerHTML;
    wpPages[pi + 1] = nextEd.innerHTML;
    return true;
  }

  /* Remove trailing pages that are fully empty (always keep at least 1) */
  function _wpCleanEmptyPages() {
    var changed = false;
    for (var pi = wpPages.length - 1; pi > 0; pi--) {
      var ed = document.getElementById('wp-editor-' + pi);
      var hasContent = ed
        ? (ed.textContent.trim() || ed.querySelector('img,table,hr'))
        : wpPages[pi].trim();
      if (!hasContent) {
        wpPages.splice(pi, 1);
        changed = true;
      }
    }
    if (changed) wpRenderPages(true);
  }


  window.wpAddPage = function() {
    wpSavePageState();
    wpPages.splice(wpCurrentPage + 1, 0, '');
    wpCurrentPage++;
    wpRenderPages();
    setTimeout(function() {
      var target = document.getElementById('wp-page-' + wpCurrentPage);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var ed = document.getElementById('wp-editor-' + wpCurrentPage); if (ed) ed.focus();
    }, 100);
    wpSetStatus('New page added');
  };

  window.wpSetPageCount = function(n) {
    n = Math.max(1, Math.min(n, MAX_PAGES));
    wpSavePageState();
    while (wpPages.length < n) wpPages.push('');
    while (wpPages.length > n && wpPages.length > 1) wpPages.pop();
    wpCurrentPage = Math.min(wpCurrentPage, wpPages.length - 1);
    wpRenderPages();
    var pcEl = document.getElementById('tb-page-count'); if(pcEl) pcEl.value = String(n);
  };

  window.wpTogglePageLabels = function() {
    wpShowLabels = !wpShowLabels;
    var btn = document.getElementById('tb-pagelabel');
    if (btn) { btn.classList.toggle('on', wpShowLabels); }
    document.querySelectorAll('.wp-page-footer').forEach(function(f) {
      var pg = parseInt(f.dataset.page || '1'), tot = parseInt(f.dataset.total || '1');
      f.textContent = wpShowLabels ? 'Page ' + pg + ' of ' + tot : String(pg);
    });
  };

  function wpSplitIntoPages(html) {
    var tmp = document.createElement('div'); tmp.innerHTML = html;
    var blocks = Array.from(tmp.childNodes).filter(function(n){ return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()); });
    var pages = [], cur = '', curC = 0;
    blocks.forEach(function(b) {
      var bh = b.outerHTML || ('<p>' + b.textContent + '</p>');
      var bl = (b.textContent || '').length;
      /* Only break at H1 if there's already substantial content (800+ chars)
         so headings don't get pushed to a new page prematurely */
      var isH1 = b.tagName === 'H1';
      if ((isH1 && curC > 800) || (curC + bl > PAGE_CHAR_LIMIT && curC > 0)) {
        pages.push(cur); cur = bh; curC = bl;
      } else { cur += bh; curC += bl; }
    });
    if (cur) pages.push(cur);
    return pages.length ? pages : [''];
  }

  function wpLoadContent(html) {
    wpPages = wpSplitIntoPages(html);
    wpCurrentPage = 0;
    wpRenderPages(true); /* skipSave=true: don't overwrite freshly-split content */
    var pcEl = document.getElementById('tb-page-count');
    if (pcEl) pcEl.value = String(Math.min(wpPages.length, MAX_PAGES));
    setTimeout(function() {
      var pagesArea = document.getElementById('wp-pages'); if(pagesArea) pagesArea.scrollTop = 0;
      var ed = document.getElementById('wp-editor-0'); if(ed) { wpAddColResizeHandles(ed); wpSetupImageHandlers(ed); }
    }, 100);
    wpUpdateStats();
    /* Schedule overflow reflow so content that doesn't fit flows to next pages */
    wpScheduleReflow();
  }

  function wpGetFullContent() {
    wpSavePageState();
    return wpPages.join('');
  }

  /* ── Document stats ─────────────────────────────────────────── */
  window.wpUpdateStats = function() {
    var fullText = wpPages.map(function(p, i) {
      var ed = document.getElementById('wp-editor-' + i);
      return ed ? (ed.innerText || '') : p.replace(/<[^>]+>/g,'');
    }).join(' ');
    var words = fullText.trim() ? fullText.trim().split(/\s+/).filter(Boolean).length : 0;
    var chars = fullText.length;
    var paras = 0;
    document.querySelectorAll('.wp-page-editor').forEach(function(ed) {
      paras += ed.querySelectorAll('p,h1,h2,h3,h4').length;
    });
    paras = Math.max(paras, 1);
    var readMin = Math.max(1, Math.round(words / 200));

    var sbw = document.getElementById('wp-sb-words'); if(sbw) sbw.textContent = words.toLocaleString();
    var sbc = document.getElementById('wp-sb-chars'); if(sbc) sbc.textContent = chars.toLocaleString();
    var sbp = document.getElementById('wp-sb-pages'); if(sbp) sbp.textContent = wpPages.length;
    var sbr = document.getElementById('wp-sb-read');  if(sbr) sbr.textContent = readMin + ' min';

    var sec = document.getElementById('wp-stats-sec');
    var st  = document.getElementById('wp-stats');
    if (sec) sec.style.display = '';
    if (st) st.innerHTML =
      '<span style="background:#e0f2fe;border-radius:4px;padding:2px 7px;font-size:11px;color:#0369a1;font-weight:600;">' + words.toLocaleString() + ' words</span>' +
      '<span style="background:#f0fdf4;border-radius:4px;padding:2px 7px;font-size:11px;color:#15803d;font-weight:600;">' + chars.toLocaleString() + ' chars</span>' +
      '<span style="background:#fef3c7;border-radius:4px;padding:2px 7px;font-size:11px;color:#92400e;font-weight:600;">' + paras + ' paras</span>' +
      '<span style="background:#f5f3ff;border-radius:4px;padding:2px 7px;font-size:11px;color:#6d28d9;font-weight:600;">~' + readMin + ' min read</span>';
  };

  function wpSetStatus(msg) {
    var el = document.getElementById('wp-sb-msg'); if (!el) return;
    el.textContent = msg;
    setTimeout(function(){ if(el.textContent === msg) el.textContent = ''; }, 4000);
  }

  /* ── Print / Export — Format Picker + Preview ───────────────── */
  var _wpPrintFormat = 'pdf';

  window.wpPrint = function() {
    wpShowPrintFormatModal();
  };

  window.wpShowPrintFormatModal = function() {
    wpShowModal('wp-print-fmt-modal');
  };

  window.wpSelectPrintFormat = function(fmt) {
    _wpPrintFormat = fmt;
    wpHideModal('wp-print-fmt-modal');
    wpShowPrintPreview(fmt);
  };

  window.wpShowPrintPreview = function(fmt) {
    var content = wpGetFullContent();
    var title   = wpGetDocTitle(content);
    var previewEl = document.getElementById('wp-print-preview-body');
    var badgeEl   = document.getElementById('wp-preview-fmt-badge');
    var dlBtn     = document.getElementById('wp-preview-dl-btn');
    if (!previewEl) return;

    var fmtLabels = {
      pdf:'📄 PDF', csv:'📊 Excel / CSV',
      html:'🌐 HTML', txt:'📃 Plain Text', rtf:'📄 RTF',
      md:'📋 Markdown', latex:'Σ LaTeX', json:'{ } JSON'
    };
    if (badgeEl) badgeEl.textContent = fmtLabels[fmt] || fmt.toUpperCase();
    if (dlBtn) dlBtn.textContent = '⬇️ Download ' + (fmtLabels[fmt] || fmt.toUpperCase());

    /* Build a clean print preview of the document */
    var pageStyle = (function() {
      var mg = getV('wp-margin', 20);
      var bf = getV('wp-bfont', 'Georgia, serif');
      var bd = getV('wp-body', 12);
      var lh = getV('wp-lh', '1.6');
      var h1 = getV('wp-h1', 24); var h2 = getV('wp-h2', 18); var h3 = getV('wp-h3', 14);
      return 'font-family:' + bf + ';font-size:' + bd + 'pt;line-height:' + lh + ';' +
             '--h1-size:' + h1 + 'pt;--h2-size:' + h2 + 'pt;--h3-size:' + h3 + 'pt;';
    })();

    previewEl.innerHTML = '';
    var notice = document.createElement('div');
    notice.style.cssText = 'margin-bottom:14px;padding:9px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:12px;color:#0369a1;font-weight:600;';
    notice.textContent = '📄 Document: "' + title + '" · Format: ' + (fmtLabels[fmt] || fmt.toUpperCase()) + ' · ' + wpPages.length + ' page(s)';
    previewEl.appendChild(notice);

    /* Save ALL editor states before building preview */
    var _previewContainer = document.getElementById('wp-pages');
    if (_previewContainer) {
      _previewContainer.querySelectorAll('.wp-page-editor').forEach(function(ed) {
        var _m = ed.id.match(/wp-editor-(\d+)/);
        if (_m) wpPages[parseInt(_m[1], 10)] = ed.innerHTML;
      });
    }
    /* Collect all non-empty pages */
    var _printPages = wpPages.filter(function(pg) {
      if (!pg) return false;
      return pg.replace(/<[^>]+>/g,'').trim().length > 0 || /<img|<canvas|<table|<svg/i.test(pg);
    });
    if (!_printPages.length) _printPages = [wpPages[wpCurrentPage] || ''];

    _printPages.forEach(function(pgHtml, idx) {
      var pageWrap = document.createElement('div');
      pageWrap.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:20px;' +
        'box-shadow:0 2px 10px rgba(0,0,0,.08);position:relative;overflow:hidden;';
      var pageLabel = document.createElement('div');
      pageLabel.style.cssText = 'background:#f8f9ff;border-bottom:1px solid #e2e8f0;padding:6px 14px;font-size:10.5px;color:#6b7280;font-weight:700;';
      pageLabel.textContent = 'Page ' + (idx + 1) + ' of ' + _printPages.length;
      var pageContent = document.createElement('div');
      pageContent.style.cssText = 'padding:24px 28px;' + pageStyle;
      /* Parse + clean HTML so raw tags never show as text */
      var cleanHtml = (function(raw) {
        if (!raw) return '';
        try {
          var parsed = (new DOMParser()).parseFromString(raw, 'text/html');
          var body = parsed.body;
          /* Strip editor-only attributes that can confuse rendering */
          body.querySelectorAll('[contenteditable]').forEach(function(el){ el.removeAttribute('contenteditable'); });
          body.querySelectorAll('[data-gramm],[data-gramm_editor],[data-enable-grammarly]').forEach(function(el){
            ['data-gramm','data-gramm_editor','data-enable-grammarly'].forEach(function(a){ el.removeAttribute(a); });
          });
          return body.innerHTML;
        } catch(e) { return raw; }
      })(pgHtml);
      pageContent.innerHTML = cleanHtml || '<em style="color:#9ca3af;">Empty page</em>';
      /* Apply inline heading sizes */
      pageContent.querySelectorAll('h1').forEach(function(h){ h.style.fontSize = getV('wp-h1',24) + 'pt'; });
      pageContent.querySelectorAll('h2').forEach(function(h){ h.style.fontSize = getV('wp-h2',18) + 'pt'; });
      pageContent.querySelectorAll('h3').forEach(function(h){ h.style.fontSize = getV('wp-h3',14) + 'pt'; });
      /* Make tables look clean */
      pageContent.querySelectorAll('table').forEach(function(t){
        t.style.cssText = 'border-collapse:collapse;width:100%;margin:10px 0;font-size:11pt;';
      });
      pageContent.querySelectorAll('td,th').forEach(function(c){
        c.style.border = '1px solid #d1d5db';
        c.style.padding = '6px 10px';
      });
      pageWrap.appendChild(pageLabel);
      pageWrap.appendChild(pageContent);
      previewEl.appendChild(pageWrap);
    });

    wpShowModal('wp-print-preview-modal');
  };

  /* ── Open a self-contained download/print page in Chrome (Capacitor Browser).
     Same pattern as the quiz's aqsPrintQuiz — build complete HTML, open it in
     the system browser where print/download APIs work reliably.
     On desktop web browsers the page opens in a new window as usual. ── */

  window.wpConfirmPrintDownload = function() {
    var fmt = _wpPrintFormat;
    wpHideModal('wp-print-preview-modal');

    var content  = wpGetFullContent();
    var title    = wpGetDocTitle(content);
    var fname    = wpSafeName(title);
    var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

    /* ── Shared document styles ── */
    var bf   = getV('wp-bfont','Georgia, serif');
    var bd   = getV('wp-body', 12);
    var mg   = getV('wp-margin', 20);
    var lh   = getV('wp-lh', '1.6');
    var h1sz = getV('wp-h1',24); var h2sz = getV('wp-h2',18); var h3sz = getV('wp-h3',14);
    var docCss = [
      'body{font-family:' + bf + ';font-size:' + bd + 'pt;line-height:' + lh + ';margin:0;color:#1a1a1a;}',
      'h1{font-size:' + h1sz + 'pt;margin:.5em 0;}',
      'h2{font-size:' + h2sz + 'pt;margin:.45em 0;}',
      'h3{font-size:' + h3sz + 'pt;margin:.4em 0;}',
      'p{margin:.5em 0;}',
      'table{border-collapse:collapse;width:100%;margin:10px 0;}',
      'td,th{border:1px solid #ccc;padding:6px 10px;}',
      'th{background:#f1f5f9;font-weight:700;}',
      'img{max-width:100%;height:auto;}',
      'blockquote{border-left:3px solid #6366f1;padding-left:12px;color:#4b5563;font-style:italic;margin:10px 0;}',
      'pre{background:#1e293b;color:#e2e8f0;padding:12px;border-radius:6px;font-size:10pt;white-space:pre-wrap;}',
      '@media print{@page{margin:' + mg + 'mm;}}'
    ].join('');

    /* Save ALL editor states before building download */
    var _dlContainer = document.getElementById('wp-pages');
    if (_dlContainer) {
      _dlContainer.querySelectorAll('.wp-page-editor').forEach(function(ed) {
        var _m = ed.id.match(/wp-editor-(\d+)/);
        if (_m) wpPages[parseInt(_m[1], 10)] = ed.innerHTML;
      });
    }
    /* Collect all non-empty pages */
    var _nonEmptyPages = wpPages.filter(function(pg) {
      if (!pg) return false;
      return pg.replace(/<[^>]+>/g,'').trim().length > 0 || /<img|<canvas|<table|<svg/i.test(pg);
    });
    if (!_nonEmptyPages.length) _nonEmptyPages = [wpPages[wpCurrentPage] || ''];
    var allPages = _nonEmptyPages.map(function(pg, i) {
      return '<div style="margin-bottom:24px;' +
        (i < _nonEmptyPages.length - 1 ? 'padding-bottom:24px;border-bottom:2px dashed #e5e7eb;' : '') +
        '">' + (pg || '') + '</div>';
    }).join('');

    /* ── Build the self-contained page ── */
    function buildPage(opts) {
      /* opts: { subtitle, btnLabel, isPdf, fileB64, fileMime, fileName } */
      var downloadFn;
      if (opts.isPdf) {
        downloadFn = 'function doDownload(){window.print();}';
      } else {
        downloadFn = [
          'var _b=' + JSON.stringify(opts.fileB64 || '') + ';',
          'var _m=' + JSON.stringify(opts.fileMime || 'text/plain') + ';',
          'var _n=' + JSON.stringify(opts.fileName || 'document') + ';',
          'function doDownload(){',
          '  var a=document.createElement("a");',
          '  a.href="data:"+_m+";base64,"+_b;',
          '  a.download=_n;',
          '  document.body.appendChild(a);',
          '  a.click();',
          '  setTimeout(function(){a.remove();},600);',
          '}'
        ].join('');
      }
      var scriptBlock = [
        downloadFn,
        'function doYes(){',
        '  document.getElementById("dl-overlay").style.display="none";',
        '  doDownload();',
        '}',
        'function doNo(){',
        '  try{ window.close(); }catch(e){}',
        '  setTimeout(function(){',
        '    document.getElementById("dl-overlay").style.display="none";',
        '  }, 200);',
        '}',
        'window.addEventListener("load",function(){',
        '  document.getElementById("dl-overlay").style.display="flex";',
        '});'
      ].join('');
      return [
        '<!DOCTYPE html><html><head>',
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        '<title>' + escHtml(title) + '</title>',
        '<style>',
        '*{box-sizing:border-box;}',
        'body{margin:0;background:#f1f5f9;font-family:Georgia,serif;}',
        /* document content */
        '.doc-wrap{max-width:840px;margin:24px auto 40px;background:#fff;',
        '  padding:32px 24px;border-radius:12px;',
        '  box-shadow:0 1px 6px rgba(0,0,0,.08);}',
        docCss,
        /* modal overlay */
        '#dl-overlay{display:none;position:fixed;inset:0;z-index:99999;',
        '  background:rgba(15,23,42,.55);',
        '  align-items:center;justify-content:center;padding:20px;}',
        '.dl-card{background:#fff;border-radius:20px;padding:28px 24px;',
        '  max-width:340px;width:100%;text-align:center;',
        '  box-shadow:0 12px 40px rgba(0,0,0,.25);}',
        '.dl-icon{font-size:40px;margin-bottom:10px;}',
        '.dl-title{margin:0 0 4px;font-size:19px;font-weight:700;color:#1e293b;}',
        '.dl-fname{margin:0 0 6px;font-size:13px;color:#6366f1;font-weight:600;',
        '  word-break:break-all;}',
        '.dl-hint{margin:0 0 22px;font-size:13px;color:#94a3b8;}',
        '.dl-yes{width:100%;background:#4f46e5;color:#fff;border:none;',
        '  border-radius:14px;padding:16px;font-size:16px;font-weight:700;',
        '  cursor:pointer;margin-bottom:10px;letter-spacing:.3px;}',
        '.dl-yes:active{background:#4338ca;}',
        '.dl-no{width:100%;background:#f1f5f9;color:#64748b;border:none;',
        '  border-radius:14px;padding:13px;font-size:14px;cursor:pointer;}',
        '.dl-no:active{background:#e2e8f0;}',
        '@media print{',
        '  #dl-overlay{display:none!important;}',
        '  body{background:#fff;}',
        '  .doc-wrap{margin:0;padding:0;box-shadow:none;border-radius:0;}',
        '}',
        '</style>',
        '</head><body>',
        /* popup */
        '<div id="dl-overlay">',
        '  <div class="dl-card">',
        '    <div class="dl-icon">' + (opts.isPdf ? '🖨️' : '📥') + '</div>',
        '    <p class="dl-title">Continue to download?</p>',
        '    <p class="dl-fname">' + escHtml(opts.fileName || (title + (opts.isPdf ? '.pdf' : ''))) + '</p>',
        '    <p class="dl-hint">' + escHtml(opts.subtitle) + '</p>',
        '    <button class="dl-yes" onclick="doYes()">✅ Yes, Download</button>',
        '    <button class="dl-no" onclick="doNo()">✕ No, Go Back</button>',
        '  </div>',
        '</div>',
        /* document preview */
        '<div class="doc-wrap">',
        allPages,
        '</div>',
        '<script>' + scriptBlock + '<\/script>',
        '</body></html>'
      ].join('\n');
    }

    /* ── Open page: Capacitor Browser on native, window.open on web ── */
    function openPage(pageHtml) {
        /* ── PDF: wp-print-root + window.print() ────────────────────────────
           Same approach as Google Docs / Canva / Notion.
           Works on desktop, mobile browser, AND Capacitor WebView
           (Android WebView fires Android Print Service via window.print()).
           No external Chrome, no iframes, no popups needed for PDF. ── */
        if (fmt === 'pdf') {
          var printRoot = document.getElementById('wp-print-root');
          var printStyleEl = document.getElementById('_wp_dl_print_style');
          if (!printStyleEl) {
            printStyleEl = document.createElement('style');
            printStyleEl.id = '_wp_dl_print_style';
            document.head.appendChild(printStyleEl);
          }
          printStyleEl.textContent = docCss +
            '@media print{body{background:#fff!important;}' +
            '.doc-wrap{margin:0!important;padding:0!important;box-shadow:none!important;border-radius:0!important;}' +
            '.wp-print-pg{page-break-after:always;break-after:page;}' +
            '.wp-print-pg:last-child{page-break-after:avoid;break-after:avoid;}}';
          if (printRoot) {
            /* Use full content as one continuous document — proper pagination, no dashed page borders */
            var _pdfFull = (typeof wpGetFullContent === 'function') ? wpGetFullContent() : allPages;
            printRoot.innerHTML = '<div class="doc-wrap" style="font-family:'+bf+';font-size:'+bd+'pt;line-height:'+lh+';color:#1a1a1a;">' + _pdfFull + '</div>';
            printRoot.style.display = 'block';
            setTimeout(function() {
              window.print();
              setTimeout(function() {
                printRoot.style.display = 'none';
                printRoot.innerHTML = '';
                if (printStyleEl && printStyleEl.parentNode) {
                  printStyleEl.parentNode.removeChild(printStyleEl);
                }
              }, 1500);
            }, 250);
          } else {
            window.print();
          }
          return;
        }

        /* ── Non-PDF formats: file download ─────────────────────────────── */
        if (isNative) {
          try {
            var jobData = {
              pages:    wpPages.slice(),
              fmt:      fmt,
              title:    title,
              settings: {
                bfont:  getV('wp-bfont',  'Georgia, serif'),
                body:   getV('wp-body',   12),
                margin: getV('wp-margin', 20),
                lh:     getV('wp-lh',     '1.6'),
                h1:     getV('wp-h1',     24),
                h2:     getV('wp-h2',     18),
                h3:     getV('wp-h3',     14)
              }
            };
            var encoded = btoa(unescape(encodeURIComponent(JSON.stringify(jobData))));
            var webUrl  = 'https://darapet.github.io/smartquiz-system/text-to-docs.html#printjob=' + encoded;
            var Browser = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
            if (Browser && Browser.open) {
              Browser.open({ url: webUrl });
              wpSetStatus('📄 Opening in browser — tap the button to download');
              return;
            }
          } catch(e) {}
          try {
            var f = new File([pageHtml], fname + '.html', { type: 'text/html' });
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [f] })) {
              navigator.share({ files: [f] }); return;
            }
          } catch(e2) {}
        }
        var win = window.open('', '_blank', 'width=900,height=700');
        if (win) { win.document.write(pageHtml); win.document.close(); win.focus(); }
        else { alert('Pop-up blocked. Please allow pop-ups and try again.'); }
      }

    /* ── Format-specific handling ── */
    if (fmt === 'pdf') {
      openPage(buildPage({
        subtitle: 'Tap to open the print dialog — choose "Save as PDF"',
        btnLabel: '🖨️ Print / Save as PDF',
        isPdf: true
      }));

    } else {
      /* Text-based formats — convert synchronously */
      var textContent, fileMime, fileExt;
      if (fmt === 'html') {
        textContent = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escHtml(title) +
          '</title><style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6;color:#1a1a1a;}</style></head><body>' + content + '</body></html>';
        fileMime = 'text/html'; fileExt = 'html';
      } else if (fmt === 'txt')   { textContent = stripHtml(content);          fileMime = 'text/plain';        fileExt = 'txt'; }
      else if (fmt === 'md')      { textContent = htmlToMarkdown(content);      fileMime = 'text/markdown';     fileExt = 'md'; }
      else if (fmt === 'rtf')     { textContent = htmlToRTF(content, title);    fileMime = 'application/rtf';  fileExt = 'rtf'; }
      else if (fmt === 'latex')   { textContent = htmlToLaTeX(content, title);  fileMime = 'text/plain';        fileExt = 'tex'; }
      else if (fmt === 'json')    { textContent = htmlToJSON(content, title);   fileMime = 'application/json'; fileExt = 'json'; }
      else if (fmt === 'csv')     { textContent = htmlToCSV(content);           fileMime = 'text/csv';          fileExt = 'csv'; }
      else                        { textContent = stripHtml(content);           fileMime = 'text/plain';        fileExt = 'txt'; }

      /* On desktop web browsers, skip the page — blob download works fine */
      if (!isNative) {
        _wpBlobDownload(textContent, fname + '.' + fileExt, fileMime);
        wpSetStatus('Downloaded as ' + fileExt.toUpperCase() + ' ✅');
        return;
      }

      var fileB64 = btoa(unescape(encodeURIComponent(textContent)));
      openPage(buildPage({
        subtitle: 'Tap to download as ' + fileExt.toUpperCase(),
        btnLabel: '📥 Download ' + fileExt.toUpperCase(),
        isPdf: false,
        fileB64: fileB64,
        fileMime: fileMime,
        fileName: fname + '.' + fileExt
      }));
    }
  };

  /* ── New document ───────────────────────────────────────────── */
  window.wpNewDocument = function() {
    if (wpGetFullContent().replace(/<[^>]+>/g,'').trim().length > 50) {
      if (!confirm('Start a new document? Current content will be cleared.')) return;
    }
    wpPages = [''];  wpCurrentPage = 0;
    wpRenderPages();
    var src = document.getElementById('wp-source'); if(src) { src.value = ''; wpCharCount(); }
    wpSetStatus('New document created');
  };

  /* ── Downloads ──────────────────────────────────────────────── */
  window.wpDownload = function(format) {
    var content = wpGetFullContent();
    var title   = wpGetDocTitle(content);
    var fname   = wpSafeName(title);

    if (format === 'pdf') { wpShowPrintPreview('pdf'); return; }
    if (format === 'html') {
      var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escHtml(title) + '</title><style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6;color:#1a1a1a;}h1{font-size:24pt;}h2{font-size:18pt;}h3{font-size:14pt;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid #d1d5db;padding:6px 10px;}th{background:#f1f5f9;}</style></head><body>' + content + '</body></html>';
      wpSaveText(fullHtml, fname + '.html', 'text/html');
    } else if (format === 'txt') {
      wpSaveText(stripHtml(content), fname + '.txt', 'text/plain');
    } else if (format === 'md') {
      wpSaveText(htmlToMarkdown(content), fname + '.md', 'text/markdown');
    } else if (format === 'rtf') {
      wpSaveText(htmlToRTF(content, title), fname + '.rtf', 'application/rtf');
    } else if (format === 'latex') {
      wpSaveText(htmlToLaTeX(content, title), fname + '.tex', 'text/plain');
    } else if (format === 'json') {
      wpSaveText(htmlToJSON(content, title), fname + '.json', 'application/json');
    } else if (format === 'csv') {
      wpSaveText(htmlToCSV(content), fname + '.csv', 'text/csv');
    }
    wpSetStatus('Downloaded as ' + format.toUpperCase());
  };

  function wpDownloadPDF(content, title) {
    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
      // Fallback: iframe-based print (window.open shows about:blank in Capacitor WebView)
      var printHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escHtml(title) + '</title><style>body{font-family:Georgia,serif;margin:20mm;line-height:1.6;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid #ccc;padding:5px 8px;}@media print{body{margin:0;}}</style></head><body>' + content + '</body></html>';
      var old2 = document.getElementById('wp-print-iframe2');
      if (old2) old2.remove();
      var pf2 = document.createElement('iframe');
      pf2.id = 'wp-print-iframe2';
      pf2.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;visibility:hidden;';
      document.body.appendChild(pf2);
      pf2.contentDocument.open();
      pf2.contentDocument.write(printHtml);
      pf2.contentDocument.close();
      setTimeout(function(){ pf2.contentWindow.focus(); pf2.contentWindow.print(); setTimeout(function(){ pf2.remove(); }, 3000); }, 500);
      return;
    }
    // Try jsPDF with html2canvas — temporarily remove overflow so ALL pages are visible to the canvas
    var container = document.getElementById('wp-pages');
    if (!container) return;

    /* Save all editor states before capturing */
    container.querySelectorAll('.wp-page-editor').forEach(function(ed) {
      var m = ed.id.match(/wp-editor-(\d+)/);
      if (m) wpPages[parseInt(m[1], 10)] = ed.innerHTML;
    });

    /* Temporarily expand the container so html2canvas sees every page, not just the visible slice */
    var _savedOverflow  = container.style.overflow;
    var _savedOverflowY = container.style.overflowY;
    var _savedHeight    = container.style.height;
    var _savedMaxHeight = container.style.maxHeight;
    container.style.overflow  = 'visible';
    container.style.overflowY = 'visible';
    container.style.height    = 'auto';
    container.style.maxHeight = 'none';

    function _restoreContainer() {
      container.style.overflow  = _savedOverflow;
      container.style.overflowY = _savedOverflowY;
      container.style.height    = _savedHeight;
      container.style.maxHeight = _savedMaxHeight;
    }

    wpSetStatus('Generating PDF… (capturing all pages)');
    /* Small delay so the browser reflows the expanded container before capture */
    setTimeout(function() {
    html2canvas(container, { scale: 1.5, useCORS: true, allowTaint: true, scrollX: 0, scrollY: -window.pageYOffset }).then(function(canvas) {
      _restoreContainer();
      var imgData = canvas.toDataURL('image/jpeg', 0.85);
      var jsPDF = (window.jspdf || window.jsPDF || {}).jsPDF;
      if (!jsPDF) { alert('PDF library error. Try the Print button to save as PDF.'); return; }
      var pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      var pW = pdf.internal.pageSize.getWidth();
      var pH = pdf.internal.pageSize.getHeight();
      var imgH = (canvas.height * pW) / canvas.width;
      var y = 0;
      while (y < imgH) {
        if (y > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, -y, pW, imgH);
        y += pH;
      }
      pdf.save(wpSafeName(title) + '.pdf');
      wpSetStatus('PDF downloaded ✅');
    }).catch(function(e) {
      _restoreContainer();
      alert('PDF generation failed: ' + e.message + '\n\nTip: Use the Print button and select "Save as PDF".');
    });
    }, 80); /* end setTimeout — let browser reflow before capture */
  }

  function wpOpenInChrome(dataUri, filename) {
    var Browser = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
    if (Browser && Browser.open) {
      Browser.open({ url: dataUri, presentationStyle: 'fullscreen' });
      var toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:11px 20px;border-radius:22px;font-size:13px;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,.35);max-width:290px;text-align:center;line-height:1.4;';
      toast.innerHTML = '📥 Chrome opened!<br><span style="font-size:11px;opacity:.8;">Tap <b>⋮ → Download</b> or <b>Share → Save to Files</b></span>';
      document.body.appendChild(toast);
      setTimeout(function(){ toast.remove(); }, 5000);
      wpSetStatus('📥 Opened in Chrome — tap ⋮ → Download');
      return true;
    }
    return false;
  }

  /* ── Blob download helpers (text content and binary blob) ── */
  function _wpBlobDownload(content, filename, mimeType) {
    /* Standard anchor-click blob download — works in web browsers.
       NOTE: on Android Capacitor WebView the download attribute is silently
       ignored — callers should prefer wpSaveText() which has proper fallbacks. */
    try {
      var b = new Blob([content], { type: mimeType });
      var u = URL.createObjectURL(b);
      var a = document.createElement('a');
      a.href = u; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(u); }, 1000);
    } catch(err) { /* silent */ }
  }
  function _wpBlobDownload2(blob, filename) {
    try {
      var u = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = u; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(u); }, 1000);
    } catch(err) { /* silent */ }
  }

  /* ── Open file content as a base64 data URI in the Capacitor Browser (Chrome).
     Chrome renders data URIs and lets the user tap ⋮ → Download or Share → Save.
     Falls back gracefully when the Browser plugin isn't available. ── */
  function _wpDataUriOpen(text, filename, mimeType) {
    try {
      /* base64-encode the content */
      var b64 = btoa(unescape(encodeURIComponent(text)));
      var dataUri = 'data:' + mimeType + ';base64,' + b64;
      var Browser = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
      if (Browser && Browser.open) {
        Browser.open({ url: dataUri });
        _wpShowToast('📥 File opened in browser — tap ⋮ → Download to save');
        wpSetStatus('📥 File opened — tap ⋮ → Download');
        return true;
      }
    } catch(e) {}
    return false;
  }

  /* ── Show a non-blocking toast message ── */
  function _wpShowToast(msg) {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
      'background:#1e293b;color:#fff;padding:12px 20px;border-radius:22px;' +
      'font-size:13px;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,.35);' +
      'max-width:300px;text-align:center;line-height:1.5;pointer-events:none;';
    t.innerHTML = msg;
    document.body.appendChild(t);
    setTimeout(function(){ if(t.parentNode) t.remove(); }, 5000);
  }

  /* ── Main save/download entry point for all text-based formats ──────────────
     Priority order on native Capacitor:
       1. navigator.share with File  →  native share sheet (Save to Files, Drive…)
       2. Capacitor Browser data URI →  opens Chrome where user taps ⋮ → Download
       3. Blob anchor click          →  web-browser fallback
     ─────────────────────────────────────────────────────────────────────────── */
  function wpSaveText(text, filename, mimeType) {
    var isNative = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();

    if (isNative) {
      /* ── 1. Try native Web Share with File (Android 10+ / WebView 80+) ── */
      if (navigator.share && navigator.canShare) {
        try {
          var shareFile = new File([text], filename, { type: mimeType });
          if (navigator.canShare({ files: [shareFile] })) {
            navigator.share({ files: [shareFile], title: filename })
              .then(function() { wpSetStatus('✅ File saved / shared'); })
              .catch(function(err) {
                if (err && err.name !== 'AbortError') {
                  /* Share dialog failed (not user cancel) — try data URI approach */
                  if (!_wpDataUriOpen(text, filename, mimeType)) {
                    _wpBlobDownload(text, filename, mimeType);
                  }
                }
                /* If AbortError → user dismissed share sheet, nothing to do */
              });
            return;
          }
        } catch(ignore) {}
      }

      /* ── 2. Capacitor Browser plugin — open as base64 data URI in Chrome ── */
      if (_wpDataUriOpen(text, filename, mimeType)) return;

      /* ── 3. Last resort: blob anchor download ── */
      _wpBlobDownload(text, filename, mimeType);
      return;
    }

    /* Web browser (not Capacitor): standard blob download */
    _wpBlobDownload(text, filename, mimeType);
  }

  /* ── Helpers ────────────────────────────────────────────────── */
  function wpGetDocTitle(html) {
    var m = (html||'').match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (m) return m[1].replace(/<[^>]+>/g,'').trim();
    var ed = document.getElementById('wp-editor-0');
    if (ed) return (ed.innerText || '').trim().split('\n')[0].slice(0,60) || 'XZily Document';
    return 'XZily Document';
  }

  function wpSafeName(name) {
    return (name || 'document').replace(/[^a-z0-9_\-\s]/gi,'').trim().replace(/\s+/g,'_').slice(0,60) || 'document';
  }

  function wpFocusEditor() {
    var ed = wpGetEditor(); if(ed) ed.focus();
  }

  function stripHtml(html) {
    var tmp = document.createElement('div'); tmp.innerHTML = html || '';
    return tmp.textContent || '';
  }

  function escHtml(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function sanitizeHTML(raw) {
    if (!raw) return '';
    var html = raw;
    /* Strip code fences: ```html ... ``` or ``` ... ``` */
    html = html.replace(/```html?\n?([\s\S]*?)```/gi, '$1')
               .replace(/```([\s\S]*?)```/gi, '$1');
    /* Remove boilerplate wrapper tags and dangerous tags */
    html = html.replace(/<!(DOCTYPE|doctype)[^>]*>/g,'')
               .replace(/<\/?(html|head|body|meta|link)[^>]*>/gi,'')
               .replace(/<style[\s\S]*?<\/style>/gi,'')
               .replace(/<script[\s\S]*?<\/script>/gi,'')
               .replace(/<\/?(div|span|section|article|aside|nav|header|footer|main)[^>]*>/gi,'');
    html = html.trim();
    /* If response has no block-level HTML tags, treat it as markdown/plain text */
    if (html && !/<(h[1-6]|p|ul|ol|li|blockquote|table)\b/i.test(html)) {
      html = html
        .replace(/^#{4}\s+(.+)$/gm,'<h4>$1</h4>')
        .replace(/^#{3}\s+(.+)$/gm,'<h3>$1</h3>')
        .replace(/^#{2}\s+(.+)$/gm,'<h2>$1</h2>')
        .replace(/^#\s+(.+)$/gm,'<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
        .replace(/\*(.+?)\*/g,'<em>$1</em>')
        .replace(/^[\*\-•]\s+(.+)$/gm,'<li>$1</li>')
        .replace(/(<li>[\s\S]*?<\/li>\n?)+/g,function(m){ return '<ul>'+m+'</ul>'; })
        .replace(/^(?!<[hupob]|$)(.+)$/gm,'<p>$1</p>');
    }
    /* Wrap any bare text nodes (lines not inside a tag) in <p> */
    html = html.replace(/^(?![\s]*<)(.*\S.*)$/gm, '<p>$1</p>');
    /* Remove empty paragraphs */
    html = html.replace(/<p>\s*(<br\s*\/?>)?\s*<\/p>/gi,'');
    return html.trim();
  }

  function basicFormat(text) {
    var lines = text.split(/\n/), html = '', inList = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) { if(inList){ html += '</ul>'; inList = false; } continue; }
      if (/^#{3}\s/.test(line)) { html += '<h3>'+escHtml(line.replace(/^###\s*/,''))+'</h3>'; continue; }
      if (/^#{2}\s/.test(line)) { html += '<h2>'+escHtml(line.replace(/^##\s*/,''))+'</h2>'; continue; }
      if (/^#{1}\s/.test(line)) { html += '<h1>'+escHtml(line.replace(/^#\s*/,''))+'</h1>'; continue; }
      if (/^[-*•]\s/.test(line)) { if(!inList){ html += '<ul>'; inList = true; } html += '<li>'+escHtml(line.replace(/^[-*•]\s*/,''))+'</li>'; continue; }
      if (inList) { html += '</ul>'; inList = false; }
      if (line === line.toUpperCase() && line.length > 4 && line.length < 80 && /[A-Z]/.test(line)) { html += '<h2>'+escHtml(line)+'</h2>'; continue; }
      html += '<p>'+escHtml(line)+'</p>';
    }
    if (inList) html += '</ul>';
    return html || '<p>'+escHtml(text)+'</p>';
  }

  function showHint(id, msg, type) {
    var el = document.getElementById(id); if (!el) return;
    el.textContent = msg;
    el.className = 'wp-hint show ' + (type || 'info');
    el.style.display = 'block';
  }
  function hideHint(id) {
    var el = document.getElementById(id); if (!el) return;
    el.style.display = 'none'; el.className = 'wp-hint';
  }

})();
