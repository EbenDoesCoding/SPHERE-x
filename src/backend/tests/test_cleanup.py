import os
import time

import cleanup


def _make_folders(root, ages):
    now = time.time()
    for name, age in ages.items():
        folder = root / name
        folder.mkdir()
        os.utime(folder, (now - age, now - age))


def test_removes_oldest_and_keeps_protected(tmp_path, monkeypatch):
    monkeypatch.setattr(cleanup, "LIVE_FRAMES_DIR", tmp_path)
    _make_folders(tmp_path, {"a": 5000, "b": 4000, "c": 3000, "test": 9000})
    cleanup.trim_live_frames(1)
    assert sorted(p.name for p in tmp_path.iterdir()) == ["c", "test"]


def test_recent_folders_are_never_removed(tmp_path, monkeypatch):
    monkeypatch.setattr(cleanup, "LIVE_FRAMES_DIR", tmp_path)
    _make_folders(tmp_path, {"a": 0, "b": 0, "c": 0})
    cleanup.trim_live_frames(1)
    assert len(list(tmp_path.iterdir())) == 3
