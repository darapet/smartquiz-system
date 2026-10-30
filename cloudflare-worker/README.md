# SmartQuiz Brevo Cloudflare Worker

This Worker replaces the Firebase `brevoEmail` Cloud Function. It keeps the
Brevo API key in Cloudflare Worker storage and verifies Firebase ID tokens
before sending admin or signed-in-user emails. Registration OTP delivery and
account creation are handled directly by this Worker, so a new user does not
need to be authenticated and the Worker does not depend on a separate
registration Cloud Function.

## Deploy

From this directory:

```bash
npm install -D wrangler
npx wrangler login
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put BREVO_FROM_NAME
npx wrangler secret put BREVO_FROM_EMAIL
npx wrangler deploy
```

Set `ALLOWED_ORIGINS` in `wrangler.toml` to the actual browser origin(s), then
deploy again. If the Worker is attached to a custom Cloudflare domain with the
route `/api/email`, the existing web client will call it automatically.

If the Worker uses a `workers.dev` URL instead of a custom-domain route, set
`window.AQS_BREVO_FUNCTION_URL` to that URL before loading the Firebase module.

Never put `BREVO_API_KEY` in `wrangler.toml`, browser JavaScript, or GitHub.

## Creator Studio image engine

The same Worker also exposes `POST /api/image` for the free Creator Studio
engine. It calls the native `env.AI` binding and returns the generated image as
a raw `image/png` response. CORS is limited by `ALLOWED_ORIGINS`.

The AI binding is declared in `wrangler.toml`; deploy it from this directory:

```bash
npx wrangler login
npx wrangler deploy
```

The default model is `@cf/stabilityai/stable-diffusion-xl-base-1.0`. Change
`CF_IMAGE_MODEL` only to one of the allowlisted models in `src/worker.js`.
The existing `/api/email` and `/brevoEmail` routes remain unchanged.