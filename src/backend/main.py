#!/usr/bin/env python3

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from gaia import get_stars
from resolve import resolve

app = FastAPI(title="SPHERE-X API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    try:
        stars = get_stars(ra, dec, size)
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": f"Gaia query failed: {e}"})
    return {"stars": stars}
