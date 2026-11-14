# Validation

How we check the backend is correct and scientifically valid. Results are blank until actually run. Never record a pass without running the check.

Status: ☐ not run · ✅ pass · ❌ fail (add a note)

## 1. API checks

Run against the live Render URL (`BASE`). Wake it with `/health` first.

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | `/health` | `{"status":"ok"}` | ☐ |
| 2 | `/resolve?q=Barnard's Star` | ra about 269.45, dec about 4.69 | ☐ |
| 3 | `/resolve?q=08h55m10.831s -07d14m42.53s` | ra about 133.795, dec about -7.245 | ☐ |
| 4 | `/resolve?q=133.79513 -7.24515` | unchanged degrees | ☐ |
| 5 | `/resolve?q=asdfgh` | 404 `{error}` | ☐ |
| 6 | `/resolve?q=999 99` | 404 `{error}` (range) | ☐ |
| 7 | `/stars?ra=88.79&dec=7.40&size=2` | non-empty `stars` list | ☐ |
| 8 | Same call twice | second call much faster (cache) | ☐ |
| 9 | `/presets` | lists the precomputed targets | ☐ |
| 10 | `/frames` for each preset | instant, frames sorted by time | ☐ |
| 11 | Open one `image_url` (`BASE` + path) | PNG loads | ☐ |
| 12 | `/overlay` for each preset | positions line up with `frames` | ☐ |
| 13 | `/frames?ra=10&dec=10&size=5` | 400 `{error}` | ☐ |
| 14 | Two live `/frames` at once | second gets 503 immediately | ☐ |
| 15 | Live (non-preset) `/frames` | completes, or a clean `{error}`; no crash | ☐ |
| 16 | Memory during a live build (Render → Metrics) | stays under 512 MB | ☐ |

## 2. Science validity checks

| # | Check | How | Status |
|---|---|---|---|
| S1 | Only like-band frames are shown together | `meta.selected_groups` is one group in `best`/`group` mode; `all` mode shows its warning | ☐ |
| S2 | Frames are on one common sky grid | A fixed star lands on the same pixel in every frame | ☐ |
| S3 | One shared brightness stretch | A constant star does not flicker | ☐ |
| S4 | Gaia overlay moves with proper motion | Barnard's Star marker shifts between frames while a background star's marker does not | ☐ |
| S5 | Observed motion matches the prediction | Barnard's Star in the images sits on the overlay marker in early and late frames | ☐ |
| S6 | WISE 0855 moves along its expected direction | Needs a WISE/SIMBAD proper motion (Gaia lacks it) | ☐ |
| S7 | At least 2 epochs per preset | `n_epochs >= 2` in `/presets` | ☐ |
| S8 | Target near the image centre | Visual check, first and last frame | ☐ |
| S9 | Epsilon Indi B shown as a blended source | UI note present | ☐ |
| S10 | RW Aur / R Dra show brightness change | Needs a `/lightcurve` endpoint (not built) | ☐ |
| S11 | Dates are correct | `t_iso` matches the file dates in IRSA | ☐ |
| S12 | Pixel scale is about 6.2″ | `grid.native_pixel_scale_arcsec` in a response | ☐ |

## 3. Unverified items

These are marked `UNVERIFIED` in the code or in `CLAUDE.md`. Check them before they appear in the UI or pitch.

| Item | Where | Note |
|---|---|---|
| Which FLAGS bits mean "bad pixel" | `spherex.py` `BAD_FLAG_MASK = 0` | Currently masks nothing and only reports the flagged fraction. Look up bit meanings in the SPHEREx Explanatory Supplement |
| Whether IMAGE data is already background-subtracted | `spherex.py` `subtract_median=True` | Median is subtracted per frame before stretching |
| Wavelength grouping thresholds (0.4% gap, 0.6% span) | `spherex.py` | Tuned only on WISE 0855, detector 5 |
| Epoch gap (10 days) | `spherex.py` | Starting value |
| Pixel scale about 6.2″ | `CLAUDE.md` | From a competitor README; the real value is reported per request |
| Proper motions | `docs/targets.md` | General knowledge, not fetched |
| Gaia parallax ignored in `/overlay` | `overlay.py` | Probably small versus SPHEREx pixels; not checked |
| IRSA release and collection names | `CLAUDE.md` says `spherex_qr2` | IRSA docs say QR2 is no longer searchable; use `spherex_dr1`, `spherex_qr3` (+ `_deep`) |

## 4. Data notes (for the UI "Data notes" panel)

| Statement | Basis |
|---|---|
| Images are SPHEREx spectral image cutouts from NASA/IPAC IRSA | Documented |
| Positions of catalog stars come from Gaia DR3 (epoch 2016.0) | Documented |
| Star markers are moved by catalog proper motion to each frame's date | Our calculation (see `overlay.py`) |
| Each frame has its release, file ID and processing version | Measured: read from the files |
| Wavelength is read from each file's WCS at the target pixel | Measured |
| Brightness is stretched with one scale per request | Our choice (documented in `meta`/`stretch`) |
| Pixel scale is reported per request | Measured from the file WCS |
| Bad-pixel masking is not applied; only the flagged fraction is reported | Our limitation |
| Epsilon Indi B pair is not resolved by SPHEREx | Unverified |

## 5. Before the demo

- [ ] All five presets pass checks 9 – 12 and S1 – S5, S7, S8
- [ ] Render awake (`/health`) 5 minutes before presenting
- [ ] Recorded backup demo video exists
- [ ] Unverified items are labelled "unverified" in the UI, or removed from it
- [ ] One-page validation note (from this file) is ready for submission
