# SmartQuiz Brevo Cloudflare Worker

This Worker replaces the Firebase `brevoEmail` Cloud Function. It keeps the
Brevo API key in Cloudflare Worker secrets and verifies Firebase ID tokens
before sending either an admin test email or a registration OTP.

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