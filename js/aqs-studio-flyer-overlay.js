(function () {
  'use strict';
  function boot() {
    var input = document.getElementById('dts-image-input');
    var panel = document.getElementById('dts-flyer-overlay');
    if (!input || !panel) return;
    var image = document.getElementById('dts-flyer-preview');
    var layer = document.getElementById('dts-flyer-overlay-text');
    var text = document.getElementById('dts-flyer-text');
    var effect = document.getElementById('dts-flyer-effect');
    var color = document.getElementById('dts-flyer-color');
    var size = document.getElementById('dts-flyer-size');
    var sizeLabel = document.getElementById('dts-flyer-size-value');
    var play = document.getElementById('dts-flyer-play');
    var record = document.getElementById('dts-flyer-record');
    var status = document.getElementById('dts-flyer-status');
    var objectUrl = '';
    function sync() {
      layer.textContent = text.value;
      layer.style.color = color.value;
      layer.style.fontSize = 'clamp(18px,5vw,' + size.value + 'px)';
      sizeLabel.textContent = size.value + 'px';
      var ready = !!(objectUrl && text.value.trim());
      play.disabled = !ready;
      record.disabled = !ready;
    }
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) { status.textContent = 'please choose an image file'; return; }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(f);
      image.onload = function () { panel.hidden = false; sync(); status.textContent = 'flyer ready. enter the exact text to animate'; };
      image.onerror = function () { status.textContent = 'could not read this flyer'; };
      image.src = objectUrl;
    });
    text.addEventListener('input', sync);
    color.addEventListener('input', sync);
    size.addEventListener('input', sync);
    effect.addEventListener('change', function () { if (layer.classList.contains('playing')) play.click(); });
    play.addEventListener('click', function () {
      sync(); if (play.disabled) return;
      layer.className = 'dts-flyer-overlay-text'; void layer.offsetWidth;
      layer.classList.add('playing', effect.value);
      status.textContent = 'playing ' + effect.options[effect.selectedIndex].text;
    });
    record.addEventListener('click', function () {
      sync(); if (record.disabled) return;
      if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { status.textContent = 'WebM recording is not supported in this browser'; return; }
      var source = new Image();
      source.onload = function () {
        var scale = Math.min(1, 1920 / Math.max(source.naturalWidth, source.naturalHeight));
        var canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(source.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
        var ctx = canvas.getContext('2d'); var stream = canvas.captureStream(30); var chunks = []; var recorder;
        try { recorder = new MediaRecorder(stream, { mimeType: 'video/webm' }); } catch (e) { status.textContent = 'WebM recording is not supported in this browser'; return; }
        recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.onstop = function () {
          var url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); var a = document.createElement('a');
          a.href = url; a.download = 'smartquiz-flyer-animation.webm'; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 10000); stream.getTracks().forEach(function (track) { track.stop(); }); status.textContent = 'WebM animation saved';
        };
        var started = performance.now();
        function render(now) {
          var elapsed = now - started; var progress = Math.min(1, elapsed / 1200); var x = canvas.width / 2; var y = canvas.height / 2; var alpha = progress; var scaleText = 1;
          if (effect.value === 'slide') y += (1 - progress) * canvas.height * 0.08;
          if (effect.value === 'bounce') scaleText = progress < 0.65 ? progress / 0.65 * 1.1 : 1.1 - (progress - 0.65) / 0.35 * 0.1;
          ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
          ctx.save(); ctx.translate(x, y); ctx.scale(scaleText, scaleText); ctx.globalAlpha = alpha; ctx.fillStyle = color.value; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = '900 ' + Math.max(1, Math.round(Number(size.value) * scale)) + 'px sans-serif'; ctx.shadowColor = color.value; ctx.shadowBlur = effect.value === 'glow' ? 20 * scale : 5 * scale;
          var lines = text.value.split('\n'); var lineHeight = Number(size.value) * 1.2 * scale;
          lines.forEach(function (line, index) { ctx.fillText(line, 0, (index - (lines.length - 1) / 2) * lineHeight, canvas.width * 0.88); }); ctx.restore();
          if (elapsed < 1400) requestAnimationFrame(render); else setTimeout(function () { recorder.stop(); }, 150);
        }
        recorder.start(); status.textContent = 'recording flyer animation'; requestAnimationFrame(render);
      };
      source.onerror = function () { status.textContent = 'could not load flyer for recording'; };
      source.src = objectUrl;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
