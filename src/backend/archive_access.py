"""Resilient access to the official IRSA SPHEREx services; no synthetic data.

Documentation: https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/
"""
from __future__ import annotations
import hashlib
import io
import json
import logging
import math
import os
from pathlib import Path
import re
import tempfile
import threading
import time
from urllib.parse import urlsplit, urlunsplit, urlencode, parse_qs
import xml.etree.ElementTree as ET

import numpy as np
import requests
from astropy.io import fits
from astropy.io.votable import parse_single_table
from astropy.coordinates import SkyCoord
from astropy.wcs import WCS
import astropy.units as u

log = logging.getLogger(__name__)
CACHE = Path(os.environ.get('SPHEREX_ARCHIVE_CACHE', Path(__file__).parent / 'archive_cache'))
COLLECTIONS = tuple(os.environ.get('SPHEREX_COLLECTIONS', 'spherex_dr1,spherex_qr3,spherex_dr1_deep,spherex_qr3_deep').split(','))
SEARCH_TIMEOUT = float(os.environ.get('SPHEREX_SEARCH_TIMEOUT', '18'))
DOWNLOAD_TIMEOUT = float(os.environ.get('SPHEREX_DOWNLOAD_TIMEOUT', '35'))
MAX_BYTES = 128 * 1024 * 1024
CATALOG_TTL = 86400
DOWNLOAD_SLOTS = threading.BoundedSemaphore(2)

class ArchiveUnavailable(OSError):
    pass

def official_path(url):
    """Only map documented IRSA spectral-image URLs to the public mirror."""
    parts = urlsplit(url)
    if parts.scheme != 'https' or parts.hostname != 'irsa.ipac.caltech.edu':
        raise ValueError('Expected an HTTPS IRSA image URL')
    if not re.fullmatch(r'/ibe/data/spherex/(dr1|qr3|qr2)/level2/[A-Za-z0-9_./-]+\.fits', parts.path):
        raise ValueError('Not a SPHEREx spectral-image path')
    if '..' in parts.path.split('/'):
        raise ValueError('Invalid image path')
    return parts.path.removeprefix('/ibe/data/spherex/')

def cloud_url(url):
    return 'https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/' + official_path(url)

def cutout_url(url, ra, dec, size):
    official_path(url)
    p = urlsplit(url)
    return urlunsplit((p.scheme, p.netloc, p.path, urlencode({'center': f'{ra:.8f},{dec:.8f}d', 'size': f'{size:.8f}'}), ''))

def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(value, f)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)

def read_json(path, default=None):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return default

def parse_table(content):
    # A service can return HTTP 200 with a VO error or a truncated result.
    root = ET.fromstring(content)
    for info in root.iter():
        if info.tag.rsplit('}', 1)[-1] == 'INFO' and info.attrib.get('name') == 'QUERY_STATUS':
            if info.attrib.get('value') in ('ERROR', 'OVERFLOW'):
                raise ArchiveUnavailable(info.text or 'Incomplete archive response')
    return parse_single_table(io.BytesIO(content)).to_table()

def _string(value):
    if np.ma.is_masked(value):
        return ''
    return value.decode() if isinstance(value, bytes) else str(value)

def normalize_rows(table, kind, ra, dec, size, detector=None):
    result = {}
    url_col, time_col = ('uri', 'time_bounds_lower') if kind == 'tap' else ('access_url', 't_min')
    if not {url_col, time_col}.issubset(table.colnames):
        raise ArchiveUnavailable('Archive returned an unexpected image table')
    for row in table:
        try:
            url = _string(row[url_col])
            if url.startswith('ibe/'):
                url = 'https://irsa.ipac.caltech.edu/' + url
            path = official_path(url)
            mjd = float(row[time_col])
            if not math.isfinite(mjd):
                continue
            match = re.search(r'D([1-6])(?:_|\.)', path)
            if not match:
                match = re.search(r'/([1-6])/', path)
            det = int(match.group(1)) if match else None
            if detector is not None and det != detector:
                continue
            result[path] = {'uri': cutout_url(url, ra, dec, size), 'mjd': mjd, 'detector': det,
                            'release': path.split('/')[0], 'file_id': path.rsplit('/', 1)[-1]}
        except (ValueError, TypeError):
            continue
    return sorted(result.values(), key=lambda r: r['mjd'])

def query_tap(ra, dec, size, detector=None):
    det = f"AND p.energy_bandpassname = 'SPHEREx-D{detector}'" if detector else ''
    query = f"""SELECT a.uri, p.time_bounds_lower
        FROM spherex.artifact a JOIN spherex.plane p ON a.planeid=p.planeid
        WHERE 1=CONTAINS(POINT('ICRS',{ra:.8f},{dec:.8f}),p.poly) {det}
        ORDER BY p.time_bounds_lower"""
    r = requests.get('https://irsa.ipac.caltech.edu/TAP/sync', params={
        'REQUEST': 'doQuery', 'LANG': 'ADQL', 'FORMAT': 'votable', 'QUERY': query},
        timeout=(8, SEARCH_TIMEOUT))
    r.raise_for_status()
    return normalize_rows(parse_table(r.content), 'tap', ra, dec, size, detector)

def query_sia(ra, dec, size, detector=None):
    r = requests.get('https://irsa.ipac.caltech.edu/SIA', params={
        'POS': f'CIRCLE {ra:.8f} {dec:.8f} 0.0000001', 'COLLECTION': list(COLLECTIONS)},
        timeout=(8, SEARCH_TIMEOUT))
    r.raise_for_status()
    return normalize_rows(parse_table(r.content), 'sia', ra, dec, size, detector)

