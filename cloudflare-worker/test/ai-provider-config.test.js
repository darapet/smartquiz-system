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

function mockFetch({ openaiStatus = 200, statusSequence = null } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup')) {
      return new Response(JSON.stringify({ users: [{ localId: 'admin-uid', email: 'admin@example.com' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    calls.push({ url: target, authorization: init.headers && init.headers.Authorization || '' });
    const configuredStatus = Array.isArray(statusSequence)
      ? (statusSequence[calls.length - 1] == null ? 200 : statusSequence[calls.length - 1])
      : target === 'https://api.openai.com/v1/chat/completions' ? openaiStatus : 200;
    if (target === 'https://api.openai.com/v1/chat/completions' || target === 'https://api.groq.com/openai/v1/chat/completions') {
      if (configuredStatus !== 200) {
        return new Response(JSON.stringify({ error: { message: 'Temporary provider limit' } }), {
          status: configuredStatus, headers: { 'Content-Type': 'application/json' },
        });
      }
      const requestBody = JSON.parse(init.body || '{}');
      if (requestBody.stream === true) {
        return new Response('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content: 'Central streamed route active' }, finish_reason: null }] }) + '\\n\\ndata: [DONE]\\n\\n', {
          status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        });
      }
      const isOpenAI = target === 'https://api.openai.com/v1/chat/completions';
      return new Response(JSON.stringify({
        id: 'chatcmpl-test', object: 'chat.completion', model: isOpenAI ? 'gpt-4.1-mini' : 'openai/gpt-oss-20b',
        choices: [{ index: 0, message: { role: 'assistant', content: isOpenAI ? 'OpenAI route active' : 'Fallback route active' }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('Unexpected network request: ' + target);
  };
  return {
    calls,
    restore() { globalThis.fetch = original; },
    urls() { return calls.map((call) => call.url); },
  };
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
    assert.deepEqual(mock.urls(), ['https://api.openai.com/v1/chat/completions']);
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
    assert.deepEqual(mock.urls(), [
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
    assert.deepEqual(mock.urls(), [
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
    assert.deepEqual(mock.urls(), ['https://api.groq.com/openai/v1/chat/completions']);
  } finally {
    mock.restore();
  }
});



test('feature primary and fallback failures continue to Main AI primary', async () => {
  const env = makeEnv();
  const mock = mockFetch({ statusSequence: [429, 429, 200] });
  try {
    await syncConfigs(env, {
      main: {
        primary: 'openai', model: 'gpt-4.1-mini', fallback: 'groq', fallbackModel: 'openai/gpt-oss-20b',
        keys: { primary: { openai: ['sk-main-primary-key-123456789'] }, fallback: { groq: ['gsk-main-fallback-key-123456789'] } },
      },
      studyhub: {
        primary: 'openai', model: 'gpt-4.1-mini', fallback: 'groq', fallbackModel: 'openai/gpt-oss-20b',
        keys: { primary: { openai: ['sk-studyhub-primary-key-123456789'] }, fallback: { groq: ['gsk-studyhub-fallback-key-123456789'] } },
      },
    });
    const response = await generate(env, 'studyhub');
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.choices[0].message.content, 'OpenAI route active');
    assert.deepEqual(mock.urls(), [
      'https://api.openai.com/v1/chat/completions',
      'https://api.groq.com/openai/v1/chat/completions',
      'https://api.openai.com/v1/chat/completions',
    ]);
    assert.equal(mock.calls[2].authorization, 'Bearer sk-main-primary-key-123456789');
  } finally {
    mock.restore();
  }
});

test('Main AI fallback is used when feature routes and Main AI primary fail', async () => {
  const env = makeEnv();
  const mock = mockFetch({ statusSequence: [429, 429, 429, 200] });
  try {
    await syncConfigs(env, {
      main: {
        primary: 'openai', model: 'gpt-4.1-mini', fallback: 'groq', fallbackModel: 'openai/gpt-oss-20b',
        keys: { primary: { openai: ['sk-main-primary-key-123456789'] }, fallback: { groq: ['gsk-main-fallback-key-123456789'] } },
      },
      studyhub: {
        primary: 'openai', model: 'gpt-4.1-mini', fallback: 'groq', fallbackModel: 'openai/gpt-oss-20b',
        keys: { primary: { openai: ['sk-studyhub-primary-key-123456789'] }, fallback: { groq: ['gsk-studyhub-fallback-key-123456789'] } },
      },
    });
    const response = await generate(env, 'studyhub');
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.choices[0].message.content, 'Fallback route active');
    assert.deepEqual(mock.urls(), [
      'https://api.openai.com/v1/chat/completions',
      'https://api.groq.com/openai/v1/chat/completions',
      'https://api.openai.com/v1/chat/completions',
      'https://api.groq.com/openai/v1/chat/completions',
    ]);
    assert.equal(mock.calls[3].authorization, 'Bearer gsk-main-fallback-key-123456789');
  } finally {
    mock.restore();
  }
});

test('Main AI requests try only Main AI primary and fallback without recursive routing', async () => {
  const env = makeEnv();
  const mock = mockFetch({ statusSequence: [429, 200] });
  try {
    await syncConfig(env, {
      primary: 'openai', model: 'gpt-4.1-mini', fallback: 'groq', fallbackModel: 'openai/gpt-oss-20b',
      keys: { primary: { openai: ['sk-main-primary-key-123456789'] }, fallback: { groq: ['gsk-main-fallback-key-123456789'] } },
    });
    const response = await generate(env, 'main');
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.choices[0].message.content, 'Fallback route active');
    assert.deepEqual(mock.urls(), [
      'https://api.openai.com/v1/chat/completions',
      'https://api.groq.com/openai/v1/chat/completions',
    ]);
  } finally {
    mock.restore();
  }
});

test('all configured routes failing returns a clear unavailable error', async () => {
  const env = makeEnv();
  const mock = mockFetch({ statusSequence: [429, 429, 429, 429] });
  try {
    await syncConfigs(env, {
      main: {
        primary: 'openai', model: 'gpt-4.1-mini', fallback: 'groq', fallbackModel: 'openai/gpt-oss-20b',
        keys: { primary: { openai: ['sk-main-primary-key-123456789'] }, fallback: { groq: ['gsk-main-fallback-key-123456789'] } },
      },
      studyhub: {
        primary: 'openai', model: 'gpt-4.1-mini', fallback: 'groq', fallbackModel: 'openai/gpt-oss-20b',
        keys: { primary: { openai: ['sk-studyhub-primary-key-123456789'] }, fallback: { groq: ['gsk-studyhub-fallback-key-123456789'] } },
      },
    });
    const response = await generate(env, 'studyhub');
    const data = await response.json();
    assert.equal(response.status, 429);
    assert.match(data.error || '', /Feature and main AI routes are unavailable/);
    assert.equal(mock.calls.length, 4);
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
    assert.deepEqual(mock.urls(), ['https://api.groq.com/openai/v1/chat/completions']);
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
      main: { primary: 'groq', model: 'openai/gpt-oss-20b', fallback: '', keys: { primary: { groq: ['gsk_main_transcribe_key_123456789'] }, fallback: {} } },
      studyhub: { primary: 'groq', model: 'openai/gpt-oss-20b', fallback: '', keys: { primary: { groq: ['gsk_studyhub_transcribe_key_123456789'] }, fallback: {} } },
    });
    const savedConfig = await env.EMAIL_CONFIG.get('ai-provider-config', 'json');
    assert.ok(savedConfig && savedConfig.features && savedConfig.features.studyhub, JSON.stringify(savedConfig));
    assert.deepEqual(savedConfig.features.studyhub.keys.primary.groq, ['gsk_studyhub_transcribe_key_123456789']);
    const form = new FormData();
    form.append('file', new Blob(['audio bytes'], { type: 'audio/webm' }), 'voice.webm');
    const response = await worker.fetch(new Request('https://worker.test/api/ai/transcribe', {
      method: 'POST', headers: { Authorization: 'Bearer test-token' }, body: form,
    }), env);
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.text, 'Central transcription works');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].authorization, 'Bearer gsk_studyhub_transcribe_key_123456789');
  } finally {
    globalThis.fetch = original;
  }
});
