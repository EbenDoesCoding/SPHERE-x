import logging
import shutil
import time
from pathlib import Path

log = logging.getLogger("cleanup")

LIVE_FRAMES_DIR = Path(__file__).parent / "static" / "frames"
MAX_LIVE_FOLDERS = 20
MIN_AGE_SECONDS = 120          # never touch a folder that may still be written
PROTECTED_FOLDERS = {"test"}   # committed sample frames


def trim_live_frames(max_folders: int = MAX_LIVE_FOLDERS) -> None:
    """Delete the oldest live-frame folders so at most max_folders remain."""
    try:
        if not LIVE_FRAMES_DIR.exists():
            return
        folders = [
            p for p in LIVE_FRAMES_DIR.iterdir()
            if p.is_dir() and p.name not in PROTECTED_FOLDERS
        ]
        folders.sort(key=lambda p: p.stat().st_mtime)  # oldest first

        now = time.time()
        for folder in folders[: max(0, len(folders) - max_folders)]:
            if now - folder.stat().st_mtime < MIN_AGE_SECONDS:
                continue
            shutil.rmtree(folder, ignore_errors=True)
            log.info("removed old live frames: %s", folder.name)
    except Exception:
        log.exception("live frames cleanup failed")
