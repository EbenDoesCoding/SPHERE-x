# Official SPHEREx samples: M101

Three actual FITS observations were downloaded using file identifiers published in the [official IRSA cutout tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/). Two downloads succeeded through IRSA's cutout service; a third succeeded through the [official NASA public cloud mirror](https://irsa.ipac.caltech.edu/cloud_access/). Other requests were reset or returned 503, confirming intermittent access during this test.

Open http://127.0.0.1:4173/?official=1, or select **Official IRSA samples · M101** in the Observatory. The sequence works from local files, without querying the live backend.

| Observation UTC | Detector | Central wavelength | Download |
| --- | --- | --- | --- |
| 2025-05-16 13:24:03.560 | 2 | 1.5394 µm | IRSA cutout, 176 × 176 pixels |
| 2025-12-06 12:34:12.393 | 2 | 1.2091 µm | IRSA cutout, 176 × 176 pixels |
| 2026-06-19 19:01:07.407 | 2 | 1.4841 µm | NASA S3 full image, 2040 × 2040 pixels; locally cropped |

## Processing and validation

- Astropy opened and verified all three FITS files. Dates, detector and wavelength were read from the files, not inferred from filenames.
- Used the unmodified SPHERE-x backend's `_read_cutout`, wavelength grouping and `build_frames_from_cutouts` routines locally.
- Common field centred at RA 210.80227°, Dec 54.34895°, spanning 0.30° (18 arcminutes).
- Output is 176 × 176 pixels at approximately 6.141 arcseconds per pixel; oversampling is disabled.
- Common asinh brightness stretch (1st–99.5th percentiles), with per-image median subtraction. This is a visualization, not calibrated photometry.
- All three output PNGs are nonempty, have the expected dimensions, and share the same sky grid. About 83% of the output grid is covered in each frame; black corners represent missing coverage.
- The wavelengths differ. Brightness differences are not evidence of movement or intrinsic variability. No RGB composite was made from these unequal-date images.
- Full URLs and SHA-256 hashes are in `public/assets/official/frames.json` and the downloaded files are in `official-source/` on the Desktop.
- `public/assets/official/comparison.jpg` presents the three frames with the same display stretch.

The richer appearance comes from viewing a larger, structured target. This does not increase the telescope's angular resolution.

Frontend syntax checks and all six tests pass after this addition. No remote repository was changed or pushed.
