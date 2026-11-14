# API contract

Single source of truth for frontend ⇄ backend. If an endpoint changes, update this file first. Backend code lives in `src/backend`.

- **Base URL:** the Render service URL (`BASE` below). Free tier sleeps: call `/health` first and wait up to 60 s.
- **Format:** JSON. CORS is open (`*`).
- **Image URLs are relative.** Prepend `BASE` to every `image_url`.
- **Units are not uniform (known inconsistency):**

| Endpoint | `size` unit |
|---|---|
| `/frames`, `/overlay` | degrees (0.01 – 0.30) |
| `/stars` | arcminutes (default 2) |

  Equivalent: 0.05° = 3′. Use degrees everywhere in the frontend and let `/overlay` handle the Gaia conversion.

## Errors

Every error is `{"error": "message"}` with one of these statuses.

| Status | Meaning |
|---|---|
| 400 | Bad input caught by the SPHEREx pipeline (range, detector, mode, group_id) |
| 404 | `/resolve`: name or coordinates not understood. `/frames`: SPHEREx has no images there yet |
| 422 | Missing or malformed parameter |
| 502 | Upstream service failed (IRSA or Gaia). Retry later |
| 503 | Server busy building another live request. Retry in about a minute |
| 500 | Unexpected server error |

## `GET /health`

`{"status": "ok"}`

## `GET /resolve?q=<text>`

`q` can be a name (`Barnard's Star`), `RA Dec` in degrees (`133.79513 -7.24515`), or sexagesimal (`08h55m10.831s -07d14m42.53s`, `08:55:10.831 -07:14:42.53`, `08 55 10.831 -07 14 42.53`; RA read as hours).

```json
{"name": "Barnard's Star", "ra": 269.45208, "dec": 4.69336}
```

Name lookup uses CDS Sesame (includes SIMBAD). Errors: 404.

## `GET /presets`

One-click targets whose frames are precomputed and served instantly.

```json
{"presets": [
  {"slug": "wise-0855", "name": "WISE 0855", "ra": 133.79513, "dec": -7.24515,
   "size_deg": 0.05, "n_frames": 12, "n_epochs": 4, "n_stars": 0}
]}
```

Empty list if nothing has been precomputed yet.

## `GET /frames`

| Param | Type | Default | Notes |
|---|---|---|---|
| `ra` | float | required | degrees, 0 – 360 |
| `dec` | float | required | degrees, −90 – 90 |
| `size` | float | 0.05 | degrees, 0.01 – 0.30 |
| `detector` | int | auto | 1 – 6 (auto = detector with most images) |
| `mode` | string | `best` | `best`, `group`, `stack`, `all` |
| `group_id` | int | none | wavelength group; required for `mode=group` |

**Speed.**
- A request matching a preset (same ra/dec within 0.001°, same size, default options) returns instantly from disk.
- A repeated live request returns instantly from cache.
- A new live request is slow (IRSA query plus cutout downloads, often 1 – 2 min) and can fail with 502 or 503. The frontend needs a long timeout and a progress message.

**Modes.**
- `best`: one image per exposure, from the best-ranked wavelength group (most epochs, longest baseline).
- `group`: same, for the chosen `group_id`.
- `stack`: one image per epoch (visit), averaging frames of that epoch.
- `all`: every frame, all wavelengths mixed. Brightness changes may be colour, not motion. Label it in the UI.

**Response:**

```json
{
  "request": {"ra": 133.79513, "dec": -7.24515, "size_deg": 0.05},
  "grid": {
    "width": 180, "height": 180,
    "pixel_scale_arcsec": 0.0, "native_pixel_scale_arcsec": 0.0,
    "target_xy": [89.5, 89.5],
    "orientation": "north up, east left",
    "wcs": {"ctype": ["RA---TAN", "DEC--TAN"], "crval": [0, 0], "crpix": [0, 0], "cdelt": [0, 0]}
  },
  "stretch": {"mode": "asinh", "lo": 0.0, "hi": 0.0, "percentiles": [1.0, 99.0], "subtract_median": true},
  "frames": [
    {
      "index": 0, "t_mjd": 0.0, "t_iso": "2026-01-01T00:00:00.000", "epoch": 0,
      "detector": 5, "wavelength_um": 0.0, "n_stacked": 1,
      "version": "", "release": "qr3", "file_id": "", "file_ids": [""],
      "image_url": "/demo/frames/wise-0855/00_D5_61000.1234.png",
      "valid_frac": 1.0, "flagged_frac": 0.0
    }
  ],
  "meta": {
    "mode": "best", "selected_groups": [0],
    "groups": [{"id": 0, "wavelength_um": 0.0, "n_frames": 0, "n_epochs": 0, "baseline_days": 0.0,
                "first_iso": "", "last_iso": "", "usable_for_motion": true, "recommended": true}],
    "warnings": [], "detector": 5, "detectors_available": {"5": 0},
    "n_found": 0, "n_candidates": 0, "n_downloaded": 0, "n_failed": 0, "elapsed_s": 0.0
  }
}
```

(The numbers above are placeholders to show the shape, not real values.)

Notes:
- All frames share one sky grid and one brightness stretch, so a fixed star stays on the same pixel with the same brightness across frames.
- Play frames in index order (sorted by time).
- Show `meta.warnings` to the user. `usable_for_motion: false` or fewer than 2 epochs means motion cannot be assessed.
- Pixel coordinates: origin top-left, y down, matching the PNG. `target_xy` is the requested position.

## `GET /stars`

Gaia DR3 stars around a position (epoch 2016.0).

`GET /stars?ra=88.79&dec=7.40&size=2` (size in arcminutes)

```json
{"stars": [{"id": "3745...", "ra": 88.79, "dec": 7.40, "pmra": 27.5, "pmdec": 11.3, "mag": 9.1}]}
```

- Brightest first, at most 200.
- `pmra`, `pmdec` in mas/yr (`pmra` already includes cos(dec)). Any value can be `null`.
- `mag` is Gaia G magnitude.
- Gaia misses some very bright and very faint objects (WISE 0855 is not in Gaia). Error: 502.

## `GET /overlay`

Where each Gaia star should be on each frame, with proper motion applied to the frame's date. Same parameters as `/frames`. Triggers the same frame build (or cache hit), so it is as fast as `/frames`.

```json
{
  "width": 180, "height": 180, "n_frames": 12,
  "stars": [{"id": "3745...", "mag": 9.1, "positions": [[88.5, 90.2], [88.6, 90.1]]}]
}
```

- `positions[i]` is the `[x, y]` for `frames[i]`, in the same pixel space as the PNGs.
- Stars never inside the field are omitted. Stars without proper motion stay fixed.
- Parallax is not applied (unverified whether this matters at SPHEREx resolution).
- A moving object that is NOT in the overlay is a candidate mover.

## Static files

| Path | Content |
|---|---|
| `/demo/...` | committed preset frames (`demo_cache/`) |
| `/static/...` | live-built frames (disk only keeps the 20 most recent builds) |
| `/docs` | auto-generated interactive API page (FastAPI) |

## Planned (not built)

- Predicted track for objects missing from Gaia (WISE 0855), using SIMBAD proper motion
- `/lightcurve` (brightness over time, for RW Aur and R Dra)
- Difference mode, on-the-fly spectrum, WISE overlay
