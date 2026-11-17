# PrintSheet Studio – Technical Guide

## Stack
Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 3, PDF.js 4.10 (read/preview), pdf-lib (output). All client-side.
`src/app/page.tsx` renders the client component `Workspace`. No API routes.

## Source layout

```
src/lib/
  types.ts      shared types + defaults (all lengths in mm internally)
  units.ts      mm/cm/in/ft conversion, 1 pt = 1/72 in, formatting
  presets.ts    sheet presets (A4..A1, 4x3 ft, 4x8 ft)
  packing.ts    grid capacity, uniform grid, group mode, MaxRects
  validate.ts   pre-export validation (placement, margins, gaps, overlap, quantities, distortion)
  geometry.ts   matrices, artwork fitting, placement transform + clip rect
  layout.ts     planAll(): sizes -> packing -> artwork fit -> validation -> stats
  marks.ts      cutting-mark line geometry
  pdfExport.ts  builds the manufacturing PDF with pdf-lib, re-opens and verifies it
  pdfjs.ts      PDF.js wrapper: worker setup, page inspection, queued/cancellable rendering, cache
  inspect.ts    "one card or many?" heuristic, helpers
src/components/ Workspace (state), UploadSection, CropEditor, CardsTable, ConfigSection, SheetPreview, PageThumb, ui
tests/          node:test suites run with tsx
scripts/        copy-pdf-assets, make-sample-pdfs, verify-pdf
```

Principle: **all maths lives in `src/lib` as pure functions** with no DOM or React, so it is unit-tested in Node.

## Packing

Sheet coordinates: origin top-left, y down, millimetres.

Available area = sheet − margins. For a card cell of `w × h`:

```
cols = floor((availW + gapX) / (w + gapX))
rows = floor((availH + gapY) / (h + gapY))
capacity = cols × rows
```

Both orientations are computed (rotated swaps `w`/`h`) when rotation is allowed; the larger capacity wins (ties keep normal).
A tiny epsilon (1e-6) makes exact fits safe against floating-point error.

Modes:
- **Uniform size, mixed**: one grid, designs fill cells in list order, new sheet when full.
- **Group**: grid per design; each design starts a new sheet.
- **Mixed sizes**: MaxRects, Best-Short-Side-Fit, rotation optional. Each card reserves `w+gapX` × `h+gapY` inside a bin of
  `availW+gapX` × `availH+gapY`, which guarantees gaps and margins. Cards sorted by area desc (stable), so the result is deterministic.
  This is a heuristic – it is not claimed to be optimal nesting.

A card that cannot fit an empty sheet returns a clear error; nothing is dropped silently.

## Validation (`validate.ts`)

Checks every sheet: all copies of every design placed exactly once; sizes exact; inside margins and sheet; no overlap; gaps ≥ configured; no rotation if disallowed; artwork aspect ratio unchanged. Export is disabled if anything fails. Property tests run 300 random jobs through packing + validation.

## Export (`pdfExport.ts`)

1. Load each source PDF once with pdf-lib; embed each *used page* once via `embedPage` using its visible box (CropBox ∩ MediaBox).
   Embedded pages become **Form XObjects**: vector content, fonts, images, transparency groups, colour spaces stay as-is.
2. For each placement, push: `q  <clip rect> re W n  <matrix> cm  /Form Do  Q`. The clip rect is the intersection of the crop
   area and the card cell, so neighbours never leak and artwork never exceeds its card.
3. Cutting marks: 0.25 pt black lines continuing the card edges outward into the gap, capped at half the gap.
4. Save with classic xref (no object streams) for maximum RIP compatibility.
5. Re-open the bytes, check page count and each page size within 0.01 pt.

Because each page is embedded once and referenced many times, a 500-card job is only slightly larger than the source.

### Transform maths (`geometry.ts`)
Chain, right to left:
`form space → displayed page (inverse of /Rotate mapping) → nominal card cell (scale, crop offset, centring) → sheet mm (optional 90° CCW rotation) → sheet pt (y up)`.
Rotated cards are turned 90° counter-clockwise: the artwork's top-left ends up at the card's bottom-left.
Unit tests check every combination of page rotation (0/90/180/270) × card rotation.

## PDF.js usage
- Worker, CMaps and standard fonts are served from `/public` (copied by `scripts/copy-pdf-assets.mjs`).
- Rendering goes through a limiter (2 concurrent jobs) and is cancellable; thumbnails render only when scrolled into view.
- `Promise.withResolvers` is polyfilled for older browsers.
- Removing a file calls `doc.destroy()` and clears cached previews.
- PDF.js is used for previews/inspection only. Output quality never depends on it.

## Extending
- New sheet preset: add to `presets.ts`.
- New packing strategy: implement in `packing.ts` returning `PackResult`; validation protects it automatically.
- Bleed/trim handling: extend `visibleBox()` in `pdfExport.ts` and `page.view` use in `pdfjs.ts` together (they must agree).
