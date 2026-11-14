import numpy as np
from astropy.time import Time
from astropy.wcs import WCS

GAIA_EPOCH_MJD = Time(2016.0, format="jyear").mjd  # Gaia DR3 reference epoch
MAS_PER_DEG = 3.6e6
DAYS_PER_YEAR = 365.25


def _grid_wcs(grid_wcs: dict) -> WCS:
    """Rebuild the common-grid WCS that spherex.py returns in meta."""
    w = WCS(naxis=2)
    w.wcs.ctype = grid_wcs["ctype"]
    w.wcs.crval = grid_wcs["crval"]
    w.wcs.crpix = grid_wcs["crpix"]
    w.wcs.cdelt = grid_wcs["cdelt"]
    return w


def _values(stars: list[dict], key: str) -> np.ndarray:
    """Column of floats; missing values (None) become 0."""
    return np.array([s[key] if s[key] is not None else 0.0 for s in stars], dtype=float)


def build_overlay(frames_result: dict, stars: list[dict]) -> dict:
    """Pixel position of every Gaia star on every frame, corrected for proper motion."""
    grid = frames_result["grid"]
    width, height = grid["width"], grid["height"]
    frames = frames_result["frames"]
    stars = [s for s in stars if s["ra"] is not None and s["dec"] is not None]

    result = {"width": width, "height": height, "n_frames": len(frames), "stars": []}
    if not stars or not frames:
        return result

    ra0, dec0 = _values(stars, "ra"), _values(stars, "dec")
    pmra, pmdec = _values(stars, "pmra"), _values(stars, "pmdec")  # mas/yr, pmra includes cos(dec)

    # Years between Gaia's epoch and each frame: shape (n_frames, 1)
    years = np.array([(f["t_mjd"] - GAIA_EPOCH_MJD) / DAYS_PER_YEAR for f in frames])[:, None]

    cos_dec = np.maximum(np.cos(np.radians(dec0)), 1e-6)
    ra_t = ra0 + pmra * years / MAS_PER_DEG / cos_dec   # shape (n_frames, n_stars)
    dec_t = dec0 + pmdec * years / MAS_PER_DEG

    x, y = _grid_wcs(grid["wcs"]).wcs_world2pix(ra_t.ravel(), dec_t.ravel(), 0)
    x = x.reshape(ra_t.shape)
    y = (height - 1) - y.reshape(ra_t.shape)  # PNGs are flipped so north is up

    inside = np.isfinite(x) & np.isfinite(y) & (x >= 0) & (x <= width - 1) & (y >= 0) & (y <= height - 1)

    for j, star in enumerate(stars):
        if not inside[:, j].any():
            continue  # never visible in this field
        result["stars"].append({
            "id": star["id"],
            "mag": star["mag"],
            "positions": [[round(float(x[i, j]), 2), round(float(y[i, j]), 2)] for i in range(len(frames))],
        })
    return result
