# CLAUDE.md — SPHEREx "Blink" (Hackathlone: Planet X and SPHEREx)

Shared context for every Claude instance on this repo. Read this file first. Do NOT re-scan the whole repo each prompt.
Confidence tags: **[CHALLENGE]** = from the official brief. **[TEAM]** = decided by the team. **[VERIFY]** = from Claude's general knowledge or a competitor README, not yet checked against primary docs. Never present [VERIFY] items as fact in UI, docs, or pitch.

---

## 1. Situation
- Hackathon: Hackathlone (NASA Space Apps-style), challenge "Planet X and SPHEREx". The event dates (believed 13–15 Nov 2026) and the submission deadline are **[VERIFY]**; humans must confirm the deadline and pitch slot length.
- Team: 6 people. AI (Claude) writes code, humans review every PR.
- Goal: win. Aim for 1st place plus the special prizes (see §7).
- Time is very short. Ship a working, deployed MVP first. Polish second.

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
Only WISE 0855 coordinates are given in the brief. Resolve the others via SIMBAD/Sesame and record the values in `docs/targets.md`.

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
Influence (quality and quantity of possible impact) · Creativity · **Validity (scientifically valid?)** · Relevance (responsive to this challenge) · Presentation (how well we communicate).
Features alone do not win. Story, validity, and clear communication do. The lesson from past Space Apps winners: technical skill gets a prototype, understanding real users decides whether it matters.

## 4. Product vision [TEAM]
Working name: **Blink**, "Backyard Worlds for SPHEREx". Pluto was found with a desk-sized blink comparator. Now anyone can do it from a URL.
Personas: citizen scientist (Backyard Worlds style volunteer), teacher/student, professional astronomer.

### MVP (must ship, in this order)
1. RA/Dec input (sexagesimal and decimal) plus name lookup.
2. **Any coordinate on demand** (not a fixed list), with caching.
3. FOV slider with a sane maximum.
4. Frames play as a video: play/pause, scrub, speed.
5. Frames grouped by band/detector. Per-detector stacking to raise S/N.
6. URL parameters (`?ra=&dec=&fov=`), plus an embed snippet.
7. One-click presets for the 5 test targets (pre-cached so the demo never depends on live latency).
8. Metadata panel: date, band, detector, flags.
9. "Data notes" panel: what is measured, what is from docs, what is unverified.

### Should have
- Gaia and WISE overlays (Aladin Lite).
- **Predicted vs. observed motion**: propagate Gaia proper motion to each frame's date and draw the expected track. This is the validity and wow feature.
- Add/subtract (difference) mode.
- Click a source for an on-the-fly spectrum or light curve.
- Scheduled re-index for new releases. The release/collection name must be **config, not hard-coded**.

### Wow, only if time
- Simple mover-candidate flag (frame differencing or centroid shift).
- Beginner/Expert modes with a guided tour.
- Shareable "discovery link".
- Irish-language UI toggle (supports the local-application prize).

## 5. Science notes (validity)
Treat these as constraints. Items tagged [VERIFY] must be checked by the science lead against IRSA docs before any claim is shown.
- SPHEREx wavelength varies across each detector, so different exposures sample different bands at the same sky position. **Blink only like-band frames from the same detector**, otherwise brightness flicker looks like motion. [VERIFY]
- Competitor's rule for pairing: same detector, central wavelength within 2%, and observations at least 14 days apart. Reasonable starting point; justify or adjust ourselves. [VERIFY]
- Pixel scale is about 6.2″/pixel (reported in the competitor README, "measured from files" by them). [VERIFY]
- Approximate proper motions (general knowledge): Barnard's Star about 10.4″/yr, WISE 0855 about 8″/yr, epsilon Indi A about 4.7″/yr. Roughly one pixel per year, so motion needs difference imaging and centroiding, not just eyeballing. Fetch real values from Gaia/SIMBAD. [VERIFY]
- RW Aur and R Dra test **brightness variation**, not motion. Show a brightness-over-time plot for them.
- The epsilon Indi B pair is separated by well under a pixel, so SPHEREx cannot resolve it. Show one blended source and say so. [VERIFY]
- Gaia lacks very faint brown dwarfs like WISE 0855. Use WISE/AllWISE/CatWISE for those. [VERIFY]
- Data notes: SPHEREx Quick Release products are hosted at IRSA (collection name `spherex_qr2` per competitor README) with an AWS Open Data mirror (`https://nasa-irsa-spherex.s3.amazonaws.com`). Cutout layers they keep: IMAGE, FLAGS, VARIANCE, WCS-WAVE. They drop PSF and zodiacal-light layers. Newer releases than QR2 may exist, so check IRSA. [VERIFY]
- Never fabricate data, endpoints, column names, or astronomy values. If unsure, say "unverified" in code comments and UI.

