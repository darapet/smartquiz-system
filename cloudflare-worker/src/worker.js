const DEFAULT_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const MAX_PROMPT_LENGTH = 2000;

/*
 * Keep the quality policy here rather than in the browser. This means every
 * request that reaches the free engine gets the same image-quality guidance,
 * including requests made by older cached clients.
 */
const QUALITY_DIRECTION = {
  logo: 'Create a polished, scalable brand mark with one memorable symbol, balanced geometry, clean edges, intentional negative space, and a simple presentation on a plain background. Keep it vector-like and production-ready. Do not add random lettering, mockup scenes, gradients, shadows, or extra symbols unless requested.',
  banner: 'Create a premium website hero banner with clear visual hierarchy, one strong focal subject, refined lighting, controlled detail, and deliberate negative space for headline text. Keep the composition wide, balanced, and suitable for a professional landing page.',
  social: 'Create a polished social-media campaign visual with a clear focal subject, strong mobile-first composition, refined color grading, clean separation from the background, and enough breathing room for a short caption. Make it feel designed, not like a random snapshot.',
  portrait: 'Create a professional portrait or character image with a clear silhouette, natural anatomy, expressive but controlled pose, flattering light, detailed face and clothing, and a clean background. Include only the subjects requested.',
  general: 'Create one coherent, professionally art-directed composition. Keep the requested subjects, relationships, setting, colors, mood, and action faithful to the brief. Remove clutter and unrelated objects.',
};

function enrichedPrompt(prompt, category, aspectRatio) {
  const brief = String(prompt || '').replace(/\s+/g, ' ').trim();
  const direction = QUALITY_DIRECTION[category] || QUALITY_DIRECTION.general;
  const canvas = aspectRatio === 'landscape' ? 'Use a wide landscape composition.'
    : aspectRatio === 'portrait' ? 'Use a tall portrait composition.'
      : 'Use a balanced square composition.';
  return [
    direction,
    canvas,
    'User brief: "' + brief + '".',
    'Prioritize accurate subject identity, intentional composition, crisp edges, believable materials, professional color harmony, and a clean final finish.',
    'Avoid watermarks, logos not requested, random text, malformed letters, duplicate subjects, extra limbs, blur, noise, clutter, and unfinished artifacts.',
  ].join(' ');
}

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

function isBinaryBody(value) {
  return value instanceof ArrayBuffer
    || ArrayBuffer.isView(value)
    || (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream)
    || (typeof Blob !== 'undefined' && value instanceof Blob);
}

function imageBody(image) {
  if (typeof Response !== 'undefined' && image instanceof Response) return image.body;
  if (isBinaryBody(image)) return image;
  if (typeof image === 'string') {
    try { return decodeBase64(image); } catch (_) { return null; }
  }
  if (!image || typeof image !== 'object') return null;

  const nested = image.image ?? image.data ?? image.output;
  if (nested !== undefined && nested !== image) return imageBody(nested);

  const values = Object.values(image);
  if (values.length && values.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
    return new Uint8Array(values);
  }
  return null;
}

function imageResponse(request, env, image) {
  const body = imageBody(image);
  if (!body || !isBinaryBody(body)) {
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
        category: url.searchParams.get('category') || 'general',
        aspectRatio: url.searchParams.get('aspectRatio') || 'square',
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
      prompt: enrichedPrompt(prompt, payload.category, payload.aspectRatio),
    });
    return imageResponse(request, env, image);
  } catch (error) {
    console.error('Cloudflare Workers AI image generation error:', error);
    return json(request, env, {
      error: 'Cloudflare Workers AI could not generate the image.',
    }, 502);
  }
}