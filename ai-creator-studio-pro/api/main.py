"""FastAPI service for AI Creator Studio Pro.

The service keeps provider credentials server-side, applies the quality prompt
policy before every request, and uses SQLite for a small, durable IP quota.
"""

from __future__ import annotations

import base64
import binascii
import os
import sqlite3
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("STUDIO_DB_PATH", BASE_DIR / "studio.sqlite3"))
MEDIA_DIR = Path(os.getenv("STUDIO_MEDIA_DIR", BASE_DIR / "media"))
FREE_LIMIT = 5
WINDOW = timedelta(hours=24)
QUALITY_NEGATIVE_PROMPT = (
    "bad hands, extra fingers, deformed limbs, fused body parts, extra arms, "
    "low quality, pixelated, distorted faces"
)
VECTOR_BOOST = (
    "flat vector design, clean lines, professional graphic design, centered, "
    "white background, high resolution"
)
ASPECTS: dict[str, tuple[int, int]] = {
    "square": (1024, 1024),
    "landscape": (1024, 576),
    "portrait": (576, 1024),
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now(value: datetime | None = None) -> str:
    return (value or utc_now()).isoformat()


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialise_database() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS quota_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip_address TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS generations (
                id TEXT PRIMARY KEY,
                ip_address TEXT NOT NULL,
                media_type TEXT NOT NULL,
                url TEXT NOT NULL,
                provider TEXT NOT NULL,
                prompt TEXT NOT NULL,
                created_at TEXT NOT NULL,
                quality_notes TEXT NOT NULL,
                fallback_used INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS quota_events_ip_created "
            "ON quota_events (ip_address, created_at)"
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialise_database()
    yield


app = FastAPI(
    title="AI Creator Studio Pro API",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/api/media", StaticFiles(directory=MEDIA_DIR), name="media")


Mode = Literal["image", "video", "photo"]
Category = Literal["logo", "banner", "avatar", "general"]
AspectRatio = Literal["square", "landscape", "portrait"]


class GenerationInput(BaseModel):
    mode: Mode
    prompt: str = Field(min_length=3, max_length=2000)
    category: Category
    aspectRatio: AspectRatio
    inputImageDataUrl: str | None = Field(default=None, max_length=10_000_000)

    @field_validator("prompt")
    @classmethod
    def trim_prompt(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 3:
            raise ValueError("Prompt must contain at least three characters.")
        return cleaned


class QualityEnhancer:
    def enhance(self, request: GenerationInput) -> tuple[str, list[str]]:
        prompt = request.prompt
        notes = ["Anatomy-safe negative prompt applied automatically."]
        if request.category in {"logo", "banner"}:
            prompt = f"{prompt}, {VECTOR_BOOST}"
            notes.append("Vector composition boost applied for graphic design work.")
        prompt = f"{prompt}. Negative prompt: {QUALITY_NEGATIVE_PROMPT}"
        return prompt, notes


quality_enhancer = QualityEnhancer()


def request_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:128]
    return (request.client.host if request.client else "unknown")[:128]


def prune_quota_events(connection: sqlite3.Connection) -> None:
    threshold = iso_now(utc_now() - WINDOW)
    connection.execute("DELETE FROM quota_events WHERE created_at < ?", (threshold,))


def quota_for(ip_address: str) -> dict[str, Any]:
    now = utc_now()
    threshold = iso_now(now - WINDOW)
    with get_connection() as connection:
        prune_quota_events(connection)
        rows = connection.execute(
            "SELECT created_at FROM quota_events "
            "WHERE ip_address = ? AND created_at >= ? "
            "ORDER BY created_at ASC",
            (ip_address, threshold),
        ).fetchall()
    used = len(rows)
    if rows:
        resets_at = datetime.fromisoformat(rows[0]["created_at"]) + WINDOW
    else:
        resets_at = now + WINDOW
    return {
        "used": used,
        "limit": FREE_LIMIT,
        "remaining": max(0, FREE_LIMIT - used),
        "resetsAt": iso_now(resets_at),
        "plan": "Free",
    }


def reserve_credit(ip_address: str) -> dict[str, Any] | None:
    threshold = iso_now(utc_now() - WINDOW)
    with get_connection() as connection:
        prune_quota_events(connection)
        count = connection.execute(
            "SELECT COUNT(*) FROM quota_events "
            "WHERE ip_address = ? AND created_at >= ?",
            (ip_address, threshold),
        ).fetchone()[0]
        if count >= FREE_LIMIT:
            return None
        connection.execute(
            "INSERT INTO quota_events (ip_address, created_at) VALUES (?, ?)",
            (ip_address, iso_now()),
        )
    return quota_for(ip_address)


def configured_hf_keys() -> list[str]:
    values = os.getenv("HF_API_KEYS", "")
    keys = [item.strip() for item in values.split(",") if item.strip()]
    if not keys and os.getenv("HF_TOKEN"):
        keys = [os.environ["HF_TOKEN"].strip()]
    return keys


def parse_data_url(value: str) -> tuple[str, bytes]:
    if not value.startswith("data:") or ";base64," not in value:
        raise ValueError("Photo Editor requires a base64 data URL image.")
    header, encoded = value.split(";base64,", 1)
    mime = header.removeprefix("data:").lower()
    if mime not in {"image/png", "image/jpeg", "image/webp"}:
        raise ValueError("Use a PNG, JPEG, or WebP image.")
    try:
        return mime, base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValueError("The uploaded image could not be read.") from error


def save_media(content: bytes, extension: str) -> str:
    filename = f"{uuid.uuid4().hex}.{extension}"
    (MEDIA_DIR / filename).write_bytes(content)
    return f"/api/media/{filename}"


async def hf_image(
    prompt: str,
    dimensions: tuple[int, int],
    keys: list[str],
) -> tuple[str, str] | None:
    endpoint = (
        "https://api-inference.huggingface.co/models/"
        "black-forest-labs/FLUX.1-schnell"
    )
    width, height = dimensions
    async with httpx.AsyncClient(timeout=120) as client:
        for key in keys:
            response = await client.post(
                endpoint,
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "inputs": prompt,
                    "parameters": {"width": width, "height": height},
                },
            )
            if response.status_code == 429:
                continue
            if response.status_code == 200 and response.headers.get(
                "content-type", ""
            ).startswith("image/"):
                extension = response.headers.get("content-type", "image/png").split(
                    "/"
                )[-1]
                return save_media(response.content, extension), "Hugging Face FLUX.1-schnell"
    return None


async def hf_photo_edit(
    prompt: str,
    image_data_url: str,
    keys: list[str],
) -> tuple[str, str] | None:
    mime, image_bytes = parse_data_url(image_data_url)
    endpoint = (
        "https://api-inference.huggingface.co/models/"
        f"{os.getenv('HF_IMAGE_EDIT_MODEL', 'timbrooks/instruct-pix2pix')}"
    )
    extension = mime.split("/")[-1].replace("jpeg", "jpg")
    async with httpx.AsyncClient(timeout=120) as client:
        for key in keys:
            headers = {"Authorization": f"Bearer {key}"}
            response = await client.post(
                endpoint,
                headers=headers,
                files={"image": (f"source.{extension}", image_bytes, mime)},
                data={"prompt": prompt},
            )
            if response.status_code == 429:
                continue
            if response.status_code == 200 and response.headers.get(
                "content-type", ""
            ).startswith("image/"):
                output_extension = response.headers.get(
                    "content-type", "image/png"
                ).split("/")[-1]
                return save_media(response.content, output_extension), (
                    "Hugging Face image-to-image"
                )
    return None


async def hf_video(prompt: str, keys: list[str]) -> tuple[str, str] | None:
    models = ["Lightricks/LTX-Video", "Wan-AI/Wan2.1-T2V-14B"]
    async with httpx.AsyncClient(timeout=180) as client:
        for model in models:
            endpoint = f"https://api-inference.huggingface.co/models/{model}"
            for key in keys:
                response = await client.post(
                    endpoint,
                    headers={"Authorization": f"Bearer {key}"},
                    json={"inputs": prompt},
                )
                if response.status_code == 429:
                    continue
                if response.status_code == 200 and response.headers.get(
                    "content-type", ""
                ).startswith("video/"):
                    return save_media(response.content, "mp4"), f"Hugging Face {model}"
    return None


def pollinations_image(prompt: str, dimensions: tuple[int, int]) -> str:
    width, height = dimensions
    encoded = quote(prompt, safe="")
    return (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width={width}&height={height}&model=flux&nologo=true"
    )


def pollinations_video(prompt: str) -> str:
    encoded = quote(prompt, safe="")
    return (
        f"https://pollinations.ai/p/{encoded}"
        "?width=1024&height=576&model=flux&video=true"
    )


async def route_generation(
    request: GenerationInput,
    enhanced_prompt: str,
) -> tuple[str, str, bool]:
    dimensions = ASPECTS[request.aspectRatio]
    keys = configured_hf_keys()

    if request.mode == "photo":
        if not request.inputImageDataUrl:
            raise ValueError("Photo Editor requires a base image.")
        if not keys:
            raise RuntimeError(
                "Photo Editor needs an HF_API_KEYS or HF_TOKEN server credential."
            )
        result = await hf_photo_edit(enhanced_prompt, request.inputImageDataUrl, keys)
        if result:
            return result[0], result[1], False
        raise RuntimeError("Hugging Face image-to-image providers are unavailable.")

    if request.mode == "video":
        # Pollinations is intentionally first for video because it can return a
        # playable URL without a long-running job queue in this small service.
        return pollinations_video(enhanced_prompt), "Pollinations video", False

    if keys:
        result = await hf_image(enhanced_prompt, dimensions, keys)
        if result:
            return result[0], result[1], False
    return pollinations_image(enhanced_prompt, dimensions), "Pollinations FLUX", True


def store_generation(
    ip_address: str,
    media_type: str,
    url: str,
    provider: str,
    prompt: str,
    quality_notes: list[str],
    fallback_used: bool,
) -> dict[str, Any]:
    generation_id = uuid.uuid4().hex
    created_at = iso_now()
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO generations
                (id, ip_address, media_type, url, provider, prompt, created_at,
                 quality_notes, fallback_used)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                generation_id,
                ip_address,
                media_type,
                url,
                provider,
                prompt,
                created_at,
                "||".join(quality_notes),
                int(fallback_used),
            ),
        )
    return {
        "id": generation_id,
        "mediaType": media_type,
        "url": url,
        "provider": provider,
        "prompt": prompt,
        "createdAt": created_at,
        "qualityNotes": quality_notes,
        "fallbackUsed": fallback_used,
    }


