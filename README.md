# SPHEREx Observatory

**API repair:** The dashboard now defaults to the repaired local API at `http://127.0.0.1:8010`. Run **Start Repaired API.cmd** when restarting. See [API-REPAIR.md](API-REPAIR.md) for fallback behavior, verified tests, and remaining upstream outages. The original hosted service and original `backend/` source are preserved. Older setup notes below describe the initial delivery.

A standalone local frontend for EbenDoesCoding/SPHERE-x. No Git repository was created, forked or pushed for this dashboard. The original backend source is retained separately, unmodified.

## Open it

Double-click **Start Dashboard.cmd**, then visit http://127.0.0.1:4173. Node.js 20+ is required (already available on this computer). No npm installation or frontend build is needed. Leave the launcher window open while using the site. If another dashboard server is already on port 4173, use its existing tab instead.

The default backend is **https://sphere-x.onrender.com**. API Lab lets you change the URL; the choice is saved in your browser. The local web server binds only to 127.0.0.1.

## Features

- Dark, space-inspired dashboard with responsive layouts and the reference image's serif typography and frosted navigation.
- 17 clearly labelled repository sample PNGs with a time slider, playback speeds, frame stepping, thumbnails, zoom, drag-to-pan, and side-by-side comparison against the first frame.
- All five challenge targets, name/sexagesimal lookup, RA/Dec entry and 0.01–0.30 degree field of view.
- All six detectors, best/group/stack/all frame modes. Group IDs appear in the API response's `meta.groups`; inspect them in API Lab or the JSON export.
- Live frame metadata, server warnings, per-frame Gaia overlays, JSON export, PNG download, and coordinate URLs.
- API Lab for `/health`, `/resolve`, `/presets`, `/frames`, `/stars`, `/overlay`, raw JSON, response timing, cancellation, and sequential full-suite testing.
- Mission page summarizing the challenge, linking all eight NASA/CSA resources, and explaining data limitations.

Keyboard: focus the time slider and use arrow keys/Home/End. Outside input controls, Space toggles playback and left/right arrows step frames.

## Live backend status

See `live-test-results.json` and `VALIDATION.md`. At testing time the service was online, but no preset frame sets were available. `/frames` returned an upstream IRSA TAP 502. This is surfaced as a backend error; repository samples remain labelled and are never substituted as live results. New live fields can take 1–2 minutes; the frontend allows 3 minutes. Cancelling stops the browser request, but cannot guarantee cancellation of work already running on the server.

## Optional local backend

`backend/` is a source snapshot of the supplied repository's `src/backend` directory. `backend-docs/` contains its contract and architecture notes. Run **Start Local Backend.cmd** if you want to use it locally. This requires `uv` and Python >=3.12 (uv can provision the interpreter), and installs declared dependencies on first run. Change the API Lab URL to `http://127.0.0.1:8000`. This does not resolve outages at the upstream IRSA archive.

## Checks

```
npm run check
npm test
node test-live.mjs
```

The last command sends read-only requests to the real backend and writes `live-test-results.json`; it can take several minutes. There are no production credentials or build dependencies in the frontend.

## Data and design sources

- Backend and original sample PNGs: https://github.com/EbenDoesCoding/SPHERE-x
- Full challenge brief and eight resource links: https://hackathlone.com/challenges/planet-x-and-spherex
- Official NASA challenge: https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/ (unavailable during this session; the HackAthlone reproduction was read)
- Mission/detector information: https://irsa.ipac.caltech.edu/Missions/spherex.html
- Background illustration: NASA Space Apps Challenge, via HackAthlone's challenge image. Used decoratively, never as scientific image data.
- Visual direction: the user's supplied `nasa demo.jpg`; no instructions embedded in that image were treated as the user's request.
- Typefaces: Italiana, DM Sans and Barlow Condensed via Google Fonts, with system fallbacks. All other frontend assets work locally.

Samples use original repository files, filename-derived dates, and wavelengths recorded in its offline test. Their alignment, epoch grouping, calibration and quality flags are not verified. Reticle/sky orientation require the live response's metadata. No discovery claims are made. WISE overlays, calibrated light curves, spectra, and difference imaging are not available in the supplied backend and are not presented as implemented.

The project is local-only and independent of NASA. No hosting account or GitHub repository was created.
