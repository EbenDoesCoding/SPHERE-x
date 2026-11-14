# Tombaugh

Tombaugh is a public blink comparator for NASA's SPHEREx infrared sky survey. The aim: give it a position on
the sky, and it stacks the public SPHEREx exposures of that spot into registered, north-up frames, one per
visit and wavelength band, so that anything that moved or changed brightness between visits shows when the
frames are flipped. It is named after Clyde Tombaugh, who found Pluto with a blink comparator.

## Status

**Being built during the NASA Space Apps 2026 hackathon weekend (14 and 15 November 2026).** The two lists
say what the `dev` branch held on Saturday 14 November 2026 at 16:35 GMT.

Works today, on a developer machine, on real data:

- **Any position with SPHEREx coverage.** `GET /api/fields?ra=&dec=&fov=` finds the public exposures at IRSA,
  reads only the needed rows from the public bucket, and returns registered, north-up stacks per visit and
  wavelength bin. Measured from the hackathon venue: 258 exposures in about 30 s, 467 in about 80 s. The
  answer is cached; a repeat takes milliseconds.
- **Two recorded fields**, WISE 0855-0714 and Barnard's Star, in `cache/fixtures/`. They are real SPHEREx
  data saved by the same pipeline, and the viewer falls back to its own copies of them when no API answers.
- **A first viewer** (`web/`): position form, wavelength presets (six detectors, all bands, 4.0-5.0 um), step
  and play with the keyboard, a dated strip of visits, a pointer readout of position and brightness, no-data
  pixels drawn as a hatch, and "partial" frames greyed. It is a plain seed, not the designed interface.
- **Checks**: 702 API tests and 411 web tests without network, lint, a production build, a container image
  that builds and serves a recorded field, and a headless-browser run of the viewer.

Not built yet:

- search by name or by sexagesimal coordinates, and the hint for objects that have moved away from their
  catalogue position;
- the difference image, the three-colour view, catalogue overlays, the spectrum panel, the comparison with
  older surveys (WISE, 2MASS), and coordinates in the URL;
- the designed interface;
- **a public deployment.** Nothing is deployed. `fly.toml`, the Cloudflare Pages Function and the CI workflow
  have never run on those services.

Known limits of what is there are listed at the end of [`docs/ENGINE_NOTES.md`](docs/ENGINE_NOTES.md).

## Run it

Python 3.12 with [uv](https://docs.astral.sh/uv/) for the API, Node 24 for the web app.

```bash
cd api && uv sync && uv run pytest -q          # no network; what CI runs
cd api && uv run uvicorn tombaugh.main:app --reload --port 8080
cd web && npm install && npm run dev           # http://localhost:5173
cd web && npm test && npm run lint && npm run build
```

The web app sends `/api` requests to `localhost:8080` during development. If that port is taken, start the
API with `--port 8081` and the web app with `TOMBAUGH_API_URL=http://localhost:8081 npm run dev`. With no API
running, the two recorded fields still load from the copies bundled with the page; other positions need the
API and network access to IRSA and the bucket.

## Where things are

- The interface: [`docs/CONTRACT_FIELDS.md`](docs/CONTRACT_FIELDS.md). It is frozen: a change needs the data/backend owner,
  a version bump, and regenerated fixtures and test vectors.
- One entry per task, with the constraints it added: [`docs/ENGINE_NOTES.md`](docs/ENGINE_NOTES.md).
- Deploying and operating: [`docs/RUNBOOK.md`](docs/RUNBOOK.md).
- The build plan: [`docs/plan.md`](docs/plan.md).

## Data

Tombaugh shows real data only. The images are SPHEREx Spectral Images, DR1
([10.26131/IRSA678](https://doi.org/10.26131/IRSA678)) and QR3
([10.26131/IRSA662](https://doi.org/10.26131/IRSA662)), from the NASA/IPAC Infrared Science Archive, read from
the public bucket `nasa-irsa-spherex`. Every source, with its credit and the acknowledgement texts, is in
[`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

Tombaugh is an independent student project, not an official NASA or SPHEREx tool.

## Use of AI

Most of the code and tests were written with an AI coding tool, Claude Code (Anthropic). What the tool did,
and what the team decided and checked, is in [`docs/AI_USE.md`](docs/AI_USE.md), a draft the team still has
to confirm.

## Licence

Apache License 2.0: see [`LICENSE`](LICENSE). It covers the code and documents of this repository. The survey
data are not ours to license: see [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).
