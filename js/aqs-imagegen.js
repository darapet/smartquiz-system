(function () {
  'use strict';

  var config = window.AQS_IMAGEGEN_CONFIG || {};
  var firebaseEndpoint = String(config.firebaseEndpoint || '').trim();
  var cloudflareEndpoint = String(config.cloudflareEndpoint || '').trim();
  var preferredEngine = String(config.preferredEngine || '').trim().toLowerCase();
  var clientKey = 'aqs_imagegen_client_id';
  var localHistoryKey = 'aqs_imagegen_local_history';
  var maxHistory = 12;
  var state = { busy: false, lastResult: null };

  var $ = function (selector) { return document.querySelector(selector); };
  var promptInput = $('#aqs-imagegen-prompt');
  var form = $('#aqs-imagegen-form');
  var submit = $('#aqs-imagegen-submit');
  var submitLabel = $('#aqs-imagegen-submit-label');
  var categorySelect = $('#aqs-imagegen-category');
  var ratioSelect = $('#aqs-imagegen-ratio');
  var promptCount = $('#aqs-imagegen-prompt-count');
  var detectionPill = $('#aqs-imagegen-detection-pill');
  var detectionConfidence = $('#aqs-imagegen-detection-confidence');
  var errorBox = $('#aqs-imagegen-error');
  var emptyState = $('#aqs-imagegen-empty-state');
  var loadingState = $('#aqs-imagegen-loading-state');
  var resultState = $('#aqs-imagegen-result-state');
  var resultStatus = $('#aqs-imagegen-result-status');
  var resultImage = $('#aqs-imagegen-result-image');
  var resultBadge = $('#aqs-imagegen-result-badge');
  var resultCategory = $('#aqs-imagegen-result-category');
  var resultTime = $('#aqs-imagegen-result-time');
  var download = $('#aqs-imagegen-download');
  var historyGrid = $('#aqs-imagegen-history-grid');
  var historyEmpty = $('#aqs-imagegen-history-empty');
  var loadingTitle = $('#aqs-imagegen-loading-title');
  var loadingCopy = $('#aqs-imagegen-loading-copy');

  function getClientId() {
    try {
      var existing = localStorage.getItem(clientKey);
      if (existing) return existing;
      var id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'client-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      localStorage.setItem(clientKey, id);
      return id;
    } catch (error) {
      return 'session-' + Date.now();
    }
  }

  function localHistory() {
    try {
      var items = JSON.parse(localStorage.getItem(localHistoryKey) || '[]');
      return Array.isArray(items) ? items.filter(function (item) { return item && item.url; }).slice(0, maxHistory) : [];
    } catch (error) {
      return [];
    }
  }

  function saveLocalResult(result) {
    try {
      var items = [result].concat(localHistory().filter(function (item) { return item.id !== result.id; })).slice(0, maxHistory);
      localStorage.setItem(localHistoryKey, JSON.stringify(items));
    } catch (error) {}
  }

  function detectCategory(prompt) {
    var text = String(prompt || '').toLowerCase();
    var rules = [
      { value: 'logo', label: 'Logo / brand mark', words: ['logo', 'logomark', 'brand mark', 'brand identity', 'monogram', 'wordmark', 'emblem'] },
      { value: 'banner', label: 'Banner / hero graphic', words: ['banner', 'hero image', 'header image', 'cover photo', 'website header', 'wide graphic', 'billboard'] },
      { value: 'social', label: 'Social media visual', words: ['social media', 'instagram', 'facebook post', 'linkedin', 'tiktok', 'twitter', 'x post', 'social post', 'carousel'] },
      { value: 'portrait', label: 'Portrait / character', words: ['portrait', 'headshot', 'profile photo', 'avatar', 'character', 'person', 'human face'] }
    ];
    for (var i = 0; i < rules.length; i += 1) {
      if (rules[i].words.some(function (word) { return text.indexOf(word) !== -1; })) return rules[i];
    }
    return { value: 'general', label: 'General creative', words: [] };
  }

  function displayCategory(value) {
    var labels = { logo: 'Logo / brand mark', banner: 'Banner / hero graphic', social: 'Social media visual', portrait: 'Portrait / character', general: 'General creative' };
    return labels[value] || labels.general;
  }

  function updateDetection() {
    var typed = promptInput.value.trim();
    var selected = categorySelect.value;
    var detected = detectCategory(typed);
    var active = selected === 'auto' ? detected : { value: selected, label: displayCategory(selected) };
    detectionPill.textContent = active.label;
    detectionConfidence.textContent = !typed ? 'Waiting for a prompt' : selected === 'auto' ? (detected.value === 'general' ? 'No format keyword found' : 'Matched from your wording') : 'Manual direction selected';
    promptCount.textContent = promptInput.value.length + ' / 2000';
  }

  function setError(message) {
    errorBox.textContent = message || '';
    errorBox.hidden = !message;
  }

  function setLoading(isLoading) {
    state.busy = isLoading;
    submit.disabled = isLoading;
    promptInput.disabled = isLoading;
    categorySelect.disabled = isLoading;
    ratioSelect.disabled = isLoading;
    $('#aqs-imagegen-clear').disabled = isLoading;
    if (isLoading) {
      emptyState.hidden = true;
      resultState.hidden = true;
      loadingState.hidden = false;
      resultStatus.textContent = 'Generating…';
      submitLabel.textContent = 'Generating…';
      loadingTitle.textContent = 'Painting your idea';
      loadingCopy.textContent = 'Finding the right composition and color balance…';
    } else {
      submitLabel.textContent = 'Generate image';
    }
  }

  function requestPayload() {
    var detected = detectCategory(promptInput.value);
    var category = categorySelect.value === 'auto' ? detected.value : categorySelect.value;
    var ratio = ratioSelect.value === 'auto' ? (category === 'banner' ? 'landscape' : category === 'portrait' || category === 'social' ? 'portrait' : 'square') : ratioSelect.value;
    return { prompt: promptInput.value.trim(), category: category, aspectRatio: ratio, clientId: getClientId() };
  }

  async function fetchGemini(payload) {
    if (!firebaseEndpoint) throw new Error('The secure Gemini image service is not configured yet.');
    var response = await fetch(firebaseEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(125000) : undefined
    });
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok || !body.url) {
      if (body.code === 'QUOTA_EXHAUSTED') throw new Error(body.error || 'Your free image limit has been reached. Please try again after the quota resets.');
      if (response.status === 503) throw new Error(body.error || 'Image generation is not configured. Ask an admin to add a Gemini image key.');
      throw new Error(body.error || 'The secure image service could not generate an image.');
    }
    return body;
  }

  async function fetchCloudflare(payload) {
    var query = '?prompt=' + encodeURIComponent(payload.prompt);
    query += '&category=' + encodeURIComponent(payload.category || 'general');
    query += '&aspectRatio=' + encodeURIComponent(payload.aspectRatio || 'square');
    if (String(config.cloudflareModel || '').trim()) query += '&model=' + encodeURIComponent(String(config.cloudflareModel).trim());
    var response = await fetch(cloudflareEndpoint + query, {
      method: 'GET',
      signal: window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(125000) : undefined
    });
    if (!response.ok) throw new Error('The Cloudflare image engine is unavailable (HTTP ' + response.status + ').');
    var blob = await response.blob();
    if (!blob.size || (blob.type && blob.type.indexOf('image/') !== 0)) throw new Error('The Cloudflare engine returned an invalid image.');
    return { id: 'creator-image-cloudflare-' + Date.now(), url: URL.createObjectURL(blob), prompt: payload.prompt, provider: 'Cloudflare Workers AI · Flux', createdAt: new Date().toISOString(), mediaType: 'image' };
  }

  function chooseEngine() {
    if (preferredEngine === 'gemini' && firebaseEndpoint) return 'gemini';
    return cloudflareEndpoint ? 'cloudflare' : 'gemini';
  }

  function showResult(result, payload) {
    state.lastResult = result;
    emptyState.hidden = true;
    loadingState.hidden = true;
    resultState.hidden = false;
    resultStatus.textContent = 'Image ready';
    resultImage.src = result.url;
    resultImage.alt = payload.prompt;
    resultCategory.textContent = displayCategory(payload.category);
    resultBadge.textContent = result.provider || (chooseEngine() === 'cloudflare' ? 'Cloudflare generated' : 'Gemini generated');
    resultTime.textContent = new Date(result.createdAt || Date.now()).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    download.href = result.url;
    download.download = 'xzily-ai-' + payload.category + '-' + Date.now() + '.png';
  }

  function friendlyError(error) {
    var text = error && error.message ? error.message : 'Image generation failed. Please try again.';
    if (/failed to fetch|network|timeout/i.test(text)) return 'The image service could not be reached. Check your connection and try again.';
    return text;
  }

  async function generate(event) {
    if (event) event.preventDefault();
    if (state.busy) return;
    setError('');
    var payload = requestPayload();
    if (payload.prompt.length < 3) {
      setError('Enter at least three characters so the image engine knows what to create.');
      promptInput.focus();
      return;
    }
    setLoading(true);
    try {
      var result;
      if (chooseEngine() === 'cloudflare') {
        try {
          result = await fetchCloudflare(payload);
        } catch (cloudflareError) {
          if (!firebaseEndpoint) throw cloudflareError;
          loadingCopy.textContent = 'Cloudflare is busy, switching to the secure Gemini fallback…';
          result = await fetchGemini(payload);
          result.provider = 'Google Gemini · fallback after Cloudflare';
        }
      } else {
        try {
          result = await fetchGemini(payload);
        } catch (geminiError) {
          if (!cloudflareEndpoint) throw geminiError;
          loadingCopy.textContent = 'Gemini is busy, switching to the Cloudflare image engine…';
          result = await fetchCloudflare(payload);
          result.provider = 'Cloudflare Workers AI · fallback after Gemini';
        }
      }
      var normalized = Object.assign({}, result, { prompt: payload.prompt, category: payload.category });
      saveLocalResult(normalized);
      showResult(normalized, payload);
      renderHistory(await loadHistory());
    } catch (error) {
      setError(friendlyError(error));
      emptyState.hidden = false;
      loadingState.hidden = true;
      resultState.hidden = true;
      resultStatus.textContent = 'Generation failed';
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    var local = localHistory();
    if (!firebaseEndpoint) return local;
    try {
      var response = await fetch(firebaseEndpoint + '?clientId=' + encodeURIComponent(getClientId()));
      var remote = await response.json().catch(function () { return []; });
      if (!response.ok || !Array.isArray(remote)) return local;
      return remote.concat(local.filter(function (item) { return !remote.some(function (remoteItem) { return remoteItem.id === item.id; }); })).slice(0, maxHistory);
    } catch (error) {
      return local;
    }
  }

  function renderHistory(items) {
    historyGrid.innerHTML = '';
    if (!items.length) {
      historyGrid.appendChild(historyEmpty);
      return;
    }
    items.forEach(function (item) {
      var card = document.createElement('article');
      card.className = 'aqs-imagegen-history-card';
      var button = document.createElement('button');
      button.type = 'button';
      button.title = 'Open this generated image';
      var image = document.createElement('img');
      image.src = item.url;
      image.alt = item.prompt || 'Generated image';
      image.loading = 'lazy';
      button.appendChild(image);
      button.addEventListener('click', function () {
        showResult(item, { prompt: item.prompt || 'Generated image', category: item.category || detectCategory(item.prompt).value });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      var meta = document.createElement('div');
      meta.className = 'aqs-imagegen-history-card-meta';
      var title = document.createElement('strong');
      title.textContent = item.prompt || 'Generated image';
      var date = document.createElement('small');
      date.textContent = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Saved locally';
      meta.appendChild(title);
      meta.appendChild(date);
      card.appendChild(button);
      card.appendChild(meta);
      historyGrid.appendChild(card);
    });
  }

  function clearAll() {
    promptInput.value = '';
    categorySelect.value = 'auto';
    ratioSelect.value = 'auto';
    setError('');
    updateDetection();
    emptyState.hidden = false;
    loadingState.hidden = true;
    resultState.hidden = true;
    resultStatus.textContent = 'Ready when you are';
    promptInput.focus();
  }

  promptInput.addEventListener('input', updateDetection);
  categorySelect.addEventListener('change', updateDetection);
  form.addEventListener('submit', generate);
  $('#aqs-imagegen-clear').addEventListener('click', clearAll);
  $('#aqs-imagegen-refresh-history').addEventListener('click', async function () {
    this.disabled = true;
    renderHistory(await loadHistory());
    this.disabled = false;
  });
  document.querySelectorAll('.aqs-imagegen-preset').forEach(function (button) {
    button.addEventListener('click', function () {
      promptInput.value = button.getAttribute('data-prompt') || '';
      categorySelect.value = button.getAttribute('data-category') || 'auto';
      updateDetection();
      promptInput.focus();
      promptInput.setSelectionRange(promptInput.value.length, promptInput.value.length);
    });
  });
  promptInput.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      generate(event);
    }
  });

  updateDetection();
  loadHistory().then(renderHistory);
}());