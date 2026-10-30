(function () {
  'use strict';
  var promptEl = document.getElementById('prompt');
  var fileEl = document.getElementById('image');
  var thumb = document.getElementById('thumb');
  var fileName = document.getElementById('fileName');
  var statusEl = document.getElementById('status');
  var progressEl = document.getElementById('progress');
  var errorEl = document.getElementById('error');
  var framesEl = document.getElementById('frames');
  var stage = document.getElementById('stage');
  var placeholder = document.getElementById('placeholder');
  var generateBtn = document.getElementById('generate');
  var playBtn = document.getElementById('play');
  var downloadBtn = document.getElementById('downloadAll');
  var speedEl = document.getElementById('speed');
  var uploadedUrl = '';
  var frameUrls = [];
  var stageImages = [];
  var activeIndex = 0;
  var timer = null;
  var baseSeed = Math.floor(Math.random() * 9000000) + 100000;
  var styles = ['gentle motion, frame 1 of a short visual sequence', 'subtle motion variation, frame 2 of a short visual sequence', 'another natural motion variation, frame 3 of a short visual sequence', 'final fluid motion variation, frame 4 of a short visual sequence'];

  function setStatus(text) { statusEl.textContent = text; }
  function showStageImage(url, alt, isActive) {
    var img = document.createElement('img');
    img.src = url;
    img.alt = alt;
    if (isActive) img.className = 'active';
    stage.appendChild(img);
    stageImages.push(img);
    return img;
  }
  function selectFrame(index) {
    if (!stageImages.length) return;
    activeIndex = index % stageImages.length;
    stageImages.forEach(function (img, i) { img.classList.toggle('active', i === activeIndex); });
  }
  function stop() {
    if (timer) window.clearInterval(timer);
    timer = null;
    playBtn.textContent = '▶ Play';
  }
  function play() {
    if (stageImages.length < 2) return;
    stop();
    playBtn.textContent = 'Ⅱ Pause';
    timer = window.setInterval(function () { selectFrame((activeIndex + 1) % stageImages.length); }, Number(speedEl.value) || 600);
  }
  function download(url, number) {
    var a = document.createElement('a');
    a.href = url;
    a.download = 'smartquiz-animation-frame-' + number + '.jpg';
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function makeCard(index) {
    var card = document.createElement('article');
    card.className = 'frame loading';
    var shot = document.createElement('div');
    shot.className = 'shot';
    shot.textContent = 'Frame ' + (index + 1) + ' · waiting';
    var footer = document.createElement('footer');
    var label = document.createElement('span');
    label.textContent = 'Frame ' + (index + 1);
    var link = document.createElement('a');
    link.textContent = '—';
    link.href = '#';
    link.setAttribute('aria-label', 'Frame not ready');
    footer.append(label, link);
    card.append(shot, footer);
    framesEl.appendChild(card);
    return { card: card, shot: shot, link: link };
  }
  function makeUrl(text, seed) {
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(text) + '?width=768&height=768&model=flux&seed=' + seed + '&nologo=true';
  }
  function loadFrame(item, index, url) {
    return new Promise(function (resolve) {
      var img = new Image();
      var settled = false;
      var timeout = window.setTimeout(function () { finish(false, 'Timed out — retry generation'); }, 120000);
      function finish(ok, message) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (ok) {
          item.card.classList.remove('loading');
          item.shot.textContent = '';
          var cardImg = document.createElement('img');
          cardImg.src = url;
          cardImg.alt = 'Generated animation frame ' + (index + 1);
          item.shot.appendChild(cardImg);
          item.link.textContent = '↓ Save';
          item.link.href = url;
          item.link.setAttribute('download', 'smartquiz-animation-frame-' + (index + 1) + '.jpg');
          item.link.setAttribute('aria-label', 'Download frame ' + (index + 1));
          frameUrls[index] = url;
          var stageImg = showStageImage(url, 'Animation frame ' + (index + 1), stageImages.length === 0 && !uploadedUrl);
          stageImg.addEventListener('error', function () { stageImg.alt = 'Frame preview could not load'; });
        } else {
          item.card.classList.remove('loading');
          item.card.classList.add('failed');
          item.shot.textContent = message;
          item.link.textContent = 'Retry';
          item.link.href = '#';
          item.link.onclick = function (event) { event.preventDefault(); generate(); };
        }
        resolve(ok);
      }
      img.onload = function () { finish(true); };
      img.onerror = function () { finish(false, 'Could not load — check connection and retry'); };
      img.src = url;
    });
  }
  async function generate() {
    var prompt = (promptEl.value || '').trim();
    if (!prompt) {
      errorEl.textContent = 'Add a visual prompt first.';
      promptEl.focus();
      return;
    }
    stop();
    errorEl.textContent = '';
    generateBtn.disabled = true;
    playBtn.disabled = true;
    downloadBtn.disabled = true;
    frameUrls = [];
    framesEl.replaceChildren();
    stageImages = [];
    stage.querySelectorAll('img').forEach(function (img) { img.remove(); });
    if (uploadedUrl) showStageImage(uploadedUrl, 'Uploaded opening frame', true);
    placeholder.style.display = 'none';
    var cards = styles.map(function (unused, i) { return makeCard(i); });
    progressEl.style.width = '0%';
    baseSeed = Math.floor(Math.random() * 9000000) + 100000;
    setStatus('Starting free FLUX frame generation…');
    var successes = 0;
    for (var i = 0; i < styles.length; i++) {
      setStatus('Frame ' + (i + 1) + ' of ' + styles.length + ': generating…');
      cards[i].shot.textContent = 'Frame ' + (i + 1) + ' · generating…';
      var url = makeUrl(prompt + ', ' + styles[i] + ', consistent subject and art direction, no text, no watermark', baseSeed + i);
      var ok = await loadFrame(cards[i], i, url);
      if (ok) successes++;
      progressEl.style.width = Math.round(((i + 1) / styles.length) * 100) + '%';
      setStatus('Frame ' + (i + 1) + ' of ' + styles.length + (ok ? ' ready' : ' failed') + ' · ' + successes + ' ready');
    }
    generateBtn.disabled = false;
    if (successes) {
      playBtn.disabled = stageImages.length < 2;
      downloadBtn.disabled = successes === 0;
      setStatus(successes + ' of 4 FLUX frames ready · frame animation' + (uploadedUrl ? ' starts with your image' : '') + '.');
    } else {
      placeholder.style.display = 'block';
      errorEl.textContent = 'No frames loaded. Pollinations may be temporarily unavailable; try again in a moment.';
      setStatus('Generation failed.');
    }
  }
  fileEl.addEventListener('change', function () {
    var file = fileEl.files && fileEl.files[0];
    if (!file) return;
    if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
    uploadedUrl = URL.createObjectURL(file);
    thumb.src = uploadedUrl;
    thumb.style.display = 'block';
    fileName.textContent = file.name + ' · used as opening frame';
  });
  generateBtn.addEventListener('click', generate);
  document.getElementById('clear').addEventListener('click', function () {
    stop(); promptEl.value = ''; fileEl.value = '';
    if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
    uploadedUrl = ''; thumb.removeAttribute('src'); thumb.style.display = 'none';
    fileName.textContent = 'It will be included as the opening frame.';
    framesEl.replaceChildren(); frameUrls = []; stageImages = [];
    stage.querySelectorAll('img').forEach(function (img) { img.remove(); });
    placeholder.style.display = 'block'; progressEl.style.width = '0%';
    generateBtn.disabled = false; playBtn.disabled = true; downloadBtn.disabled = true;
    errorEl.textContent = ''; setStatus('Ready. Enter a prompt to begin.');
  });
  playBtn.addEventListener('click', function () { if (timer) stop(); else play(); });
  speedEl.addEventListener('change', function () { if (timer) play(); });
  downloadBtn.addEventListener('click', function () {
    var ready = frameUrls.filter(Boolean);
    ready.forEach(function (url, i) { window.setTimeout(function () { download(url, i + 1); }, i * 250); });
  });
})();
