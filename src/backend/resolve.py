import re

from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.coordinates.name_resolve import NameResolveError


def _is_number(text: str) -> bool:
    try:
        float(text)
        return True
    except ValueError:
        return False


def _parse_degrees(parts: list[str]) -> tuple[float, float] | None:
    """'88.79 7.40' -> (ra, dec) in degrees, or None if not two numbers."""
    if len(parts) != 2 or not all(_is_number(p) for p in parts):
        return None
    ra, dec = float(parts[0]), float(parts[1])
    if not (0 <= ra < 360 and -90 <= dec <= 90):
        raise ValueError("RA must be 0-360, Dec -90 to 90")
    return ra, dec


def _is_sexagesimal(query: str, parts: list[str]) -> bool:
    """True for '08h55m10.8s -07d14m42.5s', '08:55:10.8 -07:14:42.5' or '08 55 10.8 -07 14 42.5'."""
    if ":" in query:
        return True
    if re.search(r"\d\s*h", query, re.I) and re.search(r"\d\s*d", query, re.I):
        return True
    return len(parts) == 6 and all(_is_number(p) for p in parts)


def _parse_sexagesimal(query: str) -> tuple[float, float]:
    """Returns (ra, dec) in degrees. RA is read as hours unless written in degrees."""
    try:
        if re.search(r"\d\s*h", query, re.I):
            coord = SkyCoord(query)  # explicit h/m/s and d/m/s markers
        else:
            coord = SkyCoord(query, unit=(u.hourangle, u.deg))
    except (ValueError, u.UnitsError) as exc:
        raise ValueError(
            f"Could not read '{query}' as coordinates. Example: 08h55m10.8s -07d14m42.5s"
        ) from exc
    return float(coord.ra.deg), float(coord.dec.deg)


def resolve(query: str) -> dict:
    """Accepts a star name, 'RA Dec' in degrees, or RA/Dec in hours-minutes-seconds form.
    Returns {'ra': deg, 'dec': deg, 'source': str}."""
    query = query.strip().replace(",", " ")
    parts = query.split()

    degrees = _parse_degrees(parts)
    if degrees is not None:
        return {"ra": degrees[0], "dec": degrees[1], "source": "user input"}

    if _is_sexagesimal(query, parts):
        ra, dec = _parse_sexagesimal(query)
        return {"ra": ra, "dec": dec, "source": "user input"}

    try:
        coord = SkyCoord.from_name(query)  # CDS Sesame (includes SIMBAD)
    except NameResolveError:
        raise ValueError(f"Could not find '{query}'. Check the spelling or enter RA/Dec.")
    return {"ra": float(coord.ra.deg), "dec": float(coord.dec.deg), "source": "SIMBAD/Sesame"}


if __name__ == "__main__":
    for q in [
        "08h55m10.831s -07d14m42.53s",
        "08:55:10.831 -07:14:42.53",
        "08 55 10.831 -07 14 42.53",
        "133.79513 -7.24515",
        "Barnard's Star",
    ]:
        print(q, "->", resolve(q))
