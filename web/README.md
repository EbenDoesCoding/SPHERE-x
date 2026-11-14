# Tombaugh web app

One static site built with Vite (React, TypeScript), with two pages:

- `/`, the landing page: `index.html` loads `src/landing/main.tsx`.
- `/look/`, the comparator: `look/index.html` loads `src/main.tsx`, which renders the designed
  comparator in `src/comparator/` (its own contract: `src/comparator/CONTRACT.md`).

The designs are the specification: `../docs/design/system/` (rules, tokens, components),
`../docs/design/landing/` and `../docs/design/comparator/` (layouts, states, and the hand-off boards for
behaviour, copy, images and the removable parts). Their rules outrank taste: real data only, whole-pixel
images with smoothing off, one brightness scale per sequence, hatched no-data pixels, nothing plays until the
reader starts it, nothing around the image moves, tokens and `bc-` classes only.

## Folders in `src/`

- `landing/`: the landing page.
- `comparator/`: the comparator screen, built from the designs. A removable part that is not finished
  is switched off in `comparator/features.ts`, never left half done (today all twelve are on).
- `overlays/`: search (names and coordinates, through the team backend) and the hint for objects that have
  moved away from their catalogue position. `overlays/types.ts` is the interface with the comparator.
- `player/`: the frame maths, with tests: float16 decoding, sky grid, playback, presets, rendering, screen
  mapping, band synthesis, and small React helpers (`hooks.ts`; the comparator uses
  `usePrefersReducedMotion`). The first viewer (`App.tsx`, `Player.tsx`, `Viewport.tsx`) is deleted.
- `design/`: `tokens.css`, `components.css` (the `bc-` classes, copied from the design system's bundle),
  `icons.tsx`.
- `api.ts` loads a field from the frames engine and falls back to the bundled recorded fields;
  `contract.ts` holds the types of the engine's contract (`../docs/CONTRACT_FIELDS.md`); `site.ts` holds the
  name, the comparator path and the repository address.

Also here: `functions/api/[[path]].ts` (a Cloudflare Pages Function that forwards `/api` to the engine),
`vercel.example.json` (the same for Vercel), `public/fonts/` (self-hosted fonts with their licences).

## Generated folders: never edit or commit

`src/generated/` and `public/fixtures/` are written by `scripts/sync-contract.mjs` from
`../docs/contract/presets.json` and `../cache/fixtures/`, before every `npm run dev`, `npm run build` and
`npm test`. Change the sources instead and run `npm run sync`. `dist/` is the build output.

## Commands

```bash
npm install
npm run dev      # http://localhost:5173/ and http://localhost:5173/look/
npm test         # Vitest in the node environment (no DOM)
npm run lint     # Biome; npm run format applies its fixes
npm run build    # tsc --noEmit, then vite build into dist/
```

## Environment variables

Copy `.env.example` to `.env.local`.

- `VITE_TEAM_API_URL`: the team backend (`../src/backend`), for `/resolve` and `/stars`. In development
  `http://localhost:8000`.
- `VITE_ENGINE_URL`: the frames engine (`../api`). Empty: the same origin, with `/api` proxied.
- `TOMBAUGH_API_URL`: read by the development server only, not by the page: where it sends `/api`. Default
  `http://localhost:8080`; set it when the engine runs on another port.

Values that start with `VITE_` are compiled into the page, so nothing secret goes in them. The page makes no
request to any other origin: no CDN, no web fonts from elsewhere.
