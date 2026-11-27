import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function makeEnv() {
  const values = new Map();
  return {
    FIREBASE_WEB_API_KEY: 'test-firebase-key',
    ADMIN_EMAIL: 'admin@example.com',
    EMAIL_CONFIG: {
      async get(key, type) {
        const value = values.get(key);
        if (value == null) return null;
        if (type === 'json') return typeof value === 'string' ? JSON.parse(value) : value;
        return String(value);
      },
      async put(key, value) { values.set(key, value); },
      async delete(key) { values.delete(key); },
    },
  };
}

function mockFetch() {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup')) {
      return new Response(JSON.stringify({ users: [{ localId: 'student-uid', email: 'student@example.com' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    calls.push({ target, init });
    if (target.startsWith('https://generativelanguage.googleapis.com/v1beta/models/') && target.includes(':generateContent')) {
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { data: 'AQIDBA==', mimeType: 'audio/L16;rate=24000' } }] } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('Unexpected upstream request: ' + target);
  };
  return { calls, restore() { globalThis.fetch = original; } };
}

async function saveSpecialConfig(env) {
  const response = await worker.fetch(new Request('https://worker.test/api/ai/config', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ai_special_services: {
        creatorImage: { keys: ['AIza-image-key-test-123456789'], model: 'gemini-3.1-flash-image' },
        geminiTTS: { keys: ['AIza-tts-key-test-123456789'], model: 'gemini-2.5-flash-preview-tts' },
        elevenLabs: { keys: [], model: 'eleven_multilingual_v2' },
      },
    }),
  }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).saved, true);
}

test('special AI configuration is stored and TTS status exposes only configured flags', async () => {
  const env = makeEnv();
  const mock = mockFetch();
  try {
    await saveSpecialConfig(env);
    const response = await worker.fetch(new Request('https://worker.test/api/tts/status', {
      method: 'POST', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: '{}',
    }), env);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.geminiTTS.configured, true);
    assert.equal(data.elevenLabs.configured, false);
    assert.equal(JSON.stringify(data).includes('AIza-tts-key'), false);
  } finally {
    mock.restore();
  }
});

test('Gemini TTS is proxied server-side and returns audio without exposing API keys', async () => {
  const env = makeEnv();
  const mock = mockFetch();
  try {
    await saveSpecialConfig(env);
    const response = await worker.fetch(new Request('https://worker.test/api/tts/gemini', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello there', voiceName: 'Kore', style: 'Speak clearly.' }),
    }), env);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.audioBase64, 'AQIDBA==');
    assert.equal(data.mimeType, 'audio/L16;rate=24000');
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].init.headers['Content-Type'], 'application/json');
    assert.equal(JSON.stringify(data).includes('AIza-tts-key'), false);
  } finally {
    mock.restore();
  }
});

test('Gemini TTS rejects oversized text before contacting the provider', async () => {
  const env = makeEnv();
  const mock = mockFetch();
  try {
    await saveSpecialConfig(env);
    const response = await worker.fetch(new Request('https://worker.test/api/tts/gemini', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(4001) }),
    }), env);
    assert.equal(response.status, 400);
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});
