#!/usr/bin/env python3

from pathlib import Path
from presets import DEMO_DIR, find_preset_frames, list_presets
from fastapi.staticfiles import StaticFiles
from spherex import SpherexError, build_frames
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from gaia import get_stars
from resolve import resolve
import cache

app = FastAPI(title="SPHERE-X API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
DEMO_DIR.mkdir(exist_ok=True)
app.mount("/demo", StaticFiles(directory=DEMO_DIR), name="demo")

SPHEREX_STATUS = {"bad_request": 400, "no_coverage": 404, "upstream_error": 502}

@app.exception_handler(SpherexError)
async def spherex_error_handler(request: Request, exc: SpherexError):
    status = SPHEREX_STATUS.get(exc.code, 500)
    return JSONResponse(status_code=status, content={"error": str(exc)})
@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": "Invalid or missing parameters"})


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"error": "Internal server error"})

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/resolve")
def resolve_endpoint(q: str):
    try:
        result = resolve(q)
    except ValueError as e:
        return JSONResponse(status_code=404, content={"error": str(e)})
    return {"name": q, "ra": result["ra"], "dec": result["dec"]}

@app.get("/stars")
def stars_endpoint(ra: float, dec: float, size: float = 2.0):
    cached = cache.load("stars", ra, dec, size)
    if cached is not None:
        return cached

    try:
        stars = get_stars(ra, dec, size)
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": f"Gaia query failed: {e}"})

    result = {"stars": stars}
    cache.save("stars", ra, dec, size, result)
    return result

@app.get("/frames")
def frames_endpoint(
    ra: float,
    dec: float,
    size: float = 0.05,  # degrees
    detector: int | None = None,
    mode: str = "best",
    group_id: int | None = None,
):
    # Presets were built with default options, so only use them for default requests
    if detector is None and mode == "best" and group_id is None:
        preset = find_preset_frames(ra, dec, size)
        if preset is not None:
            return preset

    # Live path: one folder per unique request so users never overwrite each other's PNGs.
    # image_url values are relative: the frontend must prepend the API base URL.
    group = "auto" if group_id is None else group_id
    folder = f"{ra:.4f}_{dec:.4f}_{size:.4f}_{detector or 'auto'}_{mode}_{group}"
    return build_frames(
        ra,
        dec,
        size,
        detector,
        STATIC_DIR / "frames" / folder,
        f"/static/frames/{folder}",
        mode=mode,
        group_id=group_id,
    )

@app.get("/presets")
def presets_endpoint():
    return {"presets": list_presets()}
