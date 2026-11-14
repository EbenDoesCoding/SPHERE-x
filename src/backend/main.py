#!/usr/bin/env python3

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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
