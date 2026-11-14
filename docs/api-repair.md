# Image access repair

IRSA discovery tries TAP then SIA, with a 24-hour successful-query cache and an explicitly labelled stale-index or verified local-FITS fallback on outages. A successful empty search remains empty. Downloads try IRSA cutouts then NASA public S3, validate FITS before caching, and crop full exposures using their sky coordinates. Only supported official archive URLs are accepted.

Configuration: SPHEREX_ARCHIVE_CACHE, SPHEREX_COLLECTIONS, SPHEREX_SEARCH_TIMEOUT (18 seconds), SPHEREX_DOWNLOAD_TIMEOUT (35 seconds). Candidate downloads are limited to 24 per request with three processing workers and two simultaneous transfers. Source URLs, cache provenance and warnings are additive response metadata; existing routes and required fields are retained.

Frame requests validate before cache lookup; JSON writes are atomic. Gaia imports only when queried, so its status lookup does not block API startup. The original Gaia query and retries are retained.

Local validation on 14 November 2026: three real M101 frames and all PNG routes returned HTTP 200; invalid RA returned 400. IRSA TAP returned 502 and SIA reset the connection. Gaia returned 200 stars and 139 in-image overlay entries, with intermittent connection resets. These results do not establish reliability for arbitrary uncached fields.

New archive tests cover fallback ordering, empty-search handling, valid local sky coverage, URL validation, mirror caching, SIA normalization, VO errors, and full-image cropping. FITS integration tests require the optional checksum-verified seed. This branch does not deploy or change the hosted Render service.

Sources: https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/ and https://irsa.ipac.caltech.edu/cloud_access/.
