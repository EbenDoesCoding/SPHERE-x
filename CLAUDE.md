# CLAUDE.md — Tombaugh, a blink comparator for SPHEREx (HackAthlone: Planet X and SPHEREx)

Shared context for every Claude instance on this repo. Read this file first. Do NOT re-scan the whole repo each prompt.
Confidence tags: **[CHALLENGE]** = from the official brief. **[TEAM]** = decided by the team. **[MEASURED]** = measured by us on real SPHEREx data, or read in a primary source, on 14 Nov 2026. **[VERIFY]** = not yet checked. Never present [VERIFY] items as fact in UI, docs, or pitch.

On the `dev` branch this file follows the build plan approved on 14 Nov (`docs/plan.md`). The earlier draft is the version on `main` (commit `8fb11bf`). Three choices are marked **DECIDE**: the team signs them off before `dev` merges to `main`.

---

## 0. Start here

**Layout** (one owner per folder, see §10):
```
/api                 FastAPI package `tombaugh`: archive reader, build pipeline, cache
/web                 one Vite app: src/player (viewer, controls, URL state), src/overlays (catalogues, spectrum), src/design
/docs/CONTRACT_FIELDS.md  Contract v1.0: API, manifest, frame file, sky grid, bins, presets. Machine-readable parts in /docs/contract/
/docs/plan.md        the approved build plan, with the evidence behind every choice
/cache/fixtures      recorded REAL fields (wise0855, barnard) produced by the pipeline; the front end runs on them with no API
/science             morning prototypes, validation scripts, results/*.json
```

**Build against `docs/CONTRACT_FIELDS.md`.** It is frozen: a change needs the data/backend owner (a human), a version bump, and regenerated fixtures and vectors in the same pull request.

**Commands:**
```bash
cd api && uv sync && uv run pytest -q          # no network; what CI runs
cd api && uv run uvicorn tombaugh.main:app --reload --port 8080
cd web && npm install && npm run dev           # http://localhost:5173, falls back to bundled fixtures without the API
cd web && npm test && npm run lint && npm run build
```
Port 8080 taken? Run the API with `--port 8081` and the web app with `TOMBAUGH_API_URL=http://localhost:8081 npm run dev`.
State of the build and its known limits: the last section of `docs/ENGINE_NOTES.md`.

**Rules for all code:**
- Real data only. Small synthetic arrays are allowed in unit tests of maths, named `synthetic_*`, never shipped.
- One implementation each of sky projection, proper-motion propagation, presets and stacking. Import it.
- Upstream hosts are a fixed allow-list in `api/tombaugh/http.py`; never fetch a URL a user supplied. At most 2 concurrent requests to IRSA. Every upstream call has a timeout, retries and a deadline.
- "Candidate", never "discovery". Never say we are the "only" tool doing something.

## 1. Situation [MEASURED]
- HackAthlone (NASA Space Apps local event), TUS Athlone, 13–15 Nov 2026. Project work opened Sat 09:00.
- Pitch: Sun 15 Nov from 11:30, **3 minutes plus 2 of questions, hard stop**. Whether a live demo is allowed is unpublished: ask the desk.
- One member must confirm the team **in person at the Atrium X desk by Sun 06:00**, or we are not scheduled.
- NASA portal closes **Sun 23:59**. The NASA demo is at most a **30-second video or 7 slides**; longer makes the project ineligible for global judging.
- Global judges reopen the live link until winners on 26 Jan 2027, so the deployment must stay up for ten weeks.
- Team: 6 people. AI (Claude) writes code, humans review every PR.
- Goal: win. Aim for 1st place plus the special prizes (see §7).
- Time is very short. Ship a working, deployed core first. Polish second.

## 2. The challenge [CHALLENGE]
Build a **public-facing web tool** that displays images of the sky from NASA's SPHEREx mission so anyone can quickly see how they change over time.

Core ask: the user enters **RA/Dec** of a sky patch. The tool shows a **series of images of that patch like a little video**, making moving objects easy to spot.

Background points from the brief:
- Moving objects are found by comparing images taken at different times (Pluto was discovered this way). Volunteers (e.g. backyardworlds.org) found most known comets and brown dwarfs this way.
- SPHEREx has mapped the whole sky once every six months since May 2025, in **102 bands** of near-infrared light, with images of over a billion objects (brown dwarfs, quasars, comets, asteroids, stars, supernovae, galaxies). Too much data for any one person or computer code.