def _local_rows(ra, dec, size, detector):
    """Use only downloaded files whose actual FITS sky footprint covers the target."""
    index = read_json(CACHE / 'local-index.json', [])
    rows = []
    coord = SkyCoord(ra*u.deg, dec*u.deg)
    for item in index:
        if detector is not None and item['detector'] != detector:
            continue
        path = (CACHE / item['local_file']).resolve()
        if not path.is_relative_to(CACHE.resolve()) or not path.is_file():
            continue
        try:
            with fits.open(path, memmap=True) as h:
                header = h['IMAGE'].header
                wcs = WCS(header)
                x, y = wcs.world_to_pixel(coord)
                if not (np.isfinite(x) and np.isfinite(y) and 0 <= x < header['NAXIS1'] and 0 <= y < header['NAXIS2']):
                    continue
            # Partial cutouts cannot stand in for larger/new fields: only reuse their original footprint request.
            if item.get('cutout') and (abs(ra-item['ra']) > 1e-7 or abs(dec-item['dec']) > 1e-7 or size > item['size_deg']+1e-8):
                continue
            row = {k: item[k] for k in ['mjd','detector','release','file_id']}
            row.update(uri=cutout_url(item['source_url'],ra,dec,size), local_file=str(path))
            rows.append(row)
        except Exception as exc:
            log.warning('Skipping invalid local FITS %s: %s', path.name, exc)
    return sorted(rows, key=lambda r: r['mjd'])

def discover(ra, dec, size, detector=None):
    CACHE.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(json.dumps([ra,dec,size,detector,COLLECTIONS]).encode()).hexdigest()
    path = CACHE / 'catalogs' / (key+'.json')
    cached = read_json(path)
    if cached and time.time()-cached['created'] < CATALOG_TTL:
        return cached['rows'], 'cached-catalog', []
    errors = []
    for name, query in [('irsa-tap',query_tap),('irsa-sia',query_sia)]:
        try:
            rows = query(ra,dec,size,detector)
            # An empty successful result is authoritative; do not substitute unrelated data.
            atomic_json(path, {'created':time.time(),'rows':rows,'source':name})
            return rows, name, []
        except Exception as exc:
            log.warning('%s discovery failed: %s', name, exc)
            errors.append(f'{name}: {type(exc).__name__}')
    if cached and cached['rows']:
        return cached['rows'], 'stale-catalog', ['IRSA discovery is unavailable. Using an older cached image index; newer exposures may be missing.']
    local = _local_rows(ra,dec,size,detector)
    if local:
        return local, 'local-fits-index', ['IRSA discovery is unavailable. Using verified downloaded observations that cover this position; this is an incomplete local subset.']
    raise ArchiveUnavailable('IRSA TAP and SIA are unavailable and no verified local images cover this position. Try again later. ('+'; '.join(errors)+')')

def _validate_fits(path):
    with fits.open(path, memmap=True) as h:
        h.verify('exception')
        if h['IMAGE'].header['NAXIS'] != 2 or 'WCS-WAVE' not in h:
            raise ValueError('Missing SPHEREx image or wavelength data')

def _download(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=path.parent, suffix='.part')
    os.close(fd)
    try:
        with DOWNLOAD_SLOTS, requests.get(url,stream=True,timeout=(8,DOWNLOAD_TIMEOUT)) as r:
            r.raise_for_status()
            if int(r.headers.get('Content-Length',0)) > MAX_BYTES:
                raise ValueError('Image exceeds the 128 MB download limit')
            size = 0
            with open(temp,'wb') as f:
                for chunk in r.iter_content(1024*1024):
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise ValueError('Image exceeds the 128 MB download limit')
                    f.write(chunk)
        _validate_fits(temp)
        os.replace(temp,path)
    finally:
        Path(temp).unlink(missing_ok=True)

def obtain(ref):
    """Return a local FITS path, provenance and whether to crop a full exposure."""
    local = getattr(ref,'local_file',None)
    if local:
        path = Path(local).resolve()
        if not path.is_relative_to(CACHE.resolve()):
            raise ValueError('Local FITS must be in the archive cache')
        _validate_fits(path)
        return path,'local-fits-cache',True
    # Original offline tests and local scientific scripts can still provide local FITS directly.
    if not urlsplit(ref.uri).scheme:
        return Path(ref.uri),'local-file',False
    mirror = cloud_url(ref.uri)
    cutout_key = hashlib.sha256(ref.uri.encode()).hexdigest()
    full_key = hashlib.sha256(mirror.encode()).hexdigest()
    choices = [(ref.uri,CACHE/'cutouts'/(cutout_key+'.fits'),'irsa-cutout',False),
               (mirror,CACHE/'full'/(full_key+'.fits'),'nasa-s3',True)]
    for _,path,source,crop in choices:
        if path.exists():
            try:
                _validate_fits(path)
                return path,source+'-cache',crop
            except Exception:
                path.unlink(missing_ok=True)
    errors=[]
    for url,path,source,crop in choices:
        for attempt in range(2):
            try:
                _download(url,path)
                return path,source,crop
            except Exception as exc:
                errors.append(f'{source}: {type(exc).__name__}')
                if isinstance(exc,requests.HTTPError) and exc.response.status_code in (400,401,403,404):
                    break
                if attempt==0:
                    time.sleep(.5)
    raise ArchiveUnavailable('Both IRSA cutout and NASA cloud downloads failed: '+'; '.join(errors))
