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
**Admin Settings → AI Creator Studio — Image Generation Keys**. The shared
Firebase settings loader supplies that dedicated pool to the image mode, which
rotates tokens and cools down rate-limited tokens automatically.

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
Pollinations FLUX as a fallback. Video generation uses the Pollinations video
URL, while Photo Editor requires a Hugging Face credential and a base image.