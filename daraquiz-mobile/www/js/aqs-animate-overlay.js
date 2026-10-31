(function () {
  'use strict';
  function init() {
    var fileInput = document.getElementById('aqs-anim-file');
    var previewWrap = document.getElementById('aqs-anim-preview-wrap');
    var previewImg = document.getElementById('aqs-anim-preview-img');
    if (!fileInput || !previewWrap || !previewImg) return;

    var css = document.createElement('style');
    css.textContent = '.aqs-text-overlay-tools{margin-top:16px;padding:16px;background:#faf3ea;border:1px solid #eee2d3;border-radius:14px;color:#12304a}.aqs-text-overlay-tools h3{margin:0 0 5px;color:#12304a;font-size:1rem}.aqs-text-overlay-tools p{margin:4px 0 11px;color:#65778a;font-size:.84rem}.aqs-text-overlay-tools label{font-weight:700;color:#12304a}.aqs-text-overlay-tools textarea{display:block;width:100%;min-height:82px;margin:8px 0;border:1px solid #d8dfe3;border-radius:10px;background:#fff;color:#12304a;padding:10px;font:inherit;resize:vertical}.aqs-text-overlay-row{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:10px}.aqs-text-overlay-row select{border:1px solid #eee2d3;border-radius:8px;background:#fff;color:#12304a;padding:8px}.aqs-text-overlay-row input[type=color],.aqs-text-overlay-row input[type=range]{accent-color:#e8912d}.aqs-text-overlay-row button{border:0;border-radius:9px;background:#e8912d;color:#fff;padding:9px 12px;font-weight:700;cursor:pointer}.aqs-text-overlay-row button:disabled{opacity:.5}.aqs-text-overlay{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:7%;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.12;font-weight:900;text-shadow:0 2px 10px rgba(18,48,74,.48);pointer-events:none;opacity:0}.aqs-text-overlay.on.fade{animation:aqsTextFade 1.2s ease both}.aqs-text-overlay.on.slide{animation:aqsTextSlide 1.2s ease both}.aqs-text-overlay.on.bounce{animation:aqsTextBounce 1.2s ease both}.aqs-text-overlay.on.glow{animation:aqsTextGlow 1.3s ease both}@keyframes aqsTextFade{to{opacity:1}}@keyframes aqsTextSlide{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}@keyframes aqsTextBounce{0%{opacity:0;transform:scale(.45)}65%{opacity:1;transform:scale(1.1)}100%{opacity:1;transform:scale(1)}}@keyframes aqsTextGlow{0%{opacity:0;filter:drop-shadow(0 0 0 currentColor)}45%{opacity:1;filter:drop-shadow(0 0 18px currentColor)}100%{opacity:1;filter:drop-shadow(0 0 6px currentColor)}}@media(max-width:600px){.aqs-text-overlay-tools{padding:12px}.aqs-text-overlay-row{gap:7px}}';
    document.head.appendChild(css);
    previewWrap.style.position = 'relative';
    var overlay = document.createElement('div');
    overlay.className = 'aqs-text-overlay';
    overlay.setAttribute('aria-live', 'polite');
    previewWrap.appendChild(overlay);
    var controls = document.createElement('section');
    controls.className = 'aqs-text-overlay-tools';
    controls.innerHTML = '<h3>animate exact flyer text</h3><p>this text stays crisp and unchanged. AI frame generation below remains separate.</p><label for="aqs-exact-overlay-text">text to animate</label><textarea id="aqs-exact-overlay-text" maxlength="500" placeholder="your headline&#10;a second line"></textarea><div class="aqs-text-overlay-row"><label for="aqs-overlay-effect">animation</label><select id="aqs-overlay-effect"><option value="fade">fade-in</option><option value="slide">slide</option><option value="bounce">bounce</option><option value="glow">glow</option></select><label for="aqs-overlay-color">color</label><input id="aqs-overlay-color" type="color" value="#ffffff"><label for="aqs-overlay-size">size</label><input id="aqs-overlay-size" type="range" min="18" max="72" value="38"><span id="aqs-overlay-size-text">38px</span></div><div class="aqs-text-overlay-row"><button type="button" id="aqs-overlay-play" disabled>▶ play text</button><button type="button" id="aqs-overlay-record" disabled>record WebM</button></div><p id="aqs-overlay-status" aria-live="polite">upload an image to start</p>';
    var controlsCard = document.querySelector('.aqs-anim-controls-card');
    if (controlsCard) controlsCard.insertBefore(controls, controlsCard.firstChild);
    var text = controls.querySelector('textarea'), effect = controls.querySelector('select'), color = controls.querySelector('input[type=color]'), size = controls.querySelector('input[type=range]'), play = controls.querySelector('#aqs-overlay-play'), record = controls.querySelector('#aqs-overlay-record'), status = controls.querySelector('#aqs-overlay-status');
    function sync() {
      overlay.textContent = text.value;
      overlay.style.color = color.value;
      overlay.style.fontSize = 'clamp(18px,5vw,' + size.value + 'px)';
      controls.querySelector('#aqs-overlay-size-text').textContent = size.value + 'px';
      var ready = Boolean(previewImg.getAttribute('src') && text.value.trim());
      play.disabled = !ready;
      record.disabled = !ready;
    }
    fileInput.addEventListener('change', function () { setTimeout(function () { sync(); if (fileInput.files && fileInput.files[0]) status.textContent = 'flyer ready. enter exact text to animate'; }, 0); });
    text.addEventListener('input', sync); color.addEventListener('input', sync); size.addEventListener('input', sync);
    play.addEventListener('click', function () { sync(); if (play.disabled) return; overlay.className = 'aqs-text-overlay ' + effect.value; void overlay.offsetWidth; overlay.classList.add('on'); status.textContent = 'playing ' + effect.options[effect.selectedIndex].text; });
    record.addEventListener('click', function () {
      sync(); if (record.disabled) return;
      if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { status.textContent = 'WebM recording is not supported in this browser'; return; }
      var image = new Image(); image.onload = function () {
        var scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
        var canvas = document.createElement('canvas'); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
        var ctx = canvas.getContext('2d'), stream = canvas.captureStream(30), chunks = [], recorder;
        try { recorder = new MediaRecorder(stream, {mimeType:'video/webm'}); } catch (e) { status.textContent = 'WebM recording is not supported in this browser'; return; }
        recorder.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
        recorder.onstop = function () { var url = URL.createObjectURL(new Blob(chunks,{type:'video/webm'})), a=document.createElement('a'); a.href=url; a.download='smartquiz-flyer-animation.webm'; a.click(); setTimeout(function(){URL.revokeObjectURL(url)},10000); stream.getTracks().forEach(function(t){t.stop()}); status.textContent='WebM animation saved'; };
        var start=performance.now(); function draw(now){var t=now-start,p=Math.min(1,t/1200),y=canvas.height/2,k=1;if(effect.value==='slide')y+=(1-p)*canvas.height*.08;if(effect.value==='bounce')k=p<.65?p/.65*1.1:1.1-(p-.65)/.35*.1;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);if(k!==1){ctx.translate(canvas.width/2,canvas.height/2);ctx.scale(k,k);ctx.translate(-canvas.width/2,-canvas.height/2)}ctx.globalAlpha=p;ctx.fillStyle=color.value;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 '+Math.round(Number(size.value)*scale)+'px sans-serif';ctx.shadowColor=color.value;ctx.shadowBlur=effect.value==='glow'?18*scale:4*scale;var lines=text.value.split('\n'),lh=Number(size.value)*1.2*scale;lines.forEach(function(line,i){ctx.fillText(line,canvas.width/2,y+(i-(lines.length-1)/2)*lh,canvas.width*.88)});ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.shadowBlur=0;if(t<1400)requestAnimationFrame(draw);else setTimeout(function(){recorder.stop()},150)}
        recorder.start(); status.textContent='recording flyer text'; requestAnimationFrame(draw);
      }; image.onerror=function(){status.textContent='could not read flyer for recording'};image.src=previewImg.src;
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
