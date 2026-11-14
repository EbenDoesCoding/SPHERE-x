# Local API repair

The repaired API runs at **http://127.0.0.1:8010**. Start it with **Start Repaired API.cmd**, then open the dashboard. In API Lab, the API base URL should be `http://127.0.0.1:8010`.

The hosted `https://sphere-x.onrender.com` service was not deployed or modified. No GitHub repository was changed or pushed. The original Desktop `backend/` is preserved; the repair is in `backend-fixed/`.

## What changed

- Image discovery tries IRSA's documented TAP endpoint, then SIA2 across DR1/QR3 wide/deep collections.
- Successful discovery results are cached for 24 hours. During outages, an older index can be reused with a warning.
- If both searches fail and no cached search exists, the API checks verified downloaded FITS files against the requested sky position. It returns only covering observations, with an explicit incomplete-local-subset warning. It never substitutes another target.
- Downloads try IRSA cutouts, then the official NASA public S3 mirror. Full exposures downloaded from S3 are cropped locally using their sky coordinate metadata; spectral wavelength is measured before cropping.
- Download retries and timeouts are bounded, FITS files are checked before entering the cache, and writes are atomic. At most two files download concurrently; each is limited to 128 MB.
- Up to 24 time-spaced candidate exposures are processed per build. Responses disclose sampling and any failed downloads.
- Responses report `meta.catalog_sources`, `meta.download_sources`, per-frame source URLs, and warnings. A cached result is not described as a fresh archive search.
- Input validation now runs before frame-cache lookup. Frame JSON writes are atomic.
- Gaia is imported only when needed, so its network status lookup does not delay image API startup.

## Tested

- 8 new tests passed: TAP-to-SIA fallback, catalogue caching, empty coverage, actual FITS footprint matching, URL mapping, cutout-to-S3 fallback, VO error handling, and crop/wavelength preservation using the real full exposure.
- All original backend offline tests passed, including reprojection, motion preservation, stacking and retries.
- Real HTTP smoke test: M101 `/frames` returned **200 with 3 observations** through the verified local FITS fallback in approximately 5.8 seconds. All three image URLs returned valid PNG files.
- Repeat request returned the same 3 observations in **50 ms** from the frame cache.
- Invalid RA returned **400**.
- Full results: `backend-fixed/api-repair-validation.json`.

## Try it

With this API selected, use these Observatory controls:

- RA: `210.80227`
- Dec: `54.34895`
- Field: `0.30°`
- Detector: `2`
- Selection: **All wavelengths**

This returns the three genuine M101 observations already downloaded from IRSA/NASA S3. Their wavelengths differ, so this is a connectivity/display test, not evidence of astronomical variability.

For arbitrary new sky positions, at least one discovery service must be available. If TAP and SIA are both down and there is no covering cached data, the API gives a clear 502 error. The S3 mirror stores images but does not replace the sky-position catalogue. The repair cannot restore NASA's unavailable services.

## Configuration

Optional environment variables: `SPHEREX_ARCHIVE_CACHE`, `SPHEREX_COLLECTIONS`, `SPHEREX_SEARCH_TIMEOUT` (18 seconds read timeout), `SPHEREX_DOWNLOAD_TIMEOUT` (35 seconds read timeout). Defaults require no credentials. The first startup uses uv to install dependencies if needed.

Sources: [IRSA data-access documentation](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/), [official cloud mirror documentation](https://irsa.ipac.caltech.edu/cloud_access/).
