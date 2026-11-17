# PrintSheet Studio – User Guide

## 1. Upload PDFs

1. Drag PDF files onto the upload area (or click it). You can add more files at any time.
2. Each file shows its name, size, page count, import status and page size. If pages have different sizes you get a warning.
3. **Remove** deletes a file and every card taken from it. Your original files are never changed.

## 2. Choose the cards

Every page is shown as a thumbnail with its real size in mm and a hint ("Looks like 1 card" / "May hold ~6 cards").
The hint is only a guess – you always decide.

**One card per page**
- Click **Import all N pages as cards**, or **Use page** on individual pages.

**Several cards on one page**
- Click **Crop…** on the page.
- Drag a rectangle around one card and click **Add selected area as card**, repeat for each card, **or**
- for a regular layout, draw a rectangle around the whole block (or leave it empty for the full page), type columns × rows and click **Add N cards from grid**.
- Green dashed boxes show areas already selected. Nothing is cropped automatically.

**Selected cards table**
Rename designs, set each quantity, see the original size, or remove a card.
"Set every quantity to" fills all rows at once.

## 3. Configure the sheet

| Setting | Notes |
|---|---|
| Measurement unit | mm / cm / in / ft. Applies to all fields. |
| Sheet size | A4, A3, A2, A1, 4×3 ft, 4×8 ft or Custom. **Swap** flips width/height. |
| Margins | "All margins" sets the four sides; each side can differ. Default 10 mm. |
| Gaps | Horizontal / vertical spacing between cards. Default 3 mm. |
| Card size | *One common size* (default 114.3 × 114.3 mm) or *original dimensions* of each design. |
| Lock aspect ratio | Editing width changes height (and vice versa). |
| Artwork fit | *Fit inside* (nothing cut off, may leave blank edges) or *Fill* (edges may be cropped). Artwork is never stretched. |
| Allow rotation | Lets the planner turn cards 90° when that fits more. |
| Arrangement | *Mixed designs*: designs share sheets (fewest sheets). *Group by design*: each design on its own sheet(s). |
| Cutting marks | Thin corner marks in the gaps, never on the artwork. Needs a gap of at least 1 mm. |

A blue **Live capacity check** shows the calculation (columns × rows, both orientations) immediately.

## 4. Automatically arrange

Click **AUTOMATICALLY ARRANGE**. You get:
- Summary: total designs, cards requested, cards per sheet, number of sheets, unused area.
- A preview of every sheet: use Prev/Next, zoom −/+, **Fit to screen**, and the toggles for cutting marks, names and artwork.
  Red dashed line = margins, blue outline = card boundary.
- After the first click the preview stays live – change any value and it recalculates.

Warnings appear when artwork and card shapes differ (the artwork is scaled uniformly, never distorted).
Errors (for example "card does not fit on the sheet") block the download and say what to change.

## 5. Download

Check the totals (sheets, cards placed, quantity requested, unplaced = 0) and click **DOWNLOAD MANUFACTURING PDF**.
The file is built from your original PDFs, re-opened and checked (page count and exact page size) before it is saved.
Any limitation (for example a page that could not be embedded) is listed – nothing is silently degraded.

## Tips

- Always open the PDF in Acrobat at 100% / "Actual size" and print with **scaling off** ("Actual size", not "Fit").
- To verify a file's size from the command line: `npm run verify-pdf -- yourfile.pdf`.
- If you need 100% identical designs together for cutting, use *Group by design*.
- Rotated cards (90° counter-clockwise) are chosen only when they increase the card count.

## Troubleshooting

| Problem | Fix |
|---|---|
| "password protected" | Remove the PDF password (e.g. in Acrobat) and upload again. |
| "does not fit on the sheet" | Reduce card size/margins or choose a larger sheet. |
| Thumbnails stay blank | Run `node scripts/copy-pdf-assets.mjs`, restart `npm run dev`. |
| Cutting marks missing | Increase the gap to at least 1 mm. |
| Very large sheet is slow | Use a smaller sheet preset or fewer cards per job; export runs in your browser. |
