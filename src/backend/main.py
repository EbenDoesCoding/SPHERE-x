#!/usr/bin/env python3

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
