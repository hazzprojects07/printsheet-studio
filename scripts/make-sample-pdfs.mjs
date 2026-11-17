// Generates sample PDFs for testing PrintSheet Studio:  npm run samples   (writes ./samples/*.pdf)
//
// Every card has a small black triangle in its TOP-LEFT corner, so any rotation/orientation mistake in the
// output is immediately visible.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.env.SAMPLES_DIR || join(root, 'samples');
mkdirSync(outDir, { recursive: true });

const MM = 72 / 25.4;
const CARD = 4.5 * 72; // 324 pt = 114.3 mm
const PALETTE = [
  [0.89, 0.26, 0.2], [0.2, 0.55, 0.9], [0.18, 0.7, 0.4], [0.95, 0.7, 0.12], [0.55, 0.3, 0.8],
  [0.1, 0.65, 0.7], [0.9, 0.4, 0.65], [0.35, 0.35, 0.4],
];

function drawCard(page, font, x, y, w, h, label, colorIdx) {
  const [r, g, b] = PALETTE[colorIdx % PALETTE.length];
  page.drawRectangle({ x, y, width: w, height: h, color: rgb(r, g, b) });
  page.drawRectangle({ x: x + w * 0.08, y: y + h * 0.08, width: w * 0.84, height: h * 0.84, borderColor: rgb(1, 1, 1), borderWidth: 3 });
  page.drawCircle({ x: x + w / 2, y: y + h / 2, size: Math.min(w, h) * 0.28, color: rgb(1, 1, 1), opacity: 0.9 });
  const size = Math.min(w, h) * 0.28;
  const tw = font.widthOfTextAtSize(label, size);
  page.drawText(label, { x: x + (w - tw) / 2, y: y + h / 2 - size * 0.35, size, font, color: rgb(r * 0.5, g * 0.5, b * 0.5) });
  // orientation marker: black triangle top-left
  page.drawSvgPath(`M 0 0 L ${w * 0.18} 0 L 0 ${w * 0.18} Z`, { x, y: y + h, color: rgb(0, 0, 0) });
}

async function save(name, doc) {
  const bytes = await doc.save();
  writeFileSync(join(outDir, name), bytes);
  console.log(`  ${name}  (${doc.getPageCount()} pages, ${(bytes.length / 1024).toFixed(1)} KB)`);
}

async function cardsPdf(name, pages, seed) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([CARD, CARD]);
    drawCard(page, font, 0, 0, CARD, CARD, String(i + 1), i + seed);
  }
  await save(name, doc);
}

// --- tiny PNG encoder (gradient image) so we can test raster quality preservation
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function gradientPng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = Math.round((x / (w - 1)) * 255);
      raw[o + 1] = Math.round((y / (h - 1)) * 255);
      raw[o + 2] = (x + y) % 32 < 16 ? 40 : 220; // fine diagonal stripes expose resampling
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

console.log(`Writing samples to ${outDir}`);

await cardsPdf('cards-20.pdf', 20, 0);
await cardsPdf('cards-15.pdf', 15, 1);
await cardsPdf('cards-10.pdf', 10, 2);
await cardsPdf('cards-5.pdf', 5, 3);

// multiple cards on one A3 page (3 x 2 grid of 4.5in cards)
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const pw = 420 * MM, ph = 297 * MM;
  const page = doc.addPage([pw, ph]);
  const gap = 12 * MM;
  const gridW = 3 * CARD + 2 * gap, gridH = 2 * CARD + gap;
  const ox = (pw - gridW) / 2, oy = (ph - gridH) / 2;
  let n = 0;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    drawCard(page, font, ox + c * (CARD + gap), oy + (1 - r) * (CARD + gap), CARD, CARD, String.fromCharCode(65 + n), n);
    n++;
  }
  await save('multi-card-A3.pdf', doc);
}

// pages with different dimensions
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const sizes = [[4 * 72, 6 * 72], [5 * 72, 5 * 72], [148 * MM, 210 * MM], [100 * MM, 100 * MM], [6 * 72, 4 * 72]];
  sizes.forEach(([w, h], i) => drawCard(doc.addPage([w, h]), font, 0, 0, w, h, String(i + 1), i));
  await save('mixed-sizes.pdf', doc);
}

