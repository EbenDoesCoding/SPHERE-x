# Engine notes

The history and known limits of the frames engine (`api/`) and of the parts built with it: the recorded
fields, the first web viewer, CI and the container. The engine's interface is `docs/CONTRACT_FIELDS.md`. The
team change log is `docs/ARCHITECTURE.md`: new entries go there. Update the list of known limits below when
a limit changes.

This file was `docs/architecture.md` until 14 November 2026; it was renamed because that name clashes with
`docs/ARCHITECTURE.md` on case-insensitive file systems. The foundation was built on a local branch named
`dev`, which no longer exists: it was merged with `main` into `frontend/main`. Each section below describes
the state at its own time. Entries have two lines: what changed and where; then any new constraint, or
"none".

## Foundation on `dev`, Saturday 14 November 2026

State at 14:05 GMT. Parts still missing at that time are named, so that no entry reads as more than it is.

**Contract v1.0**
- Changed: `docs/CONTRACT_FIELDS.md` defines the HTTP API, the manifest, `frames.bin`, the sky grid, time and wavelength bins, presets and fixtures; the machine-readable parts are `docs/contract/presets.json` and `docs/contract/vectors/grid.json`.
- Constraint: frozen. A change needs the data/backend owner, a version bump, and regenerated fixtures and vectors in the same pull request.

**API package**
- Changed: `api/` holds the Python 3.12 package `tombaugh` (uv, `pyproject.toml`, `uv.lock`): upstream HTTP, discovery, the range-request reader, preparation, registration, stacking, time bins, presets, the frame file and the response models, with tests in `api/tests/`. Not there yet: the HTTP service (`tombaugh.main`), the build pipeline, the cache and the recorded fixtures.
- Constraint: synchronous HTTP only; every upstream host is on the allow-list in `api/tombaugh/http.py`, with at most 2 requests to IRSA in flight; presets are read only from `api/tombaugh/data/presets.json`, a byte-identical copy of `docs/contract/presets.json`.

**Web seed**
- Changed: `web/` is one Vite, React and TypeScript app (npm, Biome, Vitest): contract types in `src/contract.ts`, the field loader in `src/api.ts`, the player maths in `src/player/` (float16 decoding, sky grid, playback, presets, rendering, screen mapping, band synthesis) with tests, and a first screen (`src/App.tsx`, `src/player/Player.tsx`). Not there yet: overlays, the spectrum panel, URL state.
- Constraint: `web/src/generated/` and `web/public/fixtures/` are written by `web/scripts/sync-contract.mjs` and are never edited or committed; `biome check .` covers every file under `web/`, including `functions/` and the JSON files.

**CI**
- Changed: `.github/workflows/ci.yml` runs on pull requests and on pushes to `main` and `dev`: job `api` (`uv sync --frozen`, `ruff check`, `pytest`) and job `web` (`npm ci`, lint, test, build). No deploy job. It has not run on GitHub yet.
- Constraint: CI has no access to the archives, so tests that need the network carry the `network` marker and are deselected; uv is pinned to 0.11.3 in the workflow and in the `Dockerfile`, and the two change together.

**Docker**
- Changed: `Dockerfile` and `.dockerignore` at the repository root describe the API image: `python:3.12-slim`, uv, the locked dependencies without development tools, then `api/tombaugh` and `cache/fixtures` at their repo-relative places under `/app`, and uvicorn on port 8080 with one worker. The image has not been built.
- Constraint: the server runs as uid 10001, never as root; the container starts as root only to hand `TOMBAUGH_CACHE_DIR` (`/data/cache`) to that user. The image cannot build while `cache/fixtures/` is missing from the build context.

**Fly config and proxy**
- Changed: `fly.toml` describes one machine (2 shared CPUs, 2 GB) in `iad` with a 3 GB volume at `/data`, HTTPS only, a `/healthz` check and a limit of 20 to 40 concurrent requests; `web/functions/api/[[path]].ts` forwards `/api/*` from the site to it, and `web/vercel.example.json` is the same rewrite for Vercel. Nothing is deployed.
- Constraint: the app name `tombaugh-api` is a placeholder; a second machine would have its own volume and its own build queue, so the design is one machine; the proxy sets `x-tombaugh-proxy-secret` and `x-forwarded-client-ip`, which the API does not read yet.

## Foundation on `dev`, state at 16:35 GMT on Saturday 14 November 2026