**Test targets** (the tool must work on all of these):
| Target | Notes |
|---|---|
| Barnard's Star | high proper-motion star |
| Epsilon Indi B | pair of brown dwarfs orbiting a star |
| WISE 0855 | fast-moving brown dwarf. RA 08h55m10.831s, Dec -07d14m42.53s |
| RW Aurigae | variable star |
| R Draconis | variable star |

**Optional considerations from the brief** (not required, but score creativity/influence):
1. Easy to update with new data releases (data arrives fast).
2. Creative use of the 102 bands. E.g. sum data from each of the **six detector arrays** separately to raise signal-to-noise. Extra kudos for **spectra generated on the fly**.
3. Option to add or subtract images taken at different times.
4. User-selectable **field of view** (bigger FOV tracks faster movers but means more data transfer).
5. Overlay other telescopes' data (Gaia, WISE).
6. Coordinates in the **URL** so it can be embedded in other sites.
7. Display metadata such as contamination flags.
8. Use public tools: Astropy; Aladin (CDS Strasbourg).

## 3. Judging criteria [CHALLENGE — drives every decision]
Influence/Impact (quality and quantity of possible impact) · Creativity · **Validity (scientifically valid?)** · Relevance (responsive to this challenge) · Presentation (how well we communicate). Each is scored 1 to 5, with the same rubric locally and globally [MEASURED].
Features alone do not win. Story, validity, and clear communication do. The 2025 local jury had no astronomer and rewarded "a clear user" and "a demo you could see" [MEASURED]. Global judges score mainly the NASA project page, then the demo and the live link.

## 4. Product [TEAM]
Name: **Tombaugh** (Clyde Tombaugh found Pluto, while hunting for Planet X, by flipping between two photographs). The earlier working name "Blink" appears in 14 competing repository names this weekend. **DECIDE.**
Personas: citizen scientist (Backyard Worlds style volunteer), teacher/student, professional astronomer.

