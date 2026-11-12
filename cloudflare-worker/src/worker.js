import { directDesign } from './design-director.js';
import { composeDesignSvg } from './design-renderer.js';

const DEFAULT_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const PROFESSIONAL_IMAGE_MODEL = '@cf/leonardo/lucid-origin';
const LUCID_DAILY_REQUEST_LIMIT = 3;
const LUCID_DAILY_BUDGET_KEY = 'xzily-lucid-usage:';
const MAX_PROMPT_LENGTH = 2000;


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

function modelFor(requestedModel) {
  const requested = String(requestedModel || '').trim();
  const allowed = new Set([
    '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    '@cf/iohg/flux-1-schnell',
    '@cf/black-forest-labs/flux-1-schnell',
    PROFESSIONAL_IMAGE_MODEL,
  ]);

  // Use FLUX.1 schnell by default for every category. A different model,
  // including Lucid Origin, is used only when the caller explicitly requests it.
  return allowed.has(requested) ? requested : DEFAULT_IMAGE_MODEL;
}

async function reserveLucidDailySlot(env) {
  if (!env.EMAIL_CONFIG || typeof env.EMAIL_CONFIG.get !== 'function' || typeof env.EMAIL_CONFIG.put !== 'function') {
    throw new Error('Design usage protection is not configured.');
  }
  const day = new Date().toISOString().slice(0, 10);
  const key = LUCID_DAILY_BUDGET_KEY + day;
  const current = Number(await env.EMAIL_CONFIG.get(key) || 0);
  if (current >= LUCID_DAILY_REQUEST_LIMIT) return false;
  await env.EMAIL_CONFIG.put(key, String(current + 1), { expirationTtl: 172800 });
  return true;
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

function imageResponse(request, env, image, model) {
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
      'X-Image-Model': String(model || DEFAULT_IMAGE_MODEL),
    },
  });
}


/* Image-to-image editing for Studio, using Cloudflare FLUX.2 Klein 4B. */
export async function handleImageEdit(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (request.method !== 'POST') {
    return json(request, env, { error: 'Use POST to edit an image.' }, 405);
  }
  if (!env.AI || typeof env.AI.run !== 'function') {
    return json(request, env, { error: 'Cloudflare Workers AI is not configured.' }, 503);
  }
  try {
    const incoming = await request.formData();
    const prompt = String(incoming.get('prompt') || '').replace(/\s+/g, ' ').trim();
    const inputImage = incoming.get('image');
    if (prompt.length < 3 || prompt.length > MAX_PROMPT_LENGTH) {
      return json(request, env, { error: 'Enter an image-edit instruction between 3 and 2000 characters.' }, 400);
    }
    if (!(inputImage instanceof Blob) || !String(inputImage.type || '').startsWith('image/')) {
      return json(request, env, { error: 'Attach a valid image to edit.' }, 400);
    }
    if (inputImage.size > 8 * 1024 * 1024) {
      return json(request, env, { error: 'The image must be 8 MB or smaller.' }, 413);
    }
    const form = new FormData();
    form.append('prompt', 'Edit the provided reference image according to these instructions while preserving all elements not requested to change: ' + prompt);
    form.append('input_image_0', inputImage, 'studio-input-image');
    form.append('width', '1024');
    form.append('height', '1024');
    const serialized = new Response(form);
    const image = await env.AI.run('@cf/black-forest-labs/flux-2-klein-4b', {
      multipart: { body: serialized.body, contentType: serialized.headers.get('content-type') },
    });
    return imageResponse(request, env, image);
  } catch (error) {
    console.error('XZILY Studio image edit error:', error);
    return json(request, env, { error: 'The image editing service could not complete this edit. Please try again.' }, 502);
  }
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
    const design = directDesign(prompt, payload.category, payload.aspectRatio);
    const category = design.category;
    const model = modelFor(payload.engineModel);
    if (model === PROFESSIONAL_IMAGE_MODEL) {
      let image;
      let imageModel = model;
      try {
        const slotAvailable = await reserveLucidDailySlot(env);
        if (!slotAvailable) {
          throw new Error('The daily professional-design allowance has been reached.');
        }
        image = await env.AI.run(model, {
          prompt: design.prompt + ' Create the visual artwork/background only. Do not render any words, letters, numbers, captions, labels, logos or watermarks; reserve clean contrast space for separately typeset copy.',
          ...design.dimensions,
          num_steps: 12,
          guidance: 5,
        });
      } catch (professionalError) {
        console.warn('XZILY professional image model unavailable; trying the standard image model:', professionalError && professionalError.message || professionalError);
        imageModel = DEFAULT_IMAGE_MODEL;
        image = await env.AI.run(DEFAULT_IMAGE_MODEL, {
          prompt: design.prompt + ' Create a polished visual artwork/background only. Do not render words, letters, numbers, captions, labels, logos or watermarks; reserve clean contrast space for separately typeset copy.',
          steps: 8,
        });
      }

      const rawBody = imageBody(image);
      if (rawBody instanceof ArrayBuffer || ArrayBuffer.isView(rawBody)) {
        const svg = composeDesignSvg(new Uint8Array(rawBody.buffer || rawBody, rawBody.byteOffset || 0, rawBody.byteLength), design, prompt, payload.copy);
        if (svg) {
          return new Response(svg, {
            status: 200,
            headers: {
              ...corsHeaders(request, env),
              'Content-Type': 'image/svg+xml; charset=utf-8',
              'Content-Disposition': 'inline; filename="xzily-professional-design.svg"',
              'X-Image-Engine': 'xzily-design-renderer',
              'X-Image-Model': String(imageModel),
            },
          });
        }
      }
      return imageResponse(request, env, image, imageModel);
    }
    const image = await env.AI.run(model, {
      prompt: design.prompt,
    });
    return imageResponse(request, env, image, model);
  } catch (error) {
    console.error('Cloudflare Workers AI image generation error:', error);
    const detail = String(error && error.message || 'Unknown image-generation error')
      .replace(/[\\r\\n\\t]/g, ' ')
      .slice(0, 220);
    return json(request, env, {
      error: 'Cloudflare Workers AI could not generate the image.',
      detail,
    }, 502);
  }
}