"""Tombaugh API package. Interface: docs/CONTRACT_FIELDS.md (v1.0)."""
from astropy.utils import iers

iers.conf.auto_download = False  # never reach out for Earth-orientation tables at import or run time

__version__ = "0.2.0"
CONTRACT_VERSION = "1.0"
