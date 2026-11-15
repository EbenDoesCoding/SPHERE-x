#!/usr/bin/env python3
"""Smoke test for a running backend.

Usage: uv run python smoke_test.py https://your-service.onrender.com
"""
import sys
import time

import requests

WAKE_ATTEMPTS = 8
FAST_LIMIT_S = 3.0  # preset frames must answer this quickly


def get(base: str, path: str, **params):
    start = time.time()
    response = requests.get(base + path, params=params, timeout=90)
    return response, time.time() - start


def report(name: str, ok: bool, detail: str = "") -> bool:
    print(f"{'PASS' if ok else 'FAIL'}  {name} {detail}".rstrip())
    return ok


def wake(base: str) -> bool:
    for _ in range(WAKE_ATTEMPTS):
        try:
            response, secs = get(base, "/health")
            if response.status_code == 200:
                return report("health", True, f"({secs:.1f}s)")
        except requests.RequestException:
            pass
        time.sleep(10)
    return report("health", False, "server did not wake up")


def check_preset(base: str, preset: dict) -> list[bool]:
    name = preset["name"]
    params = {"ra": preset["ra"], "dec": preset["dec"], "size": preset["size_deg"]}
    results = []

    response, secs = get(base, "/frames", **params)
    frames = response.json().get("frames", []) if response.status_code == 200 else []
    times = [f["t_mjd"] for f in frames]
    results.append(report(f"{name}: /frames fast", response.status_code == 200 and secs < FAST_LIMIT_S, f"({secs:.1f}s)"))
    results.append(report(f"{name}: frames sorted by time", bool(frames) and times == sorted(times), f"({len(frames)} frames)"))

    if frames:
        image, _ = get(base, frames[0]["image_url"])
        is_png = image.headers.get("content-type", "").startswith("image/")
        results.append(report(f"{name}: first image loads", image.status_code == 200 and is_png))

    response, secs = get(base, "/overlay", **params)
    body = response.json() if response.status_code == 200 else {}
    results.append(report(f"{name}: /overlay", response.status_code == 200 and body.get("n_frames") == len(frames), f"({secs:.1f}s)"))
    return results


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    base = sys.argv[1].rstrip("/")
    results = [wake(base)]
    if not results[0]:
        return 1

    response, _ = get(base, "/resolve", q="Barnard's Star")
    results.append(report("resolve name", response.status_code == 200 and abs(response.json().get("ra", 0) - 269.45) < 0.05))
    response, _ = get(base, "/resolve", q="asdfghjkl")
    results.append(report("resolve error shape", response.status_code == 404 and "error" in response.json()))
    response, secs = get(base, "/stars", ra=88.79, dec=7.40, size=2)
    results.append(report("stars", response.status_code == 200 and "stars" in response.json(), f"({secs:.1f}s)"))
    response, _ = get(base, "/frames", ra=10, dec=10, size=5)
    results.append(report("frames bad size -> 400", response.status_code == 400 and "error" in response.json()))

    response, _ = get(base, "/presets")
    presets = response.json().get("presets", []) if response.status_code == 200 else []
    results.append(report("presets exist", len(presets) > 0, f"({len(presets)})"))
    for preset in presets:
        results.extend(check_preset(base, preset))

    failed = results.count(False)
    print(f"\n{len(results) - failed}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
