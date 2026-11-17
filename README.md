# PrintSheet Studio

Upload PDFs of card designs → pick the cards → set sheet size, margins and gaps → **AUTOMATICALLY ARRANGE** → **DOWNLOAD MANUFACTURING PDF**.

Everything runs locally in your browser. No backend, database, accounts or external APIs. Your PDFs never leave your computer.

## Quick start

Requirements: **Node.js 20 or newer** (https://nodejs.org).

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Other commands:

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` then `npm start` | Production build and server |
| `npm test` | Unit + export tests (packing, geometry, PDF output) |
| `npm run typecheck` | TypeScript check |
| `npm run samples` | Writes test PDFs into `./samples` |
| `npm run verify-pdf -- file.pdf` | Prints the physical page sizes of any PDF |

`npm install` also copies the PDF.js worker, CMaps and fonts into `public/` (so nothing is loaded from a CDN).
If you ever see "worker not found" errors, run `node scripts/copy-pdf-assets.mjs`.

## Documentation

- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) – how to use the app, step by step
- [docs/TECHNICAL_GUIDE.md](docs/TECHNICAL_GUIDE.md) – architecture, algorithms, coordinate maths
- [docs/TESTING.md](docs/TESTING.md) – automated tests and a manual acceptance checklist

## Key behaviour

- Default card 114.3 × 114.3 mm (4.5 in), gaps 3 mm, margins 10 mm, A3 sheet.
- Sheets: A4, A3, A2, A1, 4×3 ft, 4×8 ft or custom. Units: mm, cm, in, ft.
- Grid capacity: `cols = floor((availW + gap) / (cardW + gap))`, same for rows; both orientations compared.
- Mixed card sizes use a MaxRects heuristic (not claimed to be optimal nesting).
- Export embeds the **original PDF pages as vector Form XObjects**, clipped to the card – no screenshots, no re-compression.
  Each source page is embedded once, so the output stays small even for hundreds of cards.
- Artwork is never stretched: it is scaled uniformly and a warning is shown when the shape differs from the card.
- Before download the layout is validated; the generated PDF is re-opened and its page count and exact page sizes are checked.

## Known limitations (by design)

- Password-protected PDFs cannot be embedded; remove the protection first.
- Sheets larger than 200 in (14400 pt) on one side exceed what many PDF viewers/RIPs handle; a warning is shown. All presets (up to 4×8 ft = 96 in) are within the limit.
- Crops are rectangles; no manual drag-and-drop positioning (not part of v1).
- Colours are preserved as in the source (no colour conversion). Bleed/trim boxes are not interpreted: the visible CropBox/MediaBox is the artwork.