The entries above describe 14:05. Since then the service was joined up, checked independently and fixed.
Where an entry above says a part is missing or "not read yet", this section is the current one.

**Service, pipeline and cache**
- Changed: `api/tombaugh/build.py` joins discovery, the reader, preparation, registration and stacking into one field and writes the manifest; `cache.py` is a size-capped disk cache keyed by content, with an index of requests; `main.py` serves `/api/fields`, `frames.bin`, `/api/status` and `/healthz`. `/spectrum`, `/overlays` and `/resolve` answer 404 "not built yet". `docs/contract/manifest.schema.json` is exported from the response models.
- Constraint: one build at a time, 8 waiting, HTTP 429 beyond; a build nobody polls for 20 s is cancelled; a build that reaches 120 s returns what it has as "partial"; at most 600 exposures per field, sampled the same way every time.

**Recorded fields**
- Changed: `cache/fixtures/wise0855` (254 of 258 exposures, 68 planes) and `cache/fixtures/barnard` (348 of 364 exposures, 82 planes) are real fields recorded by `python -m tombaugh.tools.make_fixture <name>`.
- Constraint: a change to `prepare`, `register`, `stack`, `frames` or `build` needs a higher pipeline version and both fields recorded again in the same change; `api/tests/test_fixtures_golden.py` holds their values.

**Pipeline 0.2.0**
- Changed: three rules per exposure in `prepare.py` (`hole_mask`, `spill_mask`, `spike_mask`) remove single-pixel artefacts that the archive's flags miss; exposures whose band covers 1.083 um are left out of any plane that has other exposures (`build.leave_out_helium`), because they carry a bright foreground that one constant cannot remove; the manifest's `frames.url` ends in `?v=<hash>` and the server serves only the copy with that hash; a field whose list of exposures is unchanged after the 24-hour check is not downloaded again.
- Constraint: the pipeline version lives in `api/tombaugh/__init__.py`, `api/pyproject.toml` and `api/uv.lock`, and `api/tests/test_version.py` keeps the three equal; it is part of every cache key.

**Viewer seed**
- Changed: after a load the keyboard focus moves to the field, so Space plays and the arrows step; the note under the image keeps a fixed height, so the controls do not move while frames change; a loaded field scrolls to the top of the window.
- Constraint: nothing around the image may move when the frame changes. The React and CSS fixes have no unit test (the web tests run without a DOM); they were checked in a headless browser.

### Known limits at 16:35

1. Nothing is deployed. Build time next to the data and the proxy path are unmeasured.
2. A new field takes 30 to 80 s from the venue: about 1.3 MB is downloaded per exposure at 6 arcmin.
3. Visits with few exposures (under 10 per detector) get no rejection between exposures. Artefacts wider than one pixel can remain in them. Such frames are marked "partial" or "thin" and greyed: do not show them as evidence of anything.
4. WISE 0855, all bands, April to May 2026: a dark streak from a single exposure at 1.09 um remains. Use the 4.0 to 5.0 um preset for that target.
5. Saturated stars: the core is blank only in some planes. In the all-bands, D1, D5, D6 and cold views of Barnard's Star no hatch shows, and the core brightness there means nothing. The warning "saturated core" fires on the archive's OVERFLOW flag alone, also where no pixel is blank (RW Aur).
6. Rejection compares all exposures of one detector in a visit, across its four wavelength bins. A spectral feature seen in a tenth or fewer of them can be removed. The manifest notes say so; the rule is the science owner's to confirm or change.
7. The frame noise from the contract's formula is 0.2 to 0.8 of the scatter measured in crowded fields, so any signal-to-noise ratio printed from it is too high.
8. Visits at opposite spacecraft orientations differ by 0.12 to 0.17 arcsec east-west. This matters for the difference view, which is not built.
9. Viewer: at 1280 x 720 the frame label, the buttons and the strip of visits are below the fold; warnings name visits by a number that starts at 0; the no-data hatch is faint on dark sky.
10. Without `TOMBAUGH_PROXY_SECRET` the limit on new builds treats all visitors behind the proxy as one client.
11. Not examined: a point-like signal in one exposure of the WISE 0855 field (May 2025, 1.04 um, pixel 98, 15, absent in the other visits), and three bright spots in the sparse planes of the Barnard field. Artefact or real, unknown.
