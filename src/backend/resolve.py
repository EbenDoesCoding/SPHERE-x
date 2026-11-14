#!/usr/bin/env python3

from astropy.coordinates import SkyCoord
from astropy.coordinates.name_resolve import NameResolveError


def resolve(query: str) -> dict:
    """Accepts a name ('Betelgeuse') or 'RA Dec' in degrees ('88.79 7.40').
    Returns {'ra': deg, 'dec': deg, 'source': str}."""
    query = query.strip()
    parts = query.replace(",", " ").split()

    # Case 1: two numbers -> treat as RA/Dec in degrees
    if len(parts) == 2:
        try:
            ra, dec = float(parts[0]), float(parts[1])
            if not (0 <= ra < 360 and -90 <= dec <= 90):
                raise ValueError("RA must be 0-360, Dec -90 to 90")
            return {"ra": ra, "dec": dec, "source": "user input"}
        except ValueError as e:
            if "RA must" in str(e):
                raise

    # Case 2: object name -> CDS Sesame (includes SIMBAD)
    try:
        c = SkyCoord.from_name(query)
    except NameResolveError:
        raise ValueError(f"Could not find '{query}'. Check the spelling or enter RA/Dec.")
    return {"ra": float(c.ra.deg), "dec": float(c.dec.deg), "source": "SIMBAD/Sesame"}


if __name__ == "__main__":
    for q in ["Betelgeuse", "Barnard's Star", "88.79 7.40"]:
        print(q, "->", resolve(q))