@app.get("/api/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/quota")
async def get_quota(request: Request) -> dict[str, Any]:
    return quota_for(request_ip(request))


@app.get("/api/generations")
async def list_generations(request: Request) -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, media_type, url, provider, prompt, created_at,
                   quality_notes, fallback_used
            FROM generations
            WHERE ip_address = ?
            ORDER BY created_at DESC
            LIMIT 12
            """,
            (request_ip(request),),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "mediaType": row["media_type"],
            "url": row["url"],
            "provider": row["provider"],
            "prompt": row["prompt"],
            "createdAt": row["created_at"],
            "qualityNotes": row["quality_notes"].split("||"),
            "fallbackUsed": bool(row["fallback_used"]),
        }
        for row in rows
    ]


@app.post("/api/generate")
async def create_generation(payload: GenerationInput, request: Request):
    ip_address = request_ip(request)
    quota = reserve_credit(ip_address)
    if quota is None:
        return JSONResponse(
            status_code=429,
            content=quota_for(ip_address),
        )

    enhanced_prompt, quality_notes = quality_enhancer.enhance(payload)
    try:
        url, provider, fallback_used = await route_generation(payload, enhanced_prompt)
    except ValueError as error:
        return JSONResponse(status_code=400, content={"error": str(error)})
    except RuntimeError as error:
        return JSONResponse(status_code=502, content={"error": str(error)})
    except httpx.HTTPError:
        return JSONResponse(
            status_code=502,
            content={"error": "The selected generation providers are unavailable."},
        )

    result = store_generation(
        ip_address=ip_address,
        media_type="video" if payload.mode == "video" else "image",
        url=url,
        provider=provider,
        prompt=payload.prompt,
        quality_notes=quality_notes,
        fallback_used=fallback_used,
    )
    return result