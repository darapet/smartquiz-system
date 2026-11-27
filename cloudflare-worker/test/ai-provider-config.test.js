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

function mockFetch({ openaiStatus = 200 } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup')) {
      return new Response(JSON.stringify({ users: [{ localId: 'admin-uid', email: 'admin@example.com' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    calls.push(target);
    if (target === 'https://api.openai.com/v1/chat/completions') {
      if (openaiStatus !== 200) {
        return new Response(JSON.stringify({ error: { message: 'Temporary provider limit' } }), {
          status: openaiStatus, headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        id: 'chatcmpl-test', object: 'chat.completion', model: 'gpt-4.1-mini',
        choices: [{ index: 0, message: { role: 'assistant', content: 'OpenAI route active' }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (target === 'https://api.groq.com/openai/v1/chat/completions') {
      const requestBody = JSON.parse(init.body || '{}');
      if (requestBody.stream === true) {
        return new Response('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content: 'Central streamed route active' }, finish_reason: null }] }) + '\\n\\ndata: [DONE]\\n\\n', {
          status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        });
      }
      return new Response(JSON.stringify({
        id: 'chatcmpl-fallback', object: 'chat.completion', model: 'openai/gpt-oss-20b',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Fallback route active' }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('Unexpected network request: ' + target);
  };
  return { calls, restore() { globalThis.fetch = original; } };
}

async function syncConfigs(env, configs) {
  const response = await worker.fetch(new Request('https://worker.test/api/ai/config', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ai_provider_config: configs }),
  }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).saved, true);
}

async function syncConfig(env, featureConfig) {
  return syncConfigs(env, { main: featureConfig });
}

async function generate(env, feature = 'main', stream = false) {
  return worker.fetch(new Request('https://worker.test/api/ai', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature, stream, messages: [{ role: 'user', content: 'Say hello.' }] }),
  }), env);
}

test('AI Control Centre config routes generation through the selected provider', async () => {
  const env = makeEnv();
  const mock = mockFetch();
  try {
    await syncConfig(env, {
      primary: 'openai', model: 'gpt-4.1-mini', fallback: 'groq',
      fallbackModel: 'openai/gpt-oss-20b',
      keys: { openai: ['sk-test-openai-key-123456789'], groq: ['gsk-test-groq-key-123456789'] },
    });
    const response = await generate(env);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.choices[0].message.content, 'OpenAI route active');
    assert.deepEqual(mock.calls, ['https://api.openai.com/v1/chat/completions']);
  } finally {
    mock.restore();
  }
});

test('AI Control Centre falls back when the primary provider is rate limited', async () => {
  const env = makeEnv();
  const mock = mockFetch({ openaiStatus: 429 });
  try {
    await syncConfig(env, {
      primary: 'openai', model: 'gpt-4.1-mini', fallback: 'groq',
      fallbackModel: 'openai/gpt-oss-20b',
      keys: { openai: ['sk-test-openai-key-123456789'], groq: ['gsk-test-groq-key-123456789'] },
    });
    const response = await generate(env);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.choices[0].message.content, 'Fallback route active');
    assert.deepEqual(mock.calls, [
      'https://api.openai.com/v1/chat/completions',
      'https://api.groq.com/openai/v1/chat/completions',
    ]);
  } finally {
    mock.restore();
  }
});


test('feature AI uses the central main primary when its own routes are unavailable', async () => {
  const env = makeEnv();
  const mock = mockFetch({ openaiStatus: 429 });
  try {
    await syncConfigs(env, {
      main: {
        primary: 'groq', model: 'openai/gpt-oss-20b', fallback: '',
        keys: { primary: { groq: ['gsk-main-primary-key-123456789'] }, fallback: {} },
      },
      studyhub: {
        primary: 'openai', model: 'gpt-4.1-mini', fallback: '',
        keys: { primary: { openai: ['sk-studyhub-primary-key-123456789'] }, fallback: {} },
      },
    });
    const response = await generate(env, 'studyhub');
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.choices[0].message.content, 'Fallback route active');
    assert.deepEqual(mock.calls, [
      'https://api.openai.com/v1/chat/completions',
      'https://api.groq.com/openai/v1/chat/completions',
    ]);
  } finally {
    mock.restore();
  }
});

test('feature AI uses the central main primary even when the feature has no saved config', async () => {
  const env = makeEnv();
  const mock = mockFetch();
  try {
    await syncConfig(env, {
      primary: 'groq', model: 'openai/gpt-oss-20b', fallback: '',
      keys: { primary: { groq: ['gsk-main-primary-key-123456789'] }, fallback: {} },
    });
    const response = await generate(env, 'library');
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.choices[0].message.content, 'Fallback route active');
    assert.deepEqual(mock.calls, ['https://api.groq.com/openai/v1/chat/completions']);
  } finally {
    mock.restore();
  }
});


test('streaming feature requests use the central configured provider', async () => {
  const env = makeEnv();
  const mock = mockFetch();
  try {
    await syncConfig(env, {
      primary: 'groq', model: 'openai/gpt-oss-20b', fallback: '',
      keys: { primary: { groq: ['gsk-main-stream-key-123456789'] }, fallback: {} },
    });
    const response = await generate(env, 'studyhub', true);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Type') || '', /text\/event-stream/);
    assert.match(body, /Central streamed route active/);
    assert.deepEqual(mock.calls, ['https://api.groq.com/openai/v1/chat/completions']);
  } finally {
    mock.restore();
  }
});


test('transcription reads the central StudyHub Groq key instead of the legacy key store', async () => {
  const env = makeEnv();
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup')) {
      return new Response(JSON.stringify({ users: [{ localId: 'admin-uid', email: 'admin@example.com' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (target === 'https://api.groq.com/openai/v1/audio/transcriptions') {
      calls.push({ target, authorization: init.headers.Authorization });
      return new Response(JSON.stringify({ text: 'Central transcription works' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected network request: ' + target);
  };
  try {
    await syncConfigs(env, {
      main: { primary: 'groq', model: 'openai/gpt-oss-20b', fallback: '', keys: { primary: { groq: ['gsk-main-transcribe-key-123456789'] }, fallback: {} } },
      studyhub: { primary: 'groq', model: 'openai/gpt-oss-20b', fallback: '', keys: { primary: { groq: ['gsk-studyhub-transcribe-key-123456789'] }, fallback: {} } },
    });
    const form = new FormData();
    form.append('file', new Blob(['audio bytes'], { type: 'audio/webm' }), 'voice.webm');
    const response = await worker.fetch(new Request('https://worker.test/api/ai/transcribe', {
      method: 'POST', headers: { Authorization: 'Bearer test-token' }, body: form,
    }), env);
    const data = await response.json();
    assert.equal(response.status, 200, data.error || 'Unexpected transcription response');
    assert.equal(data.text, 'Central transcription works');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].authorization, 'Bearer gsk-studyhub-transcribe-key-123456789');
  } finally {
    globalThis.fetch = original;
  }
});
