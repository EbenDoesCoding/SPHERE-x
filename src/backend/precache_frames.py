#!/usr/bin/env python3
"""Precompute /frames and /stars for the 5 challenge targets into demo_cache/."""
import json
import logging
import sys
import time
from pathlib import Path

from astropy.coordinates import SkyCoord

import cache
from gaia import get_stars
from resolve import resolve
from spherex import build_frames

DEMO_FRAMES_DIR = Path(__file__).parent / "demo_cache" / "frames"
URL_BASE = "/demo/frames"  # demo_cache/ gets mounted at /demo in stage 9b
SIZE_DEG = 0.05
SIZE_ARCMIN = SIZE_DEG * 60  # Gaia query uses arcminutes
ATTEMPTS = 10
RETRY_DELAY_S = 30

TARGETS = [
    {"slug": "barnards-star", "name": "Barnard's Star", "query": "Barnard's Star"},
    {"slug": "epsilon-indi-b", "name": "Epsilon Indi B", "query": "eps Ind B"},
    {"slug": "wise-0855", "name": "WISE 0855", "coords": ("08h55m10.831s", "-07d14m42.53s")},
    {"slug": "rw-aurigae", "name": "RW Aurigae", "query": "RW Aur"},
    {"slug": "r-draconis", "name": "R Draconis", "query": "R Dra"},
]


def get_coords(target: dict) -> tuple[float, float]:
    if "coords" in target:
        c = SkyCoord(*target["coords"], frame="icrs")
        return float(c.ra.deg), float(c.dec.deg)
    result = resolve(target["query"])
    return result["ra"], result["dec"]


def with_retries(func, label: str):
    for attempt in range(1, ATTEMPTS + 1):
        try:
            return func()
        except Exception as exc:
            print(f"  {label}: attempt {attempt}/{ATTEMPTS} failed: {exc}")
            if attempt == ATTEMPTS:
                raise
            time.sleep(RETRY_DELAY_S)


def process(target: dict) -> dict:
    slug = target["slug"]
    out_dir = DEMO_FRAMES_DIR / slug
    ra, dec = get_coords(target)
    print(f"  coordinates: ra={ra:.5f} dec={dec:.5f}")

    result = with_retries(
        lambda: build_frames(ra, dec, SIZE_DEG, None, out_dir, f"{URL_BASE}/{slug}"),
        "frames",
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "frames.json").write_text(json.dumps(result))

    stars = with_retries(lambda: get_stars(ra, dec, SIZE_ARCMIN), "stars")
    cache.save("stars", ra, dec, SIZE_ARCMIN, {"stars": stars}, demo=True)

    n_epochs = len({f["epoch"] for f in result["frames"]})
    if n_epochs < 2:
        print("  WARNING: fewer than 2 epochs, motion cannot be seen")

    return {
        "slug": slug,
        "name": target["name"],
        "ra": ra,
        "dec": dec,
        "size_deg": SIZE_DEG,
        "n_frames": len(result["frames"]),
        "n_epochs": n_epochs,
        "n_stars": len(stars),
    }


def main():
    logging.basicConfig(level=logging.INFO)
    args = sys.argv[1:]
    force = "--force" in args
    wanted = [a for a in args if not a.startswith("--")]

    DEMO_FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    index_path = DEMO_FRAMES_DIR / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {}

    for target in TARGETS:
        slug = target["slug"]
        if wanted and slug not in wanted:
            continue
        if slug in index and not force:
            print(f"SKIP {target['name']} (already done)")
            continue

        print(f"START {target['name']}")
        try:
            index[slug] = process(target)
            index_path.write_text(json.dumps(index, indent=2))
            info = index[slug]
            print(f"OK   {target['name']}: {info['n_frames']} frames, "
                  f"{info['n_epochs']} epochs, {info['n_stars']} stars")
        except Exception as exc:
            print(f"FAIL {target['name']}: {exc}")


if __name__ == "__main__":
    main()
