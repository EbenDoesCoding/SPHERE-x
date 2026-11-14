# Test targets

The five challenge test targets. All must work, and all are preset buttons (precomputed, instant). Default field of view: 0.05° (3′).

## Coordinates

| Slug | Target | RA (deg) | Dec (deg) | Source | Status |
|---|---|---|---|---|---|
| `barnards-star` | Barnard's Star | 269.45208 | 4.69336 | Resolved by Sesame/SIMBAD (precompute run) | Verify |
| `epsilon-indi-b` | Epsilon Indi B | 331.04415 | -56.78284 | Resolved by Sesame as `eps Ind B` (precompute run) | Verify |
| `wise-0855` | WISE 0855 | 133.79513 | -7.24515 | Challenge brief: 08h55m10.831s, -07d14m42.53s | From brief |
| `rw-aurigae` | RW Aurigae | _fill_ | _fill_ | Sesame as `RW Aur` | Not recorded yet |
| `r-draconis` | R Draconis | _fill_ | _fill_ | Sesame as `R Dra` | Not recorded yet |

Fill the two blanks (and confirm the others) from `demo_cache/frames/index.json` after the precompute succeeds, or with:

```bash
cd src/backend
uv run python -c "from resolve import resolve; print(resolve('RW Aur')); print(resolve('R Dra'))"
```

Coordinates of moving targets are for the position the catalog gives. Fast movers drift over the SPHEREx baseline; check that the target stays near the image centre in every frame.

## What each target tests

| Target | Type | What the demo should show |
|---|---|---|
| Barnard's Star | High proper-motion star | Visible motion; Gaia overlay track matches the observed star |
| Epsilon Indi B | Brown-dwarf pair around a star | One blended source. The pair is closer than a SPHEREx pixel, so it cannot be resolved (unverified); say so in the UI |
| WISE 0855 | Fast-moving brown dwarf | The centrepiece: a dot moving along its predicted track. Not in Gaia, so the track needs WISE/SIMBAD proper motion |
| RW Aurigae | Variable star | Brightness change over time (light curve), not motion |
| R Draconis | Variable star | Brightness change over time (light curve), not motion |

## Proper motions

Approximate values from `CLAUDE.md` (general knowledge). **Unverified**: replace with values fetched from Gaia or SIMBAD before showing them anywhere.

| Target | Approx. proper motion | Verified? |
|---|---|---|
| Barnard's Star | about 10.4″/yr | no |
| WISE 0855 | about 8″/yr | no |
| Epsilon Indi A | about 4.7″/yr | no |

SPHEREx pixels are about 6.2″ (unverified; each `/frames` response reports the pixel scale measured from the files). That is roughly one pixel of motion per year, so motion is subtle without a difference image or marker.

## Data source per target

| Target | Gaia DR3 | WISE catalogs | Notes |
|---|---|---|---|
| Barnard's Star | yes | yes | |
| Epsilon Indi B | yes (primary) | yes | pair unresolved |
| WISE 0855 | no (too faint) | yes | use WISE/CatWISE proper motion |
| RW Aurigae | yes | yes | variable |
| R Draconis | yes | yes | variable |

Gaia and WISE coverage columns come from `CLAUDE.md` and general knowledge: unverified.

## Checklist per target

- [ ] Coordinates recorded above
- [ ] Preset exists in `/presets`
- [ ] At least 2 epochs, target near the image centre in all frames
- [ ] Gaia overlay loads (`/overlay`)
- [ ] Proper motion value verified against Gaia or SIMBAD
- [ ] Works on the live Render URL, instant response
