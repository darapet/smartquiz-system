# AI Creator Studio Pro

AI Creator Studio Pro is available as a standalone page at:

`/ai-creator-studio-pro/`

The shared SmartQuiz navigation adds a visible **Creator Studio** link to the
existing public navigation. The page bundle is a static Vite build and keeps
its API calls on the existing `/api` path.

## FastAPI service

The companion service is in `api/`:

```bash
python -m pip install -r api/requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8080 --app-dir api
```

For the integrated SmartQuiz page, enter up to five image-generation tokens in
**Admin Settings → AI Creator Studio — Image Generation Keys**. Image requests
are sent to the `creatorImageGenerate` Firebase Function, which reads the
dedicated pool server-side, rotates tokens, cools down rate-limited tokens, and
returns the Gemini image result. The public page never receives the Gemini
tokens.

The Creator Studio engine selector also includes **Free Engine (Default) ·
Cloudflare Workers AI**. It sends the prompt to
`https://smartquiz-system3.daramolapeter98.workers.dev/api/image`, receives a
raw PNG, and displays it in the existing result panel. Change
`window._AQS_CREATOR_IMAGE_WORKER_URL` in `index.html` if the Worker is deployed
at another URL. If the URL is empty or the Worker is unavailable, the bridge
falls back to the existing Gemini function.

Deploy the secure image function from the repository root before expecting
managed Hugging Face tokens to be used:

```bash
firebase deploy --only functions:creatorImageGenerate
```

Until the Worker or Gemini function is deployed, image mode will show the
existing service error instead of creating a separate image page.

For the separate FastAPI deployment, configure `HF_API_KEYS` as a
comma-separated server-side secret for Hugging Face image generation and photo
editing. Do not place provider keys in the static page or commit them to the
repository.

The service provides:

- `GET /api/healthz`
- `GET /api/quota`
- `GET /api/generations`
- `POST /api/generate`

Image generation uses Hugging Face FLUX.1-schnell when configured and
returns a clear provider error when no configured image provider is available.
Video generation also requires a configured provider, while Photo Editor requires
a Hugging Face credential and a base image.