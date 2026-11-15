import threading

import pytest
from fastapi.testclient import TestClient

import main
from spherex import NoCoverage, UpstreamError

client = TestClient(main.app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def no_presets(monkeypatch):
    monkeypatch.setattr(main, "find_preset_frames", lambda ra, dec, size: None)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_resolve_ok(monkeypatch):
    monkeypatch.setattr(main, "resolve", lambda q: {"ra": 1.0, "dec": 2.0, "source": "test"})
    assert client.get("/resolve", params={"q": "x"}).json() == {"name": "x", "ra": 1.0, "dec": 2.0}


def test_resolve_not_found(monkeypatch):
    def fail(q):
        raise ValueError("Could not find")

    monkeypatch.setattr(main, "resolve", fail)
    response = client.get("/resolve", params={"q": "x"})
    assert response.status_code == 404
    assert response.json() == {"error": "Could not find"}


def test_missing_parameter():
    response = client.get("/resolve")
    assert response.status_code == 422
    assert "error" in response.json()


def test_unknown_route_uses_error_shape():
    response = client.get("/nope")
    assert response.status_code == 404
    assert "error" in response.json()


def test_presets(monkeypatch):
    monkeypatch.setattr(main, "list_presets", lambda: [{"slug": "wise-0855"}])
    assert client.get("/presets").json() == {"presets": [{"slug": "wise-0855"}]}


def test_stars_from_cache(monkeypatch):
    monkeypatch.setattr(main.cache, "load", lambda *a: {"stars": [{"id": "1"}]})
    assert client.get("/stars", params={"ra": 1, "dec": 2}).json() == {"stars": [{"id": "1"}]}


def test_stars_upstream_failure(monkeypatch):
    monkeypatch.setattr(main.cache, "load", lambda *a: None)

    def boom(*args):
        raise RuntimeError("down")

    monkeypatch.setattr(main, "get_stars", boom)
    response = client.get("/stars", params={"ra": 1, "dec": 2})
    assert response.status_code == 502
    assert "error" in response.json()


def test_frames_size_out_of_range():
    response = client.get("/frames", params={"ra": 10, "dec": 10, "size": 5})
    assert response.status_code == 400
    assert "error" in response.json()


def test_frames_no_coverage(monkeypatch):
    def none(*args, **kwargs):
        raise NoCoverage("no images")

    monkeypatch.setattr(main, "build_frames", none)
    assert client.get("/frames", params={"ra": 11, "dec": 11}).status_code == 404


def test_frames_upstream_error(monkeypatch):
    def down(*args, **kwargs):
        raise UpstreamError("irsa down")

    monkeypatch.setattr(main, "build_frames", down)
    assert client.get("/frames", params={"ra": 13, "dec": 13}).status_code == 502


def test_frames_busy(monkeypatch):
    slots = threading.BoundedSemaphore(1)
    slots.acquire()
    monkeypatch.setattr(main, "live_build_slots", slots)
    response = client.get("/frames", params={"ra": 12, "dec": 12})
    assert response.status_code == 503
    assert "busy" in response.json()["error"].lower()


def test_overlay(monkeypatch):
    grid = {
        "width": 100,
        "height": 100,
        "wcs": {
            "ctype": ["RA---TAN", "DEC--TAN"],
            "crval": [10.0, 0.0],
            "crpix": [50.5, 50.5],
            "cdelt": [-6 / 3600, 6 / 3600],
        },
    }
    monkeypatch.setattr(main, "_get_frames", lambda *a: {"grid": grid, "frames": [{"t_mjd": 57388.0}]})
    monkeypatch.setattr(
        main, "_get_stars",
        lambda *a: [{"id": "a", "ra": 10.0, "dec": 0.0, "pmra": 0.0, "pmdec": 0.0, "mag": 9.0}],
    )
    body = client.get("/overlay", params={"ra": 10, "dec": 0}).json()
    assert body["n_frames"] == 1
    assert len(body["stars"]) == 1
