"""
Offline test for spherex.py: no network, synthetic data.

Run:  uv run python test_spherex_offline.py

What it proves:
  * a star at a FIXED sky position lands on the same output pixel in every frame, even though
    each fake exposure has a different pointing offset and roll angle (reprojection works);
  * a star with proper motion drifts steadily across the frames (motion survives reprojection);
  * group_by_wavelength() splits the REAL detector-5 wavelengths/dates from the WISE 0855 run into
    5 steps, ranks the ~1-year ones first, and stack mode builds one image per epoch;
  * validate_request() rejects bad input.
The fake pixel scale below only builds fake data; spherex.py reads the real one from each WCS.
"""
import tempfile
from pathlib import Path

import astropy.units as u
import numpy as np
from astropy.coordinates import SkyCoord
from astropy.wcs import WCS
from PIL import Image

import spherex as sx

rng = np.random.default_rng(1)
RA0, DEC0 = 133.795129, -7.245147          # near WISE 0855
FAKE_SCALE = 6.2                            # arcsec/px, only for the fake data
N = 40                                      # fake cutout size in pixels


def fake_wcs(ra, dec, roll_deg):
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [(N + 1) / 2, (N + 1) / 2]
    s, th = FAKE_SCALE / 3600.0, np.deg2rad(roll_deg)
    w.wcs.cd = [[-s * np.cos(th), s * np.sin(th)], [s * np.sin(th), s * np.cos(th)]]
    return w


def render(w, stars, sigma=1.2, amp=100.0):
    yy, xx = np.mgrid[0:N, 0:N]
    img = rng.normal(5.0, 0.5, (N, N)).astype(np.float32)
    for s in stars:
        x, y = w.world_to_pixel(s)
        img += amp * np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * sigma**2))
    return img


def offset(coord, dra_arcsec, ddec_arcsec):
    return SkyCoord(coord.ra + dra_arcsec * u.arcsec / np.cos(coord.dec.rad),
                    coord.dec + ddec_arcsec * u.arcsec)


target = SkyCoord(RA0 * u.deg, DEC0 * u.deg)
static_star = offset(target, 25, 15)

cutouts, raw_px = [], []
for i in range(12):
    mover = offset(target, -40 + 3.0 * i, -20 + 1.5 * i)      # moves 3"/frame in RA, 1.5" in Dec
    # each fake exposure: different pointing (up to ~6") and a different roll angle
    centre = offset(target, rng.uniform(-6, 6), rng.uniform(-6, 6))
    w = fake_wcs(centre.ra.deg, centre.dec.deg, rng.uniform(-30, 30))
    ref = sx.ImageRef(uri=f"fake_{i}", mjd=60800.0 + 14 * i, detector=2, release="test", file_id=f"fake_{i}.fits")
    cutouts.append(sx.Cutout(ref, render(w, [static_star, mover]), None, w, 1.5 * (1 + 0.004 * rng.random()), "test"))
    raw_px.append(w.world_to_pixel(static_star))

# 4 extra frames at a different wavelength (should be rejected by pick_like_band)
for j in range(4):
    w = fake_wcs(RA0, DEC0, 0.0)
    ref = sx.ImageRef(uri=f"other_{j}", mjd=60970.0 + 14 * j, detector=2, release="test", file_id=f"other_{j}.fits")
    cutouts.append(sx.Cutout(ref, render(w, [static_star]), None, w, 1.9, "test"))

# ---- wavelength groups on the synthetic data
groups = sx.group_by_wavelength(cutouts)
assert len(groups) == 2 and groups[0].n_frames == 12, [(g.id, g.n_frames) for g in groups]
sets, ids = sx.select_frames(groups, cutouts, mode="best")
chosen = [s[0] for s in sets]
assert len(chosen) == 12 and all(abs(c.wavelength_um - 1.5) < 0.05 for c in chosen)
print(f"synthetic: {len(groups)} groups, best has {groups[0].n_frames} frames")

# ---- REAL wavelengths and dates from the live WISE 0855 / detector 5 run
REAL = [(60801.1066, 4.2964), (60801.1081, 4.3332), (60801.1096, 4.3703), (60986.8567, 4.2228),
        (60986.9212, 4.2951), (60986.9227, 4.3318), (60986.9242, 4.3686), (60987.1888, 4.2587),
        (61022.3681, 4.2226), (61162.6737, 4.2234), (61162.6751, 4.2598), (61163.2172, 4.2174),
        (61171.5672, 4.2234), (61172.1753, 4.2597), (61173.0641, 4.2963), (61173.6762, 4.3332),
        (61174.2872, 4.3701)]
real = [sx.Cutout(sx.ImageRef(f"r{i}", m, 5, "dr1", f"r{i}.fits"), np.zeros((2, 2), np.float32),
                  None, None, wl, "v27") for i, (m, wl) in enumerate(REAL)]
rg = sx.group_by_wavelength(real)
assert len(rg) == 5 and sum(g.n_frames for g in rg) == 17
assert len({c.epoch for c in real}) == 4                      # May'25, Nov'25, Dec'25, May'26
best = rg[0]
assert best.n_epochs == 3 and best.n_frames == 3 and best.baseline_days > 360, best.summary()
assert 4.29 < best.wavelength_um < 4.38                        # one of the ~1-year steps, not the 4.22 step
by_wl = {round(g.wavelength_um, 2): g for g in rg}
assert by_wl[4.22].n_frames == 5 and by_wl[4.22].baseline_days < 200   # most frames, shorter baseline
print("real detector-5 data -> groups (best first):")
for k, g in enumerate(rg):
    s = g.summary(recommended=(k == 0))
    print(f"  {'*' if k == 0 else ' '} id={s['id']} {s['wavelength_um']} um  {s['n_frames']} frames  "
          f"{s['n_epochs']} epochs  {s['baseline_days']} d")
