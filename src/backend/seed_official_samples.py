"""Download or register the documented real M101 observations after SHA-256 verification."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from urllib.parse import urlsplit

from astropy.io import fits
import archive_access as archive


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, help='Use existing original FITS files instead of downloading')
    args = parser.parse_args()
    metadata = Path(__file__).resolve().parent.parent / 'observatory/public/assets/official/frames.json'
    downloads = json.loads(metadata.read_text(encoding='utf-8'))['provenance']['downloads']
    seed = archive.CACHE / 'seed'
    seed.mkdir(parents=True, exist_ok=True)
    rows = []
    for item in downloads:
        name = item['file']
        if Path(name).name != name:
            raise ValueError('Invalid sample filename')
        dest = seed / name
        temp = seed / (name + '.pending')
        try:
            if args.source_dir:
                shutil.copyfile(args.source_dir / name, temp)
            else:
                host = urlsplit(item['url']).hostname
                if host not in ('irsa.ipac.caltech.edu', 'nasa-irsa-spherex.s3.us-east-1.amazonaws.com'):
                    raise ValueError('Unexpected sample host')
                archive._download(item['url'], temp)
            if hashlib.sha256(temp.read_bytes()).hexdigest() != item['sha256']:
                raise ValueError(f'Checksum mismatch: {name}; file was not registered')
            archive._validate_fits(temp)
            temp.replace(dest)
        finally:
            temp.unlink(missing_ok=True)
        url = item['url']
        if 's3.us-east-1.amazonaws.com/' in url:
            url = 'https://irsa.ipac.caltech.edu/ibe/data/spherex/' + url.split('.com/')[1]
        archive.official_path(url)
        with fits.open(dest) as hdus:
            header = hdus['IMAGE'].header
            rows.append(dict(local_file=dest.relative_to(archive.CACHE).as_posix(),
                source_url=url.split('?')[0], mjd=float(header['MJD-OBS']),
                detector=int(header['DETECTOR']), release=url.split('/spherex/')[1].split('/')[0],
                file_id=url.split('?')[0].rsplit('/', 1)[-1], cutout='-full' not in name,
                ra=210.80227, dec=54.34895, size_deg=.3, sha256=item['sha256']))
        print(f'Verified {name}')
    archive.atomic_json(archive.CACHE / 'local-index.json', rows)
    print(f'Registered {len(rows)} real observations.')


if __name__ == '__main__':
    main()
