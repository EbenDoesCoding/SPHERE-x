import pytest

from overlay import GAIA_EPOCH_MJD, build_overlay

GRID = {
    "width": 100,
    "height": 100,
    "wcs": {
        "ctype": ["RA---TAN", "DEC--TAN"],
        "crval": [10.0, 0.0],
        "crpix": [50.5, 50.5],
        "cdelt": [-6 / 3600, 6 / 3600],  # 6 arcsec per pixel, RA increases to the left
    },
}
TEN_YEARS = 3652.5


def _frames():
    return {
        "grid": GRID,
        "frames": [{"t_mjd": GAIA_EPOCH_MJD}, {"t_mjd": GAIA_EPOCH_MJD + TEN_YEARS}],
    }


def _star(star_id, ra, dec, pmra=0.0, pmdec=0.0):
    return {"id": star_id, "ra": ra, "dec": dec, "pmra": pmra, "pmdec": pmdec, "mag": 10.0}


def test_still_star_stays_put():
    result = build_overlay(_frames(), [_star("a", 10.0, 0.0)])
    first, second = result["stars"][0]["positions"]
    assert first == pytest.approx([49.5, 49.5], abs=0.1)
    assert second == pytest.approx(first, abs=0.01)


def test_moving_star_shifts_six_pixels():
    # 3600 mas/yr in RA for 10 years = 36 arcsec = 6 pixels, toward smaller x
    result = build_overlay(_frames(), [_star("m", 10.0, 0.0, pmra=3600.0)])
    first, second = result["stars"][0]["positions"]
    assert first[0] - second[0] == pytest.approx(6.0, abs=0.1)
    assert second[1] == pytest.approx(first[1], abs=0.1)


def test_missing_proper_motion_is_treated_as_zero():
    star = _star("n", 10.0, 0.0)
    star["pmra"] = None
    star["pmdec"] = None
    assert len(build_overlay(_frames(), [star])["stars"]) == 1


def test_star_outside_field_is_dropped():
    assert build_overlay(_frames(), [_star("far", 20.0, 0.0)])["stars"] == []


def test_no_stars():
    result = build_overlay(_frames(), [])
    assert result["stars"] == []
    assert result["width"] == 100