## 6. Competitor intel: Ashhajj0/SPHEREX-And-PLANETX
Repo: github.com/Ashhajj0/SPHEREX-And-PLANETX, live at spherex-and-planetx.vercel.app. Analysis is from the README and file tree only. We did **not** inspect the code or the live app (the site is JS-rendered). Re-check before relying on this.

What it is: a batch Python pipeline (run manually on a laptop) that downloads real QR2 cutouts and Gaia/AllWISE catalogues for **8 hard-coded regions**, exports PNG/JSON, then serves them from a static Vite/React site. Has CI, offline fixtures, interface previews.

Strong: real data only; provenance (SHA-256, `provenance.json`, verify script, `DATA_NOTES.md` with measured/docs/unverified tags); sensible science choices; offline fallback.
Weak: fixed regions only (not arbitrary RA/Dec); no visible blink video, URL queries or embeds (README mentions epoch *pairs*); manual update process tied to QR2; developer-only README with no user or story; repo clutter (stray scripts, two lockfiles).

How we beat them: arbitrary coordinates on demand; blink video; URL/embed; predicted-track overlay; automated updates; story-first presentation; match their rigor cheaply with a Data notes panel and provenance shown per frame.

**Rules:** do NOT copy their code (no license seen). Reimplementing from public IRSA documentation is fine. Do not disparage them in the pitch ("curated regions vs. anywhere in the sky" is enough).

## 7. Prizes [CHALLENGE]
1st €2500 · 2nd €1500 · 3rd €1000 · Best Use of Open Data €500 · Best Use of Local Application (Region) €500 · Best Storytelling and Creativity €500 · People's Choice €500 (voted during presentations).
Strategy [TEAM]: aim for 1st. Most specials come nearly free:
- Open Data: IRSA SPHEREx + Gaia DR3 + WISE + CDS, open-source repo, public embed/URL API.
- Storytelling: the story arc in §9.
- People's Choice: audience types coordinates themselves via a QR code on their phones.
- Local Application: bonus only (Irish-language toggle, schools and Irish astronomy club outreach angle). Do not spend build time here.
Open question: can one team win multiple prizes? Ask organizers.

## 8. Tech stack [TEAM recommendation, confirm if changed]
| Layer | Choice |
|---|---|
| Frontend | Next.js + TypeScript on Vercel (preview deploy per PR) |
| Sky overlays | Aladin Lite (CDS) |
| Frame player | HTML canvas |
| Charts | uPlot or Plotly |
| Backend | Python FastAPI + Astropy + astroquery, hosted on Render/Railway/Fly (not Vercel functions: Astropy is heavy and IRSA calls can time out) |
| Cache | files or Supabase Storage; pre-cache the 5 presets |
| Quality | CI (lint, typecheck, build), Prettier, Ruff |
Fallback if backend hosting fails: pre-processing script that saves frames for the presets.

### Repo layout (one monorepo, one owner per folder)
```
/web/player      frame viewer, controls, URL state
/web/overlays    Aladin, Gaia/WISE, spectrum panel
/api             FastAPI, IRSA access, caching, refresh job
/docs            contract.md, architecture.md, targets.md, validation.md
/cache           pre-cached preset frames
```

## 9. Presentation plan [TEAM]
Story arc: Problem, why it matters, solution, impact. Save technical details for Q&A. Confirm slot length first.
1. Hook: Pluto and the blink comparator.
2. Problem: a billion objects, too much data, volunteers have proven the method.
3. Solution: live demo on WISE 0855 (dot moves along the predicted track), then a variable star's brightness plot, then the embed/URL share. Keep a recorded backup video.
4. Impact: who can use it, how it auto-updates, roadmap.
5. Close: one memorable line plus QR code.
Roles: storyteller, demo driver, science Q&A, tech Q&A. Prepare answers on false positives, pixel scale, wavelength variation, data refresh, scaling/cost.