sets, ids = sx.select_frames(rg, real, mode="stack")
assert [len(s) for s in sets] == [3, 3, 3] and len(ids) == 3, ([len(s) for s in sets], ids)
print(f"stack mode merges groups {sorted(ids)} -> {len(sets)} epoch stacks of 3 frames each")
for bad in [dict(mode="nope"), dict(mode="group", group_id=99), dict(mode="group")]:
    try:
        sx.select_frames(rg, real, **bad)
    except sx.BadRequest as e:
        print("rejected", bad, "->", e)
    else:
        raise AssertionError(bad)

# ---- reprojection
raw_px = np.array(raw_px)
print(f"static star pixel position WITHOUT reprojection: std = {raw_px.std(axis=0).round(2)} px  (this is the fake-motion problem)")

with tempfile.TemporaryDirectory() as tmp:
    res = sx.build_frames_from_cutouts(chosen, RA0, DEC0, 0.04, tmp, stretch="linear",
                                       percentiles=(1.0, 99.95))
    g = res["grid"]
    wo = WCS(naxis=2)
    wo.wcs.ctype, wo.wcs.crval = g["wcs"]["ctype"], g["wcs"]["crval"]
    wo.wcs.crpix, wo.wcs.cdelt = g["wcs"]["crpix"], g["wcs"]["cdelt"]
    n = g["height"]

    def centroid(img, x0, y0, r=6):
        x0, y0 = int(round(x0)), int(round(y0))
        win = img[max(0, y0 - r):y0 + r + 1, max(0, x0 - r):x0 + r + 1].astype(float)
        win = np.clip(win - np.median(win), 0, None)
        yy, xx = np.mgrid[max(0, y0 - r):y0 + r + 1, max(0, x0 - r):x0 + r + 1]
        return (xx * win).sum() / win.sum(), (yy * win).sum() / win.sum()

    ex, ey = (float(v) for v in wo.world_to_pixel(static_star))
    static_c, mover_c = [], []
    for k, f in enumerate(res["frames"]):
        png = np.flipud(np.array(Image.open(Path(tmp) / Path(f["image_url"]).name)))  # back to y-up
        static_c.append(centroid(png, ex, ey))
        mx, my = (float(v) for v in wo.world_to_pixel(offset(target, -40 + 3.0 * k, -20 + 1.5 * k)))
        mover_c.append(centroid(png, mx, my))
    static_c = np.array(static_c)
    err = np.hypot(static_c[:, 0] - ex, static_c[:, 1] - ey)
    print(f"static star AFTER reprojection: max error {err.max():.2f} output px "
          f"(output pixel = {g['pixel_scale_arcsec']} arcsec)")
    assert err.max() < 0.75, err
    mover_c = np.array(mover_c)
    drift = np.hypot(*(mover_c[-1] - mover_c[0]))
    expected = np.hypot(3.0 * 11, 1.5 * 11) / g["pixel_scale_arcsec"]
    print(f"moving star drift: {drift:.1f} output px (expected ~{expected:.1f})")
    assert abs(drift - expected) < 1.5
    print(f"frames written: {len(res['frames'])}, first: {res['frames'][0]['image_url']}, "
          f"t_iso: {res['frames'][0]['t_iso']}")

# ---- stacking through the full pipeline (4 stacks of 3 synthetic frames)
with tempfile.TemporaryDirectory() as tmp:
    for i, c in enumerate(chosen):
        c.epoch = i // 3
    stacked = [chosen[i:i + 3] for i in range(0, 12, 3)]
    res2 = sx.build_frames_from_cutouts(stacked, RA0, DEC0, 0.04, tmp, stretch="linear",
                                        percentiles=(1.0, 99.95))
    assert len(res2["frames"]) == 4 and all(f["n_stacked"] == 3 for f in res2["frames"])
    for f in res2["frames"]:
        png = np.flipud(np.array(Image.open(Path(tmp) / Path(f["image_url"]).name)))
        cx, cy = centroid(png, ex, ey)
        assert np.hypot(cx - ex, cy - ey) < 0.75, (cx - ex, cy - ey)
    print(f"stack through pipeline: {len(res2['frames'])} images, static star still within 0.75 px")

# ---- validation
for bad in [(10, 95, 0.05), (400, 0, 0.05), (10, 10, 5.0), ("x", 0, 0.05)]:
    try:
        sx.validate_request(*bad)
    except sx.BadRequest as e:
        print("rejected", bad, "->", e)
    else:
        raise AssertionError(f"{bad} should have been rejected")

# ---- second-chance download pass (mocked: no network)
import urllib.error
calls = {}
def fake_read(ref, coord):
    calls[ref.uri] = calls.get(ref.uri, 0) + 1
    if ref.uri == "flaky" and calls[ref.uri] <= 4:          # fails all 4 first-pass attempts
        raise TimeoutError("simulated IRSA hiccup")
    if ref.uri == "gone":
        raise urllib.error.HTTPError("gone", 404, "Not Found", None, None)
    return cutouts[0]
orig_read, orig_sleep = sx._read_cutout, sx.time.sleep
sx._read_cutout, sx.time.sleep = fake_read, lambda s: None
try:
    refs = [sx.ImageRef(u_, 60800.0, 5, "dr1", u_ + ".fits") for u_ in ("ok", "flaky", "gone")]
    got, n_failed = sx.fetch_cutouts(refs, None)
finally:
    sx._read_cutout, sx.time.sleep = orig_read, orig_sleep
assert len(got) == 2 and n_failed == 1, (len(got), n_failed)
print("retry pass: flaky cutout recovered on the second pass, permanent 404 stays failed")

print("\nALL OFFLINE TESTS PASSED")
