import math

import numpy as np
from astroquery.gaia import Gaia

MAX_STARS = 200


def _clean(value):
    """Convert astropy masked/NaN values to None so JSON works."""
    if np.ma.is_masked(value) or value is None or math.isnan(float(value)):
        return None
    return float(value)


def get_stars(ra: float, dec: float, size: float) -> list[dict]:
    """Gaia DR3 stars around (ra, dec). size = cutout width in arcminutes."""
    # Radius covers the square cutout corners (half-width * sqrt(2)), in degrees
    radius_deg = (size / 2) * math.sqrt(2) / 60

    query = f"""
        SELECT TOP {MAX_STARS}
            source_id, ra, dec, pmra, pmdec, phot_g_mean_mag
        FROM gaiadr3.gaia_source
        WHERE 1 = CONTAINS(
            POINT('ICRS', ra, dec),
            CIRCLE('ICRS', {ra}, {dec}, {radius_deg})
        )
        ORDER BY phot_g_mean_mag ASC
    """
    table = Gaia.launch_job(query).get_results()

    return [
        {
            "id": str(row["source_id"]),
            "ra": _clean(row["ra"]),
            "dec": _clean(row["dec"]),
            "pmra": _clean(row["pmra"]),
            "pmdec": _clean(row["pmdec"]),
            "mag": _clean(row["phot_g_mean_mag"]),
        }
        for row in table
    ]
