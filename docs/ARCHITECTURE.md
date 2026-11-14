# Architecture

Backend only (the frontend owner adds a section). Code is in `src/backend`. `CLAUDE.md` calls this folder `/api`; the repo uses `src/backend`.

## Overview

```
Browser (frontend)
   │  HTTPS, JSON, PNGs
   ▼
FastAPI on Render (src/backend)
   ├── /resolve   → resolve.py  → CDS Sesame / SIMBAD
   ├── /stars     → gaia.py     → Gaia DR3 (ESA archive)
   ├── /frames    → presets.py  → demo_cache/  (instant)
   │              └ spherex.py  → IRSA TAP + cutouts (slow, live)
   ├── /overlay   → overlay.py  → frames + Gaia + proper motion
   ├── /presets   → presets.py
   └── static     /demo (demo_cache/), /static (live frames)
```

## Files

| File | Owner | Job |
|---|---|---|
| `main.py` | B2 | Routes, CORS, error handlers, static mounts, concurrency limit |
| `resolve.py` | B2 | Name, degrees or sexagesimal → RA/Dec |
| `gaia.py` | B2 | Gaia DR3 cone search with retries (max 200 stars) |
| `cache.py` | B2 | JSON disk cache (`cache/` runtime, `demo_cache/` committed) |
| `presets.py` | B2 | List presets, match a request to a precomputed preset |
| `overlay.py` | B2 | Proper-motion-corrected pixel positions per frame |
| `cleanup.py` | B2 | Keeps only the 20 newest live-frame folders |
| `precache.py` | B2 | Early script: Gaia stars for 5 demo stars (superseded) |
| `precache_frames.py` | B2 | Builds frames and stars for the 5 challenge targets into `demo_cache/` |
| `spherex.py` | B1 | IRSA search, cutouts, wavelength grouping, reprojection, PNGs |

B1 is unavailable at the moment; B2 maintains `spherex.py` until he returns.

## Request flow: `/frames`

1. Validate input (done in `spherex.py`).
2. If default options and the position matches a preset: return its saved `frames.json` from `demo_cache/frames/<slug>/`. No network.
3. Else if `static/frames/<folder>/frames.json` exists: return it.
4. Else try to take a live-build slot (`BoundedSemaphore(1)`). If none is free: 503 `{error}` immediately.
5. Run `build_frames()`:
   1. IRSA TAP query lists exposures covering the position.
   2. Download up to 80 cutouts in parallel, with retries.
   3. Group by wavelength, rank groups, select frames.
   4. Reproject onto one common sky grid, apply one shared stretch, write PNGs.
6. Save `frames.json` next to the PNGs, trim old live folders, return.

`/overlay` calls the same frame code, then Gaia (via `/stars` logic and cache), then `build_overlay()`.

## Caches

| Location | In git | Content |
|---|---|---|
| `demo_cache/` | yes | Preset frames, `frames/index.json`, Gaia stars. Survives redeploys |
| `cache/` | no | Runtime Gaia results |
| `static/frames/<folder>/` | no | Live builds (folder name = ra, dec, size, detector, mode, group). Trimmed to 20 |

Render's free disk resets on every deploy, so anything needed for the demo must be committed in `demo_cache/`. Cache keys round to 4 decimals, so near-identical searches share a file.

## Deployment (Render, free web service)

- Root directory `src/backend`
- Build: `uv sync`
- Start: `uv run uvicorn main:app --host 0.0.0.0 --port $PORT`
- Deploys from `main`. Python version must match `pyproject.toml` (>= 3.12).

## Decisions

- **Why not Vercel/Netlify for the backend:** serverless timeouts, no persistent disk, and astropy/reproject size limits.
- **Frames are PNGs, not live FITS in the browser:** small downloads, simple canvas player.
- **Precomputed presets:** live IRSA is slow (about a minute) and unreliable. The demo must not depend on it.
- **Plain `def` routes for slow work:** FastAPI runs them in worker threads, so health checks stay responsive.
- **One live build at a time:** protects Render's 512 MB RAM and IRSA from overload.
- **Fixed sky grid and one stretch per request:** a brightness change between frames is real, not an artefact of per-image scaling.

## Known constraints and risks

- IRSA (TAP and SIA2) fails intermittently (502, connection reset). Presets must be built when it is up, possibly from another machine.
- IRSA docs: SIA2 lags new data by about a day; TAP sees new data right after ingestion.
- QR2 data is no longer searchable. Use DR1 and QR3 (SIA2 collections `spherex_dr1`, `spherex_qr3`, plus `_deep`).
- Render free tier sleeps after inactivity and has limited RAM. Wake with `/health` before a demo. Whether `reproject` fits in memory on a live build is untested.
- Gaia lacks very bright and very faint objects (WISE 0855).
- Never fabricate data. Fixtures must be labelled. `BAD_FLAG_MASK` and several thresholds in `spherex.py` are marked `UNVERIFIED` in the code.

## Change log

Append two lines per task: what changed, where, any new constraint.

- 2026-11-14: Backend skeleton (`main.py`, `resolve.py`), Gaia `/stars`, disk cache, uv setup. Constraint: `size` unit differs between `/stars` (arcmin) and `/frames` (degrees).
- 2026-11-14: Standard `{error}` handlers; B1's `spherex.py` merged. Constraint: live `/frames` takes about a minute.
- 2026-11-14: Deployed on Render. Constraint: free tier sleeps, disk is not persistent.
- 2026-11-14: `/frames` route, `/demo` and `/static` mounts, `/presets`, cache-first `/frames`. Constraint: presets need `demo_cache/` committed.
- 2026-11-14: `/overlay`, live frames cache, sexagesimal input, live-build limit (503), live-folder cleanup. Constraint: overlay uses Gaia only.
- 2026-11-14: Presets still not precomputed because IRSA TAP and SIA2 returned 502 or connection resets.

Added standalone src/observatory dashboard and resilient IRSA TAP/SIA, NASA S3 and verified-cache access in src/backend/archive_access.py.
Live discovery can still fail upstream; bundled M101 PNGs are labelled mixed-wavelength samples, and optional raw FITS seeds are checksum-verified and excluded from Git.
