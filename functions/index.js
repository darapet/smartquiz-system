/* Firebase Cloud Functions for SmartQuiz */
'use strict';

const crypto = require('crypto');
const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');

admin.initializeApp();

const db = admin.firestore();
const CREATOR_IMAGE_WINDOW_MS = 24 * 60 * 60 * 1000;
const CREATOR_IMAGE_LIMIT = 5;
const CREATOR_IMAGE_COOLDOWN_MS = 62 * 1000;
const DEFAULT_CREATOR_IMAGE_MODEL = 'black-forest-labs/FLUX.1-schnell';

function setCors(response) {
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Headers', 'Content-Type');
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function requestIp(request) {
  const forwarded = request.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim().slice(0, 128);
  return String(request.ip || 'unknown').slice(0, 128);
}

function quotaDocumentId(ipAddress) {
  return crypto.createHash('sha256').update(ipAddress).digest('hex').slice(0, 40);
}

class QuotaExceededError extends Error {
  constructor(resetsAt) {
    super('You have used all five image generations for this rolling 24-hour window.');
    this.name = 'QuotaExceededError';
    this.resetsAt = resetsAt;
  }
}

async function reserveCreatorImageCredit(ipAddress) {
  const reference = db.collection('creator_image_quota').doc(quotaDocumentId(ipAddress));
  const now = Date.now();
  const cutoff = now - CREATOR_IMAGE_WINDOW_MS;
  let result;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const existing = snapshot.exists && Array.isArray(snapshot.data().events)
      ? snapshot.data().events
      : [];
    const events = existing
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= cutoff);

    if (events.length >= CREATOR_IMAGE_LIMIT) {
      throw new QuotaExceededError(new Date(Math.min(...events) + CREATOR_IMAGE_WINDOW_MS).toISOString());
    }

    events.push(now);
    const resetsAt = new Date(Math.min(...events) + CREATOR_IMAGE_WINDOW_MS).toISOString();
    transaction.set(reference, { events, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    result = {
      used: events.length,
      limit: CREATOR_IMAGE_LIMIT,
      remaining: Math.max(0, CREATOR_IMAGE_LIMIT - events.length),
      resetsAt,
      plan: 'Free',
    };
  });

  return result;
}

function cleanImageKeys(value) {
  return Array.isArray(value)
    ? value
        .filter((key) => typeof key === 'string')
        .map((key) => key.replace(/[^\x20-\x7E]/g, '').trim())
        .filter((key) => key.length > 10)
        .slice(0, 5)
    : [];
}

async function creatorImageSettings() {
  const snapshot = await db.doc('settings/main').get();
  const settings = snapshot.exists ? snapshot.data() : {};
  return {
    keys: cleanImageKeys(settings.creator_image_keys),
    model: typeof settings.creator_image_model === 'string' && settings.creator_image_model.trim()
      ? settings.creator_image_model.trim()
      : DEFAULT_CREATOR_IMAGE_MODEL,
  };
}

function keyHash(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

async function imageKeyOrder(keys) {
  const reference = db.doc('creator_image_runtime/pool');
  const now = Date.now();
  let order = [];

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const state = snapshot.exists ? snapshot.data() : {};
    const start = Number.isInteger(state.nextIndex) ? state.nextIndex % keys.length : 0;
    const cooldowns = state.cooldowns && typeof state.cooldowns === 'object' ? state.cooldowns : {};
    const available = [];

    for (let offset = 0; offset < keys.length; offset += 1) {
      const index = (start + offset) % keys.length;
      if (Number(cooldowns[keyHash(keys[index])] || 0) <= now) available.push(index);
    }
    order = available.length
      ? available
      : Array.from({ length: keys.length }, (_, offset) => (start + offset) % keys.length);

    transaction.set(reference, {
      nextIndex: (start + 1) % keys.length,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return order;
}

async function coolDownImageKey(key) {
  const reference = db.doc('creator_image_runtime/pool');
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const state = snapshot.exists ? snapshot.data() : {};
    const cooldowns = state.cooldowns && typeof state.cooldowns === 'object' ? { ...state.cooldowns } : {};
    cooldowns[keyHash(key)] = Date.now() + CREATOR_IMAGE_COOLDOWN_MS;
    transaction.set(reference, { cooldowns, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
}

function dimensionsFor(aspectRatio) {
  if (aspectRatio === 'square') return { width: 1024, height: 1024 };
  if (aspectRatio === 'portrait') return { width: 576, height: 1024 };
  return { width: 1024, height: 576 };
}

function enhancedCreatorImagePrompt(prompt, category) {
  const categoryNote = category === 'logo' || category === 'banner'
    ? ', flat vector design, clean lines, centered layout, white background'
    : '';
  return `${String(prompt || '').trim()}. high quality, clean composition, sharp details, professional lighting, anatomy-safe${categoryNote}. Negative prompt: bad hands, extra fingers, deformed limbs, fused body parts, extra arms, low quality, pixelated, distorted faces.`;
}

function pollinationsUrl(prompt, dimensions) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=${dimensions.width}&height=${dimensions.height}&nologo=true&enhance=true&seed=${Math.floor(Math.random() * 1000000000)}`;
}

async function generateWithCreatorImagePool(prompt, dimensions, keys, model) {
  if (!keys.length) return null;

  const order = await imageKeyOrder(keys);
  const endpoint = `https://api-inference.huggingface.co/models/${model.split('/').map(encodeURIComponent).join('/')}`;

  for (const index of order) {
    const key = keys[index];
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { width: dimensions.width, height: dimensions.height, num_inference_steps: 4 },
        }),
      });

      if (response.status === 429 || response.status === 503 || response.status === 504) {
        await coolDownImageKey(key);
        continue;
      }
      if (response.status === 401 || response.status === 403 || !response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) continue;

      const base64 = Buffer.from(await response.arrayBuffer()).toString('base64');
      return {
        mediaType: 'image',
        url: `data:${contentType.split(';')[0]};base64,${base64}`,
        provider: 'huggingface image pool',
        fallbackUsed: false,
      };
    } catch (_) {
      /* The next configured token or public fallback gets the request. */
    }
  }

  return null;
}

