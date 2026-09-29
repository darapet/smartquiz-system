const DEFAULT_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const MAX_PROMPT_LENGTH = 2000;

/*
 * Keep the quality policy here rather than in the browser. This means every
 * request that reaches the free engine gets the same image-quality guidance,
 * including requests made by older cached clients.
 */
const PROFESSIONAL_IMAGE_WRAPPER =
  'A hyper-realistic, photorealistic cinematic portrait of [USER_INPUT], shot on 85mm lens, f/1.4, sharp focus, volumetric dramatic studio lighting, highly detailed complex skin texture, 8k resolution, award-winning photography, path tracing --no blur, illustration, cartoon, low quality, watermark, drawing, digital painting, CGI, 3D render';

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!configured.length) return '*';
  return configured.includes(origin) ? origin : 'null';
}

function corsHeaders(request, env) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(request, env),
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function json(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function modelFor(env, requestedModel) {
  const configured = String(env.CF_IMAGE_MODEL || '').trim();
  const requested = String(requestedModel || '').trim();
  const model = requested || configured || DEFAULT_IMAGE_MODEL;
  const allowed = new Set([
    '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    '@cf/iohg/flux-1-schnell',
    '@cf/black-forest-labs/flux-1-schnell',
  ]);
  return allowed.has(model) ? model : DEFAULT_IMAGE_MODEL;
}

function enrichedPrompt(prompt) {
  return PROFESSIONAL_IMAGE_WRAPPER.replace('[USER_INPUT]', prompt);
}

function decodeBase64(value) {
  const normalized = String(value || '').replace(/^data:[^,]+,/, '').replace(/\s/g, '');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function imageBody(image) {
  let body = image;
  const isBinary = (value) => value instanceof ArrayBuffer
    || ArrayBuffer.isView(value)
    || (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream)
    || (typeof Blob !== 'undefined' && value instanceof Blob);
  if (body && typeof body === 'object' && !isBinary(body)) {
    body = body.image ?? body.data ?? body.output ?? body;
  }
  if (typeof body === 'string') return decodeBase64(body);
  if (Array.isArray(body)) return new Uint8Array(body);
  if (body && typeof body === 'object' && !isBinary(body)) {
    const values = Object.values(body);
    if (values.length && values.every((value) => Number.isInteger(value))) return new Uint8Array(values);
  }
  return body;
}

function imageResponse(request, env, image) {
  const body = imageBody(image);
  if (!body || (typeof body === 'object' && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body) && !(typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) && !(typeof Blob !== 'undefined' && body instanceof Blob))) {
    return json(request, env, { error: 'Cloudflare returned an invalid image payload.' }, 502);
  }
  return new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'image/png',
      'Content-Disposition': 'inline; filename="smartquiz-creator.png"',
      'X-Image-Engine': 'cloudflare-workers-ai',
    },
  });
}

export async function handleImage(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json(request, env, { error: 'Use GET or POST for image generation.' }, 405);
  }
  if (!env.AI || typeof env.AI.run !== 'function') {
    return json(request, env, { error: 'Cloudflare Workers AI is not configured.' }, 503);
  }

  const url = new URL(request.url);
  const payload = request.method === 'GET'
    ? {
        prompt: url.searchParams.get('prompt'),
        engine: url.searchParams.get('engine') || 'cloudflare',
        engineModel: url.searchParams.get('model') || url.searchParams.get('engineModel'),
      }
    : await request.json().catch(() => ({}));
  const prompt = String(payload && payload.prompt || '').replace(/\s+/g, ' ').trim();
  if (prompt.length < 3) {
    return json(request, env, { error: 'Enter a prompt with at least 3 characters.' }, 400);
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return json(request, env, { error: `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.` }, 400);
  }
  const engine = String(payload && payload.engine || 'cloudflare').trim().toLowerCase();
  if (engine !== 'cloudflare' && engine !== 'free') {
    return json(request, env, { error: 'This endpoint only supports the free Cloudflare engine.' }, 400);
  }

  try {
    const image = await env.AI.run(modelFor(env, payload.engineModel), {
      prompt: enrichedPrompt(prompt),
    });
    return imageResponse(request, env, image);
  } catch (error) {
    console.error('Cloudflare Workers AI image generation error:', error);
    return json(request, env, {
      error: 'Cloudflare Workers AI could not generate the image.',
    }, 502);
  }
}