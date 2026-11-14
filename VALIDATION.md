# Validation — 14 November 2026

## Frontend

- `npm run check`: passed syntax checks for the application, API helpers and HTTP server.
- `npm test`: all 6 tests passed. Coverage includes coordinate and group validation, degrees-to-arcminutes conversion, backend image URL handling, frame/overlay index preservation, scientific warnings, and HTTP serving of HTML/CSS/JS/JSON plus all 17 PNGs.
- Browser checks passed: real API health response from API Lab; sample images; next/previous frames; slider to the last observation; playback advancing; pause; zoom/reset; comparison; navigation; all eight resource links present.
- Responsive check: 390px viewport, image viewer fits its 335.5px content area; mobile next-frame control updates the observation and metadata. Desktop viewport restored afterward.
- Original sample images retained without modification. See `public/assets/sample.json` for provenance.
- Screenshot: `dashboard-preview.jpg`.
- Desktop check at 1440px: all three dashboard columns fit without page overflow. The live frame error was displayed correctly and Load observations became available again afterward.

## Backend offline tests

The supplied, unmodified `test-spherex-offline.py` completed with `ALL OFFLINE TESTS PASSED`. It exercised wavelength grouping, stacking, fixed-star reprojection, moving-source drift, input validation and simulated retry recovery. The fixed-star reprojection error was 0.03 output pixels; moving-source drift was 12.0 pixels versus 11.9 expected. These are the backend's labelled synthetic test cases, not live observations.

## Live backend: https://sphere-x.onrender.com

Read-only tests used WISE 0855 coordinates RA 133.79513°, Dec −7.24515°, FOV 0.05° (3 arcmin for `/stars`). Full responses and timings are saved in `live-test-results.json`.

| Endpoint | Result |
| --- | --- |
| `/health` | 200, status `ok` |
| `/resolve` | 200, decimal-coordinate query resolved |
| `/presets` | 200, empty preset list |
| `/frames` | 502, upstream IRSA TAP proxy error |
| `/stars` | 200, 43 Gaia records |
| `/overlay` | No response within 180 seconds; request timed out |

Live frame playback, nonempty Gaia overlay rendering, and live target coverage cannot be verified end to end until the backend can return frames. Those integrations follow the supplied API contract. No backend source was changed to disguise the failure, and no fixtures were inserted into the live service.

The local sample viewer works independently of the backend. Its files have incomplete scientific metadata and are clearly labelled as repository samples.

## Scope

No GitHub repository was created, no commits or pushes were made, and the supplied repository was not modified. Desktop delivery contains a separate backend source snapshot and its documentation. No site was published.
