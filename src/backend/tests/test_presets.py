import json

import presets


def _setup(tmp_path, monkeypatch):
    frames_dir = tmp_path / "frames"
    (frames_dir / "wise").mkdir(parents=True)
    (frames_dir / "wise" / "frames.json").write_text(json.dumps({"frames": [{"index": 0}]}))
    index = {
        "wise": {"slug": "wise", "name": "WISE", "ra": 133.79513, "dec": -7.24515, "size_deg": 0.05},
        "missing": {"slug": "missing", "name": "Missing", "ra": 1.0, "dec": 1.0, "size_deg": 0.05},
    }
    (frames_dir / "index.json").write_text(json.dumps(index))
    monkeypatch.setattr(presets, "FRAMES_DIR", frames_dir)
    monkeypatch.setattr(presets, "INDEX_PATH", frames_dir / "index.json")


def test_list_skips_presets_without_frames(tmp_path, monkeypatch):
    _setup(tmp_path, monkeypatch)
    assert [p["slug"] for p in presets.list_presets()] == ["wise"]


def test_match_within_tolerance(tmp_path, monkeypatch):
    _setup(tmp_path, monkeypatch)
    assert presets.find_preset_frames(133.7951, -7.2452, 0.05) == {"frames": [{"index": 0}]}


def test_no_match_for_other_size_or_place(tmp_path, monkeypatch):
    _setup(tmp_path, monkeypatch)
    assert presets.find_preset_frames(133.79513, -7.24515, 0.10) is None
    assert presets.find_preset_frames(10.0, 10.0, 0.05) is None


def test_no_index(tmp_path, monkeypatch):
    monkeypatch.setattr(presets, "INDEX_PATH", tmp_path / "nothing.json")
    assert presets.list_presets() == []
    assert presets.find_preset_frames(1.0, 1.0, 0.05) is None
