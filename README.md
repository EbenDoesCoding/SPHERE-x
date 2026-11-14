# Tombaugh

Tombaugh is a public blink comparator for NASA's SPHEREx infrared sky survey. Give it a position on the sky,
and it shows registered, north-up images of that spot, one per visit and wavelength band, all on one
brightness scale, so that anything that moved or changed brightness between visits shows when the frames are
flipped. It is named after Clyde Tombaugh, who found Pluto with a blink comparator. Tombaugh is a working
name.

## Status

**Being built during the NASA Space Apps 2026 hackathon weekend (14 and 15 November 2026).** This section
describes the repository on Saturday 14 November 2026 at about 19:30 GMT. It holds two lines of work that
were built apart and merged that evening: the team backend (`src/backend/`) and a foundation with a frames
engine (`api/`), a web app (`web/`) and two recorded fields (`cache/fixtures/`).

Works today, on real data:

- **Team backend** (`src/backend/`): `/health`; `/resolve` (names through CDS Sesame, decimal and
  sexagesimal coordinates); `/stars` (Gaia DR3 stars with proper motions); `/frames` (PNG frames from IRSA
  cutouts, grouped by wavelength); `/overlay` (where the Gaia stars fall on those frames, proper motion
  applied). Its owner has deployed it on Render's free tier; the address is not in this repository. Started
  on a developer machine on 14 November, `/health`, `/resolve` and `/stars` answered correctly. `/presets`
  is empty: no preset could be computed because IRSA failed at the time.
- **Frames engine** (`api/`), on a developer machine: for any position with SPHEREx coverage it finds the
  public exposures at IRSA, reads only the needed rows from the public bucket, masks bad pixels, registers
  north-up and stacks per visit and wavelength bin. Measured from the hackathon venue: a new 6 arcmin field
  in 30 to 80 s, a 10 arcmin field in 56 s, then instant from the cache. 702 tests pass without network. Its
  container image builds.
- **Two recorded fields**, WISE 0855−0714 and Barnard's Star, in `cache/fixtures/`. They are real SPHEREx
  data saved by the engine, and the web app carries its own copies, so they load with no server at all.

Being built tonight:

- **The web site** (`web/`), from the design files in `docs/design/`: a landing page at `/` and the comparator
  at `/look/`. The comparator takes its frames from the engine (or the bundled recorded fields) and uses the
  team backend's `/resolve` and `/stars` for search by name or coordinates and for the hint about objects
  that have moved away from their catalogue position. Twelve further parts (among them the difference image,
  side by side, then and now, the spectrum panel and catalogue markers) are designed so that each can be
  left out; which of them are ready by the pitch is not known yet.

Not done:

- **Nothing from this branch is deployed**: not the engine, not the web site. `fly.toml`, the Cloudflare
  Pages Function and the CI workflow have never run on those services. Where the engine and the site will
  run is still to be decided (`CLAUDE.md`, section 14).
- The checks in `docs/VALIDATION.md` and `docs/TARGETS.md` are all still unticked.

Known limits of the engine are listed at the end of [`docs/ENGINE_NOTES.md`](docs/ENGINE_NOTES.md); those
of the team backend in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Run it

Python 3.12 with [uv](https://docs.astral.sh/uv/) for both back ends, Node 24 for the web app.

```bash
# Team backend: http://localhost:8000
cd src/backend && uv sync && uv run uvicorn main:app --port 8000

# Frames engine: http://localhost:8080
cd api && uv sync && uv run pytest -q          # no network; what CI runs
cd api && uv run uvicorn tombaugh.main:app --reload --port 8080

# Web app: http://localhost:5173/ (landing page) and http://localhost:5173/look/ (comparator)
cd web && npm install && npm run dev
cd web && npm test && npm run lint && npm run build
```

The web app reads its addresses from `web/.env.local` (copy [`web/.env.example`](web/.env.example)):
`VITE_TEAM_API_URL` for the team backend, `VITE_ENGINE_URL` for the engine. Left empty, the engine is reached
through `/api` on the same origin, which the development server sends to `localhost:8080`. If that port is
taken, start the engine with `--port 8081` and the web app with `TOMBAUGH_API_URL=http://localhost:8081 npm
run dev`. With no engine running, the two recorded fields still load; other positions need the engine and
network access to IRSA and the bucket. More in [`web/README.md`](web/README.md).

## Where things are

- Contracts: [`docs/CONTRACT.md`](docs/CONTRACT.md) for the team backend, and
  [`docs/CONTRACT_FIELDS.md`](docs/CONTRACT_FIELDS.md) (Contract v1.0, machine-readable parts in
  `docs/contract/`) for the frames engine and the recorded fields.
- Designs: [`docs/design/`](docs/design/): the design system (`system/`), the landing page (`landing/`) and
  the comparator (`comparator/`).
- Notes: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (team backend, front end, and the team change log),
  [`docs/ENGINE_NOTES.md`](docs/ENGINE_NOTES.md) (the engine's history and known limits),
  [`docs/RUNBOOK.md`](docs/RUNBOOK.md) (deploying and operating), [`docs/TARGETS.md`](docs/TARGETS.md) and
  [`docs/VALIDATION.md`](docs/VALIDATION.md) (test targets and checks), [`docs/plan.md`](docs/plan.md) (the
  build plan approved on 14 November).
- Rules for the team and for coding assistants, and the open decisions: [`CLAUDE.md`](CLAUDE.md).

## Data

Tombaugh shows real data only. The images are SPHEREx Spectral Images, DR1
([10.26131/IRSA678](https://doi.org/10.26131/IRSA678)) and QR3
([10.26131/IRSA662](https://doi.org/10.26131/IRSA662)), from the NASA/IPAC Infrared Science Archive, read from
the public bucket `nasa-irsa-spherex` and through IRSA's services. Star positions and proper motions come
from Gaia DR3 (European Space Agency), and names are resolved with Sesame (CDS, Strasbourg). Every source,
with its credit and the acknowledgement texts, is in [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

Tombaugh is an independent student project, not an official NASA or SPHEREx tool.

## Use of AI

Code, tests and documents in this repository were written with the help of an AI coding tool, Claude Code
(Anthropic). What the tool did, and what the team decided and checked, is recorded in
[`docs/AI_USE.md`](docs/AI_USE.md), a draft the team still has to confirm.

## Licence

Apache License 2.0: see [`LICENSE`](LICENSE). It was added as a proposal and the team has still to confirm
it. It covers the code and documents of this repository. The survey data are not ours to license: see
[`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).