What it does, in five points:
1. **Correct blinking.** Frames are registered, north-up, wavelength-matched stacks per visit on one brightness scale, so what blinks is the sky and not the filter.
2. **Then & Now.** The 2010–11 WISE image (and 2MASS where usable) on the same grid as a SPHEREx stack at nearly the same wavelengths. Positions are comparable between surveys; brightness is not.
3. **What it is, not only that it moved.** Click an object for quick-look spectrophotometry (0.75–5 µm) at the position predicted from catalogue motion.
4. **The coordinate trap, solved.** Typed coordinates are checked for fast movers that used to be there ("it is now 126" west: jump").
5. **Honest and durable.** Dates, exposure counts, wavelength range and provenance on every frame. No synthetic imagery. New releases need no code change.

### Core A: the demo path
- Search by RA/Dec (sexagesimal or decimal) or name, with the fast-mover hint. All five challenge strings must reach their target.
- Live frames for any coordinate: discovery at request time, frames are time bins (see the contract), at most 600 exposures, field 6' default and 10' max, honest "no coverage yet".
- Blink: band presets (six detector stacks, All, 4.0–5.0 µm "cold objects", three-colour), Space and arrows, hold-to-flip, side-by-side, dated timeline strip, contrast and invert, cursor readout, click to recentre. Never autoplays; at most 6 frame changes a second.
- Then & Now for three featured targets, shipped as dated static files from the same pipeline.
- Trust: frame label (date range, N exposures, wavelength range), "newest SPHEREx image" chip, provenance line.

### Core B: then feature freeze
- Difference image (scaled on field stars, common wavelengths only, saturated cores hatched).
- Quick-look spectrum (click snaps to a catalogue source; neighbours within 15" fitted jointly; saturated stars refused or marked "indicative only").
- Overlays: Gaia DR3 at each frame's date, CatWISE neighbours.
- URL state `?ra=&dec=&fov=&band=&mode=&frame=` and a one-screen About (methods, limits, validation table, data notes, AI use).

### Complete, in order, only after Core is green
Then & Now anywhere · motion readout against the Gaia prediction · single-exposure events and an "hours" mode · draggable wavelength window · flag overlay and exposure table · GIF export and candidate card · embed and WiseView-style links · phone polish · wider fields · Irish-language toggle (bonus for the local prize).

### Will not build
Automatic "discovery" claims, accounts, any simulated sky, a general FITS viewer.

## 5. Science constraints [MEASURED unless tagged]
- Searchable image collections: `spherex_dr1`, `spherex_dr1_deep`, `spherex_qr3`, `spherex_qr3_deep`. `spherex_qr2` returns nothing. Pixels are in the public bucket `nasa-irsa-spherex` (us-east-1, anonymous, HTTP range requests).
- IRSA's cutout service returns at least 4 MB per cutout whatever the size and takes 4–15 s. We read only the needed rows from the bucket: 258 exposures in 7–9 s from the venue.
- Native pixel 6.15"; stacked resolution about 10". Each exposure images a sky position at ONE wavelength; the next exposure is one spectral channel away; consecutive visits are rolled 180°. **Never blink raw frames.** Blink stacks per time bin and wavelength bin, registered north-up, on one stretch.
- Most positions have 3–4 visits about 6 months apart. SPHEREx alone only shows motions above roughly 1–3"/yr.
- **Catalogue coordinates are old.** The challenge's WISE 0855 coordinates are its 2010 position, 126" from where it is now; Barnard's Star is 269" from its J2000 position. Propagate names to the observation epoch.
- Barnard's Star: 10.25" in a year, core saturated in every exposure (position from the wings, about ±1.5").
- WISE 0855: invisible in single frames; visible only in 4.4–5.0 µm stacks; blended with a background star 4–11" away. Fitted jointly it moved 4.36 ± 0.34" in six months (4.54" predicted). Gaia does not contain it; use CatWISE.
- RW Aur: +51% at 1.2 µm and −46% at 4.6 µm across three visits; core flagged OVERFLOW, so indicative only. R Dra: saturated in almost every exposure; only the 4–5 µm halo is usable, as a relative proxy.
- Eps Indi Ba+Bb is unresolved (one blended source) and its motion test has not been run. [VERIFY]
- Unsaturated-star photometry agrees with 2MASS and AllWISE to a median ratio of 0.987 with 2.9% scatter (six stars).
- Flag masks from the SPHEREx Explanatory Supplement: stack `0x3FD2CEC5`, photometry `0x3C028E44`, background `0x3C2A8E47`. Never mask the SOURCE bit; never drop the SIP distortion terms; a strict mask erases saturated stars, so hatch their cores instead.
- CDS Strasbourg (SIMBAD, VizieR, Aladin tiles and script) is down this weekend. Use the CfA and IDIA mirrors; keep Aladin Lite off the critical path.
- Never fabricate data, endpoints, column names, or astronomy values. If unsure, say "unverified" in code comments and UI.

## 6. Competitors [MEASURED from their code and READMEs]
- **Ashhajj0/SPHEREX-And-PLANETX** (the repo we were pointed at): a static bundle over one pre-baked field. Its RA/Dec entry is cosmetic, all five test targets are synthetic "fixtures", and nothing blinks over time. Real strengths: candid labelling, careful photometry, a polished interface.
- **The wider field is stronger.** 117+ "spherex" repositories since 13 Nov; at least eight claim live coordinate search, blink, subtraction, Gaia overlay and spectra (muninn, Driftnet, SPHEREx-Blink-3.0 and others). Two already place a 2010 WISE frame beside SPHEREx and tell the Pluto story.
- So features and the Pluto story will not win. Five targets on real pixels with honest limits, numbers checked against Gaia, proof that strangers can use it, and craft can.

**Rules:** do NOT copy anyone's code. Do not disparage other teams. Never claim to be the "only" tool; say what we validated.

## 7. Prizes [CHALLENGE]
1st €2500 · 2nd €1500 · 3rd €1000 · Best Use of Open Data €500 · Best Use of Local Application (Region) €500 · Best Storytelling and Creativity €500 · People's Choice €500 (voted during presentations).
Strategy [TEAM]: aim for 1st. Most specials come nearly free:
- Open Data: IRSA SPHEREx + Gaia DR3 + WISE + 2MASS, open-source repo, public embed/URL API.
- Storytelling: the story arc in §9.
- People's Choice: a QR code to the live link on every slide.
- Local Application: bonus only (Irish-language toggle, schools and Irish astronomy club outreach angle). Do not spend build time here.
Open question: can one team win multiple prizes? Ask organizers.

## 8. Tech stack and architecture [TEAM; changes from the first draft marked DECIDE]
| Layer | Choice | Why |
|---|---|---|
| Back end | Python 3.12, FastAPI, Astropy, numpy/scipy, synchronous `requests` with a thread pool; `uv`, `ruff`, `pytest` | Astropy is the reference for FITS and WCS; range reads need no async |
| Pixels | HTTP range reads from the public S3 bucket; IRSA SIA only for discovery | IRSA cutouts are 4 MB and 4–15 s each [MEASURED] |
| What the server sends | One stack per time bin and wavelength bin (float16, about 2 MB per field), built once and cached as immutable files | Bounded for any number of exposures; band changes, blinking and differences then cost no round trip |
| Front end | React + TypeScript on **Vite**, static app; Canvas 2D; uPlot for charts. **DECIDE** (first draft said Next.js) | Nothing needs server rendering; a static bundle deploys to Vercel or Cloudflare Pages unchanged |
| API host | A container in Northern Virginia, next to the data (Fly.io `iad` proposed). **DECIDE** host and account owner | Hundreds of small reads per query |
| Front door | Static hosting with `/api` proxied to the API (Cloudflare Pages Function provided; Vercel rewrite example provided) | One origin, no CORS |
| Cache | Content-addressed files on the API's disk; featured targets also ship as static files | The demo and the judged link never go cold |
| Sky overlays | Catalogue overlays drawn by our own viewport; Aladin Lite optional | CDS is down this weekend |
| Quality | CI without network (lint, types, tests, build); Biome for the web (TypeScript 7 cannot run typescript-eslint); Vitest in the `node` environment; npm | |

Fallback if API hosting fails: the pinned fixture files keep the featured targets working with no back end.

## 9. Presentation plan [TEAM]
Story arc: Problem, why it matters, solution, impact. Save technical details for Q&A. Script to 2:40 for a 3:00 hard stop; one speaker, one driver; the deck must work with no network.
1. Hook (20 s): Tombaugh found Pluto by flipping between two photos; SPHEREx photographs the whole sky every six months and there is no public way to flip through it.
2. Who it is for and the live link (20 s): Backyard Worlds volunteers; QR code on every slide.
3. Solution (55 s): the chosen mover; then and now with years; click the dot for its spectrum.
4. Validity (25 s): one number against Gaia (4.4 ± 0.3" measured, 4.5" predicted); every pixel real; limits shown on the image.
5. Close (40 s): paste NASA's own test coordinates and most tools show empty sky, ours tells you where the star went; open source; new images as released.
Roles: storyteller, demo driver, science Q&A, tech Q&A. Prepare answers on: can it find Planet X (no, and why), false positives, pixel scale, wavelength variation, saturation, data refresh, cost, how much AI did. Keep a recorded backup of the real product.
For NASA: a separate video of at most 29 seconds, the project page with a "tested on" table, every source cited.

## 10. Team roles and review pairs [TEAM, names to be filled]
| Role | Owns | Folders | Review buddy |
|---|---|---|---|
| 1. Science/validity lead | targets, motion math, Then & Now, validation sheet | `science/`, pipeline maths in `api/tombaugh/` | 2 |
| 2. Data/backend | archive reader, build, cache, API, contract | `api/`, `docs/contract*` | 1 |
| 3. Frontend viewer | player, controls, URL state | `web/src/player/` | 4 |
| 4. Frontend overlays/spectra | catalogues, spectrum, search and the fast-mover hint | `web/src/overlays/` | 3 |
| 5. Design/story | design tokens, landing, About, slides, demo video, user tests | `web/src/design/`, `docs/` | 6 |
| 6. QA/DevOps/pitch lead | deploy, CI, monitoring, five-target testing, run-throughs | `.github/`, `Dockerfile`, `fly.toml`, `web/functions/` | 5 |

## 11. Schedule [TEAM; Irish time, re-based Sat 16:35]
| When | Gate |
|---|---|
| Sat 16:35 | **Done.** Foundation works locally: contract, API on real data for any position, viewer on two recorded real fields, container image builds |
| Sat before 18:00 | Evidence images shown to the astronomy mentor (he leaves at 18:00): "what is wrong with this?" Hosting choice and account owner decided |
| Sat 18:30 | Deployed: recorded fields and live frames for any coordinate on the public URL through the production path |
| Sat 19:30 | Then & Now and solar-system-mover tests rendered from real data; pitch opener chosen |
| Sat 23:00 | Core A complete; first screen recording saved; deck and NASA page drafts; first stranger test |
| Sun 02:00 | Core B complete; five targets pinned. **Feature freeze** |
| Sun 04:30 | Demo script passes three times in a row on production; tagged |
| Sun 06:00 | Team confirmed in person at the desk (named primary and backup) |
| Sun 07:00 | **Production lock**: deploys manual; only lead-approved demo-path fixes until 10:30 |
| Sun 08:00–10:00 | Record captures; second stranger test; first complete NASA page saved |
| Sun 11:30 | Pitch. Afterwards: 29-second video, page polish, final save by 22:00 |

Cut rule: at every gate, what does not work is cut or hidden, never faked. Never cut: the fast-mover hint, the difference image, URL state, the pinned featured files, the backup recording.

## 12. How Claude must work in this repo
**Context discipline**
- Read only: this file, the relevant folder's `CLAUDE.md`, `docs/CONTRACT_FIELDS.md`, and the files for your task. Do not explore the repo.
- One task per session. Stay inside your owner folder.
- Do not touch `package.json`, lockfiles, shared types, or config. Ask the config owner (a human) instead. (The foundation on `dev` was scaffolded in one go with a human owner's approval; this rule applies again once it lands.)
- No refactors, renames, or "improvements" outside the task.
- After each task, append two lines to `docs/ENGINE_NOTES.md`: what changed, where, and any new constraint.
- Build against `docs/CONTRACT_FIELDS.md` (API shapes). If the contract must change, say so and stop. A human updates it.

**Science and honesty**
- Do not invent IRSA endpoints, column names, or astronomy numbers. Mark anything unchecked `unverified` in code comments and in the UI data notes.
- Never mix bands in a blink sequence. Never fake or synthesize data in the live app. Fixtures are recorded real data and are labelled with their dates and provenance.
- Validate inputs (RA 0–360, Dec -90 to 90, capped FOV), rate-limit the API, keep secrets out of git (`.env.example` only).

**Git**
- `main` is protected and always deployable. `dev` carries the foundation until the team merges it. After that: one branch per task, PRs under about 300 lines.
- Every PR needs a human review, green CI, and a working preview deploy. Merge `main` into your branch first. No force-push.
- Merge window about every 2 hours, then re-test all five presets.
- Tag known-good builds (`v0.1`, `v0.2`) for rollback.
- If one person runs several Claudes, use `git worktree`, one per task.
- Keep a prompt log (supports the validity and open-data story).

## 13. Known risks
| Risk | Prevention |
|---|---|
| Merge conflicts | folder ownership, small PRs, frequent merges |
| Frontend/backend drift | contract file, recorded real fixtures, contract test in CI |
| Claude invents data endpoints or facts | measurements first; human checks against IRSA notebooks; science lead validates on known cases |
| Claude refactors unrelated files | scoped prompts; reviewer rejects out-of-scope diffs |
| IRSA slow, down, or rate-limited | pixels come from S3; cached discovery; pinned featured files |
| Hosting limits found late | deploy the skeleton before adding features |
| Band flicker looks like motion | stacks per wavelength bin only; validate on WISE 0855 and Barnard's Star |
| SPHEREx-only motion is too subtle for a general jury | lead with Then & Now or a solar-system mover, chosen from real frames |
| Saturated or blended test targets look broken | hatched cores, "saturated" state, joint fit or a warning, honest captions |
| Overclaiming | fixed words: candidate, measured, uncertain; this finds nearby stars and brown dwarfs, not Planet X |
| Scope creep | Core list is fixed; extras need lead approval |
| Reviewer fatigue | rotate reviewers; freeze at the gate |
| Live demo fails or is not allowed | pinned files, recorded backup, deck that works offline, phone hotspot |

## 14. Open items for humans
- [ ] **DECIDE**: name (Tombaugh or another), front-end framework (Vite as built on `dev`, or Next.js), API host and who holds the account and card
- [ ] Ask the desk: are slides required, sent in advance, is a live demo from our own laptop allowed?
- [ ] Name the two people at the desk for Sunday 06:00
- [ ] AI rules: Space Apps asks that AI not be used to come up with the idea and that AI-generated code be acknowledged in descriptive text and metadata. Agree what we disclose (`docs/AI_USE.md` is a draft)
- [ ] Fill in the role names in §10
- [ ] Still to test on real data: Eps Indi B motion (a live build at RA 331.096, Dec -56.801 shows a bright source at the predicted place in four visits; its motion is not measured), the Then & Now blink, a solar-system mover (Pluto or comet 3I/ATLAS)
- [ ] Data/backend owner: sign off the contract clarification of 14 Nov (`frames.url` is opaque and ends in `?v=<hash>`), or ask for a version bump instead
- [ ] Science owner: outlier rejection per detector (as built) or per wavelength bin; one rule for saturated cores (see the known limits in `docs/ENGINE_NOTES.md`)
- [x] Latest SPHEREx release and access method confirmed (DR1 + QR3, SIA for discovery, S3 range reads)
- [x] Test-target astrometry checked against Gaia DR3, CatWISE and SIMBAD (see `docs/plan.md`)
