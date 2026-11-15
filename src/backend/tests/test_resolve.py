import pytest
from astropy.coordinates import SkyCoord
from astropy.coordinates.name_resolve import NameResolveError

from resolve import resolve


def test_degrees():
    assert resolve("133.79513 -7.24515") == {"ra": 133.79513, "dec": -7.24515, "source": "user input"}


def test_degrees_with_comma():
    assert resolve("88.79, 7.40")["ra"] == 88.79


@pytest.mark.parametrize("text", [
    "08h55m10.831s -07d14m42.53s",
    "08:55:10.831 -07:14:42.53",
    "08 55 10.831 -07 14 42.53",
])
def test_sexagesimal(text):
    result = resolve(text)
    assert result["ra"] == pytest.approx(133.7951, abs=1e-3)
    assert result["dec"] == pytest.approx(-7.2451, abs=1e-3)


def test_out_of_range():
    with pytest.raises(ValueError):
        resolve("999 99")


def test_name_lookup(monkeypatch):
    monkeypatch.setattr(
        SkyCoord, "from_name", classmethod(lambda cls, name: SkyCoord(10, 20, unit="deg"))
    )
    result = resolve("Some Star")
    assert (result["ra"], result["dec"]) == (10.0, 20.0)


def test_unknown_name(monkeypatch):
    def fail(cls, name):
        raise NameResolveError("not found")

    monkeypatch.setattr(SkyCoord, "from_name", classmethod(fail))
    with pytest.raises(ValueError):
        resolve("asdfgh")