async function checkCreatorImagePool(keys, model) {
  if (!keys.length) return [];
  const endpoint = `https://api-inference.huggingface.co/models/${model.split('/').map(encodeURIComponent).join('/')}`;
  const results = [];

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    try {
      const startedAt = Date.now();
      const providerResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          inputs: 'A simple blue circle on a clean white background',
          parameters: { width: 256, height: 256, num_inference_steps: 4 },
        }),
      });
      const contentType = providerResponse.headers.get('content-type') || '';
      const rateLimited = providerResponse.status === 429 || providerResponse.status === 503 || providerResponse.status === 504;
      if (rateLimited) await coolDownImageKey(key);
      results.push({
        slot: index + 1,
        status: providerResponse.ok && contentType.startsWith('image/')
          ? 'healthy'
          : rateLimited
            ? 'rate_limited'
            : providerResponse.status === 401 || providerResponse.status === 403
              ? 'invalid'
              : 'unavailable',
        httpStatus: providerResponse.status,
        latencyMs: Date.now() - startedAt,
      });
    } catch (_) {
      results.push({ slot: index + 1, status: 'unavailable', httpStatus: 0, latencyMs: 0 });
    }
  }

  return results;
}

exports.creatorImageGenerate = onRequest(
  { region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' },
  async (request, response) => {
    setCors(response);
    if (request.method === 'OPTIONS') return response.status(204).send('');
    if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST for image generation.' });

    const payload = request.body && typeof request.body === 'object' ? request.body : {};
    const prompt = String(payload.prompt || '').trim();
    const testOnly = Boolean(payload.testOnly);
    if (!testOnly && prompt.length < 3) return response.status(400).json({ error: 'Enter a prompt with at least 3 characters.' });

    let settings;
    try {
      settings = await creatorImageSettings();
    } catch (error) {
      console.error('Creator image settings error:', error);
      return response.status(500).json({ error: 'Image settings could not be loaded.' });
    }

    if (testOnly) {
      return response.json({
        model: settings.model,
        configuredTokens: settings.keys.length,
        health: await checkCreatorImagePool(settings.keys, settings.model),
      });
    }

    let quota;
    try {
      quota = await reserveCreatorImageCredit(requestIp(request));
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        return response.status(429).json({
          error: error.message,
          code: 'QUOTA_EXHAUSTED',
          remaining: 0,
          limit: CREATOR_IMAGE_LIMIT,
          resetsAt: error.resetsAt,
          plan: 'Free',
        });
      }
      console.error('Creator image quota error:', error);
      return response.status(500).json({ error: 'Image quota could not be checked.' });
    }

    try {
      const dimensions = dimensionsFor(payload.aspectRatio);
      const enhancedPrompt = enhancedCreatorImagePrompt(prompt, payload.category);
      const generated = await generateWithCreatorImagePool(enhancedPrompt, dimensions, settings.keys, settings.model);
      const result = generated || {
        mediaType: 'image',
        url: pollinationsUrl(enhancedPrompt, dimensions),
        provider: 'pollinations',
        fallbackUsed: true,
      };

      return response.json({
        id: `creator-image-${Date.now()}-${crypto.randomUUID()}`,
        ...result,
        prompt,
        createdAt: new Date().toISOString(),
        qualityNotes: [
          result.fallbackUsed
            ? 'Public fallback engine used because no managed image token succeeded.'
            : 'Dedicated Creator Studio image-token pool used.',
          'Automatic quality and anatomy safeguards applied.',
        ],
        quota,
      });
    } catch (error) {
      console.error('Creator image generation error:', error);
      return response.status(502).json({ error: 'The image providers are temporarily unavailable.' });
    }
  },
);
