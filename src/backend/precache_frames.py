#!/usr/bin/env python3
"""Precompute /frames and /stars for the 5 challenge targets into demo_cache/.

Usage:
    uv run python precache_frames.py                 # all targets not done yet
    uv run python precache_frames.py wise-0855       # one target
    uv run python precache_frames.py wise-0855 --force
Each target runs in its own process with a hard time limit, so a stuck download cannot hang the script.
"""
import json
import logging
import subprocess
import sys
import time
from pathlib import Path

from astropy.coordinates import SkyCoord

import cache
from gaia import get_stars
from resolve import resolve
from spherex import build_frames

DEMO_FRAMES_DIR = Path(__file__).parent / "demo_cache" / "frames"
INDEX_PATH = DEMO_FRAMES_DIR / "index.json"
URL_BASE = "/demo/frames"  # demo_cache/ is mounted at /demo in main.py
SIZE_DEG = 0.05
SIZE_ARCMIN = SIZE_DEG * 60  # Gaia query uses arcminutes
ATTEMPTS = 5
RETRY_DELAY_S = 5
TARGET_TIMEOUT_S = 900  # hard limit per target (15 minutes)

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
            print(f"  {label}: attempt {attempt}/{ATTEMPTS} failed: {exc}", flush=True)
            if attempt == ATTEMPTS:
                raise
            time.sleep(RETRY_DELAY_S)


def process(target: dict) -> dict:
    slug = target["slug"]
    out_dir = DEMO_FRAMES_DIR / slug
    ra, dec = get_coords(target)
    print(f"  coordinates: ra={ra:.5f} dec={dec:.5f}", flush=True)

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
        print("  WARNING: fewer than 2 epochs, motion cannot be seen", flush=True)

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


def run_worker(slug: str) -> int:
    """Runs inside the child process: build one target and record it in index.json."""
    target = next(t for t in TARGETS if t["slug"] == slug)
    try:
        info = process(target)
    except Exception as exc:
        print(f"FAIL {target['name']}: {exc}", flush=True)
        return 1
    DEMO_FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    index = json.loads(INDEX_PATH.read_text()) if INDEX_PATH.exists() else {}
    index[slug] = info
    INDEX_PATH.write_text(json.dumps(index, indent=2))
    print(f"OK   {target['name']}: {info['n_frames']} frames, "
          f"{info['n_epochs']} epochs, {info['n_stars']} stars", flush=True)
    return 0


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    args = sys.argv[1:]

    if args and args[0] == "--worker":
        sys.exit(run_worker(args[1]))

    force = "--force" in args
    wanted = [a for a in args if not a.startswith("--")]
    index = json.loads(INDEX_PATH.read_text()) if INDEX_PATH.exists() else {}

    for target in TARGETS:
        slug = target["slug"]
        if wanted and slug not in wanted:
            continue
        if slug in index and not force:
            print(f"SKIP {target['name']} (already done)")
            continue

        print(f"START {target['name']} (limit {TARGET_TIMEOUT_S // 60} min)", flush=True)
        try:
            subprocess.run(
                [sys.executable, str(Path(__file__).resolve()), "--worker", slug],
                timeout=TARGET_TIMEOUT_S,
            )
        except subprocess.TimeoutExpired:
            print(f"FAIL {target['name']}: timed out after {TARGET_TIMEOUT_S // 60} min, skipped", flush=True)


if __name__ == "__main__":
    main()