## 10. Team roles and review pairs [TEAM, names to be filled]
| Role | Owns | Review buddy |
|---|---|---|
| 1. Science/validity lead | targets, motion math, validation sheet | 2 |
| 2. Data/backend | IRSA, caching, refresh job | 1 |
| 3. Frontend viewer | player, controls, URL state | 4 |
| 4. Frontend overlays/spectra | Aladin, Gaia/WISE, spectrum | 3 |
| 5. Design/story | UX, slides, demo video, user research | 6 |
| 6. QA/DevOps/pitch lead | deploy, six-target testing, run-throughs | 5 |

## 11. Schedule (relative hours, adjust to real deadline)
- 0–2: data spike. Pull one SPHEREx cutout for WISE 0855 **and one non-preset coordinate**. Deploy "hello world" frontend and backend. Lock scope. If IRSA fails, switch to cached data.
- 2–10: MVP end to end, deployed.
- 10–16: overlays, predicted tracks, difference mode, spectra. Rotate sleep.
- 16–20: validate all targets. **Feature freeze**: bug fixes only, with lead approval.
- 20–24: demo video, slides, two rehearsals, Q&A prep, submission checklist.
Submission checklist: public URL, open GitHub repo with README, 2-minute demo video, slides, one-page validation note. Check Space Apps submission requirements.

## 12. How Claude must work in this repo
**Context discipline**
- Read only: this file, the relevant folder's `CLAUDE.md`, `docs/contract.md`, and the files for your task. Do not explore the repo.
- One task per session. Stay inside your owner folder.
- Do not touch `package.json`, lockfiles, shared types, or config. Ask the config owner (a human) instead.
- No refactors, renames, or "improvements" outside the task.
- After each task, append two lines to `docs/architecture.md`: what changed, where, and any new constraint.
- Build against `docs/contract.md` (API shapes). If the contract must change, say so and stop. A human updates it.

**Science and honesty**
- Do not invent IRSA endpoints, column names, or astronomy numbers. Mark anything unchecked `unverified` in code comments and in the UI Data notes panel.
- Never mix bands in a blink sequence. Never fake or synthesize data in the live app. Any fixture must be labeled as a fixture.
- Validate inputs (RA 0–360, Dec -90 to 90, capped FOV), rate-limit the API, keep secrets out of git (`.env.example` only).

**Git**
- `main` is protected and always deployable. One branch per task, PRs under about 300 lines.
- Every PR needs a human review, green CI, and a working Vercel preview. Merge `main` into your branch first. No force-push.
- Merge window about every 2 hours, then re-test all five presets.
- Tag known-good builds (`v0.1`, `v0.2`) for rollback.
- If one person runs several Claudes, use `git worktree`, one per task.
- Keep a prompt log (supports the validity and open-data story).

## 13. Known risks
| Risk | Prevention |
|---|---|
| Merge conflicts | folder ownership, small PRs, frequent merges |
| Frontend/backend drift | contract file, mocks, contract test in CI |
| Claude invents data endpoints or facts | data spike first; human checks against IRSA notebooks; science lead validates on known cases |
| Claude refactors unrelated files | scoped prompts; reviewer rejects out-of-scope diffs |
| IRSA slow, down, or rate-limited | cache presets; stored-frame fallback; AWS mirror |
| Hosting limits found late | deploy hello-world in first 2 hours |
| Band flicker looks like motion | like-band blinking only; validate on WISE 0855 and Barnard's Star |
| Scope creep | MVP list is fixed; extras need lead approval |
| Reviewer fatigue | rotate reviewers; freeze at hour 16 |
| Live demo fails | cached presets, recorded backup, rehearsed fallback |

## 14. Open items for humans to fill in
- [ ] Verify the resource list in the "Resources" section of hackathlone.com/challenges/planet-x-and-spherex (our list came partly from Claude's general knowledge: IRSA SPHEREx tutorials, WiseView, Gaia DR3, WISE, Aladin Lite, Astropy)
- [ ] Confirm the latest SPHEREx release and IRSA access method (TAP/SIA/cutout service)
- [ ] Test-target coordinates and proper motions verified (`docs/targets.md`)
