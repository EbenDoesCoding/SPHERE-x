# SPHEREx Observatory

Standalone dashboard for the existing FastAPI backend. Requires Node.js 20+ and Python dependencies installed with uv.

From `src/backend`, run `uv run --no-dev uvicorn main:app --host 127.0.0.1 --port 8010`.
In a second terminal, from `src/observatory`, run `npm start`, then open http://127.0.0.1:4173.
Windows users can use the two launcher files in this directory.

API Lab defaults to http://127.0.0.1:8010; change it to another deployed backend as needed. The setting is saved in your browser. The frontend server binds to localhost.

The dashboard includes name/coordinate lookup, detector and wavelength selection, image playback and comparison, Gaia overlays, downloads, source metadata, and a test panel for all six API endpoints.

## Offline images and optional backend cache

The Official IRSA samples button (or `?official=1`) shows three bundled PNGs of M101 with original source URLs and checksums. These are real observations at different wavelengths, unsuitable for claiming motion or variability. Original repository samples are separately labelled.

Raw FITS files and runtime caches are not committed. To populate the backend's verified M101 fallback, run `uv run python seed_official_samples.py` from `src/backend` (about 73 MB, requires working download services). You can also pass `--source-dir PATH` containing the three previously downloaded FITS files. Checksums are verified before registration.

IRSA failures remain possible. A cached subset is explicitly labelled and cannot provide arbitrary new sky fields. The existing scientific rendering and wavelength grouping are retained; native telescope resolution is unchanged.

## Tests

Frontend: `npm run check` and `npm test`.
Backend: `uv run python -m unittest test_archive_access -v` and `uv run python test-spherex-offline.py`.
Three archive integration tests need the optional FITS seed and explicitly skip when it is absent; five archive unit tests work without it.

See [sample provenance](OFFICIAL-SAMPLES.md) and [backend repair notes](../../docs/api-repair.md).
