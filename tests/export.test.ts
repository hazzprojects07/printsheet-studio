import test from 'node:test';
import assert from 'node:assert/strict';
import { degrees, PDFDocument, rgb } from 'pdf-lib';
import { buildManufacturingPdf, type ExportDesign } from '../src/lib/pdfExport';
import { planAll, type DesignGeometry } from '../src/lib/layout';
import { DEFAULT_SETTINGS, FULL_PAGE, type LayoutSettings } from '../src/lib/types';
import { PT_PER_MM } from '../src/lib/units';

async function makeSource(pages: number, size = 324): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([size, size]);
    p.drawRectangle({ x: 0, y: 0, width: size, height: size, color: rgb(i / pages, 0.4, 0.6) });
  }
  return doc.save();
}

function setup(designsN: number, qty: number, settings: Partial<LayoutSettings> = {}) {
  const s: LayoutSettings = { ...DEFAULT_SETTINGS, ...settings };
  const geoms: DesignGeometry[] = [];
  const designs: ExportDesign[] = [];
  for (let i = 0; i < designsN; i++) {
    geoms.push({ id: 'd' + i, name: 'Design ' + i, srcW: 114.3, srcH: 114.3, qty });
    designs.push({ id: 'd' + i, name: 'Design ' + i, fileId: 'f', fileName: 'f.pdf', pageIndex: i, crop: FULL_PAGE });
  }
  return { s, geoms, designs, layout: planAll(geoms, s) };
}

test('export: correct page count, exact page size, all cards placed', async () => {
  const { s, designs, layout } = setup(5, 14); // 70 cards, 6 per A3 sheet -> 12 sheets
  assert.equal(layout.valid, true);
  assert.equal(layout.stats.sheetCount, 12);
  const src = await makeSource(5);
  const report = await buildManufacturingPdf({
    layout, designs, sources: new Map([['f', src]]),
    sheetW: s.sheetW, sheetH: s.sheetH, 
  });
  assert.equal(report.sheets, 12);
  assert.equal(report.cardsPlaced, 70);
  assert.equal(report.verification.ok, true, report.verification.messages.join('; '));
  const doc = await PDFDocument.load(report.bytes);
  assert.equal(doc.getPageCount(), 12);
  for (const p of doc.getPages()) {
    const { width, height } = p.getSize();
    assert.ok(Math.abs(width - 420 * PT_PER_MM) < 0.01);
    assert.ok(Math.abs(height - 297 * PT_PER_MM) < 0.01);
  }
});

test('export: each source page is embedded once, not once per copy (small output)', async () => {
  const { s, designs, layout } = setup(1, 60);
  const src = await makeSource(1);
  const report = await buildManufacturingPdf({
    layout, designs, sources: new Map([['f', src]]),
    sheetW: s.sheetW, sheetH: s.sheetH, 
  });
  assert.equal(report.cardsPlaced, 60);
  assert.ok(report.bytes.length < 60 * 1024, `unexpectedly large: ${report.bytes.length}`);
});

test('export works with rotated source pages, crops and an off-origin crop box', async () => {
  const doc = await PDFDocument.create();
  const a = doc.addPage([300, 200]);
  a.setRotation(degrees(90));
  a.drawRectangle({ x: 0, y: 0, width: 300, height: 200, color: rgb(1, 0, 0) });
  const b = doc.addPage([700, 700]);
  b.setMediaBox(100, 100, 500, 500);
  b.setCropBox(150, 150, 324, 324);
  b.drawRectangle({ x: 150, y: 150, width: 324, height: 324, color: rgb(0, 1, 0) });
  const bytes = await doc.save();
  const s: LayoutSettings = { ...DEFAULT_SETTINGS, cardSizeMode: 'original' };
  const geoms: DesignGeometry[] = [
    { id: 'r', name: 'rot', srcW: (200 * 0.5) / PT_PER_MM, srcH: (300 * 0.5) / PT_PER_MM, qty: 3 },
    { id: 'c', name: 'crop', srcW: 114.3, srcH: 114.3, qty: 2 },
  ];
  const designs: ExportDesign[] = [
    { id: 'r', name: 'rot', fileId: 'f', fileName: 'f.pdf', pageIndex: 0, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } },
    { id: 'c', name: 'crop', fileId: 'f', fileName: 'f.pdf', pageIndex: 1, crop: FULL_PAGE },
  ];
  const layout = planAll(geoms, s);
  assert.equal(layout.valid, true, layout.errors.join('; '));
  const report = await buildManufacturingPdf({
    layout, designs, sources: new Map([['f', bytes]]),
    sheetW: s.sheetW, sheetH: s.sheetH, cuttingMarks: false, gapX: s.gapX, gapY: s.gapY,
  });
  assert.equal(report.cardsPlaced, 5);
  assert.equal(report.verification.ok, true);
});

test('export refuses an invalid layout', async () => {
  const { s, designs } = setup(1, 1, { cardW: 9999, cardH: 9999 });
  const layout = planAll([{ id: 'd0', name: 'x', srcW: 100, srcH: 100, qty: 1 }], s);
  assert.equal(layout.valid, false);
  await assert.rejects(() =>
    buildManufacturingPdf({
      layout, designs, sources: new Map(), sheetW: s.sheetW, sheetH: s.sheetH, 
    }),
  );
});
