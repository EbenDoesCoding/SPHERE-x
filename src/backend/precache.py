import cache
import time
from gaia import get_stars
from resolve import resolve

TARGETS = [
    "Betelgeuse",
    "Barnard's Star",
    "Sirius",
    "Vega",
    "Proxima Centauri",
]
SIZE = 2.0  # arcminutes; must match the frontend's default


def main():
    for name in TARGETS:
        try:
            coords = resolve(name)
            stars = get_stars(coords["ra"], coords["dec"], SIZE)
            cache.save("stars", coords["ra"], coords["dec"], SIZE, {"stars": stars}, demo=True)
            print(f"OK   {name}: {len(stars)} stars")
        except Exception as e:
            print(f"FAIL {name}: {e}")
        time.sleep(2)

if __name__ == "__main__":
    main()
