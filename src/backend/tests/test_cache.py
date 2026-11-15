import cache


def _use_tmp(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setattr(cache, "DEMO_DIR", tmp_path / "demo")


def test_roundtrip(tmp_path, monkeypatch):
    _use_tmp(monkeypatch, tmp_path)
    assert cache.load("stars", 1.0, 2.0, 3.0) is None
    cache.save("stars", 1.0, 2.0, 3.0, {"stars": []})
    assert cache.load("stars", 1.0, 2.0, 3.0) == {"stars": []}


def test_demo_cache_wins(tmp_path, monkeypatch):
    _use_tmp(monkeypatch, tmp_path)
    cache.save("stars", 1.0, 2.0, 3.0, {"v": "runtime"})
    cache.save("stars", 1.0, 2.0, 3.0, {"v": "demo"}, demo=True)
    assert cache.load("stars", 1.0, 2.0, 3.0)["v"] == "demo"


def test_nearby_positions_share_a_file(tmp_path, monkeypatch):
    _use_tmp(monkeypatch, tmp_path)
    cache.save("stars", 1.00001, 2.0, 3.0, {"a": 1})
    assert cache.load("stars", 1.00002, 2.0, 3.0) == {"a": 1}
