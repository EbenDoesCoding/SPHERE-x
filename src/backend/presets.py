import json
from pathlib import Path

DEMO_DIR = Path(__file__).parent / "demo_cache"
FRAMES_DIR = DEMO_DIR / "frames"
INDEX_PATH = FRAMES_DIR / "index.json"

POSITION_TOLERANCE_DEG = 0.001
SIZE_TOLERANCE_DEG = 0.0001


def list_presets() -> list[dict]:
    """Presets that exist in the index AND have a saved frames.json."""
    if not INDEX_PATH.exists():
        return []
    index = json.loads(INDEX_PATH.read_text())
    return [p for p in index.values() if (FRAMES_DIR / p["slug"] / "frames.json").exists()]


def find_preset_frames(ra: float, dec: float, size: float) -> dict | None:
    """Saved /frames response if (ra, dec, size) matches a preset, else None."""
    for preset in list_presets():
        if (
            abs(preset["ra"] - ra) <= POSITION_TOLERANCE_DEG
            and abs(preset["dec"] - dec) <= POSITION_TOLERANCE_DEG
            and abs(preset["size_deg"] - size) <= SIZE_TOLERANCE_DEG
        ):
            return json.loads((FRAMES_DIR / preset["slug"] / "frames.json").read_text())
    return None