// transparency
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < 3; i++) {
    const page = doc.addPage([CARD, CARD]);
    page.drawCircle({ x: CARD * 0.38, y: CARD * 0.55, size: CARD * 0.28, color: rgb(0.9, 0.1, 0.2), opacity: 0.55 });
    page.drawCircle({ x: CARD * 0.6, y: CARD * 0.55, size: CARD * 0.28, color: rgb(0.1, 0.3, 0.9), opacity: 0.55 });
    page.drawCircle({ x: CARD * 0.5, y: CARD * 0.38, size: CARD * 0.28, color: rgb(0.1, 0.8, 0.3), opacity: 0.55 });
    page.drawText(`T${i + 1}`, { x: 20, y: CARD - 50, size: 36, font, color: rgb(0, 0, 0), opacity: 0.6 });
    page.drawSvgPath(`M 0 0 L ${CARD * 0.18} 0 L 0 ${CARD * 0.18} Z`, { x: 0, y: CARD, color: rgb(0, 0, 0) });
  }
  await save('transparent.pdf', doc);
}

// raster image artwork
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const img = await doc.embedPng(gradientPng(512, 512));
  const page = doc.addPage([CARD, CARD]);
  page.drawImage(img, { x: 0, y: 0, width: CARD, height: CARD });
  page.drawText('RASTER', { x: 60, y: CARD / 2, size: 48, font, color: rgb(1, 1, 1) });
  page.drawSvgPath(`M 0 0 L ${CARD * 0.18} 0 L 0 ${CARD * 0.18} Z`, { x: 0, y: CARD, color: rgb(0, 0, 0) });
  await save('raster-image.pdf', doc);
}

// rotated pages (/Rotate) with four coloured quadrants as DISPLAYED:  TL red, TR green, BL blue, BR yellow
{
  const doc = await PDFDocument.create();
  const W = 300, H = 200; // unrotated page size
  const colors = { tl: rgb(0.9, 0.1, 0.1), tr: rgb(0.1, 0.7, 0.2), bl: rgb(0.1, 0.2, 0.9), br: rgb(0.95, 0.8, 0.1) };
  for (const rot of [0, 90, 180, 270]) {
    const page = doc.addPage([W, H]);
    page.setRotation(degrees(rot));
    // displayed -> unrotated quadrant rectangles (y up). Derived by rotating the page clockwise by `rot`.
    const q = (name) => {
      const hw = W / 2, hh = H / 2;
      const rects = {
        0: { tl: [0, hh], tr: [hw, hh], bl: [0, 0], br: [hw, 0], w: hw, h: hh },
        90: { tl: [0, 0], tr: [0, hh], bl: [hw, 0], br: [hw, hh], w: hw, h: hh },
        180: { tl: [hw, 0], tr: [0, 0], bl: [hw, hh], br: [0, hh], w: hw, h: hh },
        270: { tl: [hw, hh], tr: [hw, 0], bl: [0, hh], br: [0, 0], w: hw, h: hh },
      }[rot];
      return { x: rects[name][0], y: rects[name][1], width: rects.w, height: rects.h };
    };
    for (const name of ['tl', 'tr', 'bl', 'br']) page.drawRectangle({ ...q(name), color: colors[name] });
  }
  await save('rotated-pages.pdf', doc);
}

// non-zero MediaBox origin + smaller CropBox
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([700, 700]);
  page.setMediaBox(100, 100, 500, 500); // x,y,w,h => 100..600
  page.setCropBox(150, 150, CARD, CARD); // visible 150..474
  drawCard(page, font, 150, 150, CARD, CARD, 'CB', 4);
  page.drawRectangle({ x: 100, y: 100, width: 500, height: 500, borderColor: rgb(1, 0, 0), borderWidth: 6 }); // outside crop box
  await save('cropbox-offset.pdf', doc);
}

console.log('Done.');
