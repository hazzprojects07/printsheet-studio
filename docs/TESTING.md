# Testing

## Automated (`npm test`)

| Suite | Covers |
|---|---|
| `units.test.ts` | unit conversions, 4.5 in = 324 pt |
| `packing.test.ts` | default A3 capacity (3×2=6), 90 cards → 24/24/24/18, rotation choice, exact-fit floating point, errors, group vs mixed, MaxRects, **300 random jobs** (no overlap, margins, gaps, no lost cards) |
| `geometry.test.ts` | matrix maths, page /Rotate mapping, no-distortion fit, crop corners for all rotations, cutting marks |
| `export.test.ts` | 70 cards → 12 sheets, exact page sizes, one embed per source page, rotated/cropbox sources, invalid layout refused |

## Sample PDFs (`npm run samples`)

Creates `samples/`: 20/15/10/5-page card PDFs, a multi-card A3 page, different page sizes, transparency, raster image, `/Rotate` pages, offset CropBox.
Each card has a **black triangle in its top-left corner** so wrong orientation is obvious.

## Rendering checks performed during development

Output PDFs were rendered with poppler (`pdftoppm`) and pixels sampled:
- quadrant colours correct for all four page rotations, with upright and 90°-rotated placement (16/16 each)
- orientation marker top-left when upright, bottom-left when rotated
- 6 crops from one multi-card page each show their own design
- artwork outside the CropBox is not visible
- cutting mark visible at the card edge in the gap, gap otherwise empty

## Manual acceptance checklist

1. `npm install && npm run samples && npm run dev`.
2. Upload `cards-20.pdf`, `cards-15.pdf`, `cards-10.pdf`, `cards-5.pdf` together → 4 files, 20/15/10/5 pages. Import all pages from each: 50 cards.
3. Upload `multi-card-A3.pdf` → Crop… → grid 3 columns × 2 rows → Add 6 cards.
4. Upload `mixed-sizes.pdf` → warning about different sizes; each page shows its own size.
5. Defaults (A3, 114.3 mm, 3 mm gaps, 10 mm margins) → live check says 3 × 2 = 6 per sheet.
6. Set every quantity to 2 → AUTOMATICALLY ARRANGE → sheets and totals match (cards placed = requested).
7. Switch to Group by design / A2 / inches / feet / custom size – layout updates.
8. Set card width to 9999 mm → clear error, download disabled.
9. Download, then `npm run verify-pdf -- <file>` → every page equals the sheet size.
10. Open in Acrobat/Preview: vector text stays sharp when zoomed; print at 100% and measure a card with a ruler (114.3 mm).
11. Remove a file → its cards disappear; thumbnails memory released.

## Not verified automatically
The browser UI (React/Next, PDF.js thumbnails, crop dragging) needs a real `npm install` + browser; it was type-checked with stubs only. Please run the checklist above on your machine and report anything that misbehaves.
