import json
from pathlib import Path

CACHE_DIR = Path(__file__).parent / "cache"


def _path(name: str, ra: float, dec: float, size: float) -> Path:
    return CACHE_DIR / f"{name}_{ra:.4f}_{dec:.4f}_{size:.2f}.json"


def load(name: str, ra: float, dec: float, size: float):
    """Return cached data, or None if not cached."""
    path = _path(name, ra, dec, size)
    if path.exists():
        return json.loads(path.read_text())
    return None


def save(name: str, ra: float, dec: float, size: float, data) -> None:
    CACHE_DIR.mkdir(exist_ok=True)
    _path(name, ra, dec, size).write_text(json.dumps(data))
BASE_DIR = Path(__file__).parent
CACHE_DIR = BASE_DIR / "cache"
DEMO_DIR = BASE_DIR / "demo_cache"


def _filename(name: str, ra: float, dec: float, size: float) -> str:
    return f"{name}_{ra:.4f}_{dec:.4f}_{size:.2f}.json"


def load(name: str, ra: float, dec: float, size: float):
    """Return cached data (demo cache first, then runtime cache), or None."""
    for folder in (DEMO_DIR, CACHE_DIR):
        path = folder / _filename(name, ra, dec, size)
        if path.exists():
            return json.loads(path.read_text())
    return None


def save(name: str, ra: float, dec: float, size: float, data, demo: bool = False) -> None:
    folder = DEMO_DIR if demo else CACHE_DIR
    folder.mkdir(exist_ok=True)
    (folder / _filename(name, ra, dec, size)).write_text(json.dumps(data))
