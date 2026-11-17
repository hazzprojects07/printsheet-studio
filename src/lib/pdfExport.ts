import {
  PDFDocument,
  PDFName,
  PDFRef,
  clip,
  grayscale,
  concatTransformationMatrix,
  drawObject,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setLineWidth,
  setStrokingColor,
  stroke,
  type PDFEmbeddedPage,
  type PDFPage,
} from 'pdf-lib';
import { placementTransform } from './geometry';
import type { PlannedLayout } from './layout';
import { MARK_LINE_WIDTH_PT, cuttingMarkLines } from './marks';
import type { Crop } from './types';
import { PT_PER_MM } from './units';

export interface ExportDesign {
  id: string;
  name: string;
  fileId: string;
  fileName: string;
  pageIndex: number;
  crop: Crop;
}

export interface ExportInput {
  layout: PlannedLayout;
  designs: ExportDesign[];
  /** original bytes of each uploaded PDF, keyed by file id (never modified) */
  sources: Map<string, Uint8Array>;
  sheetW: number; // mm
  sheetH: number; // mm
  cuttingMarks: boolean;
  gapX: number;
  gapY: number;
  onProgress?: (done: number, total: number, label: string) => void;
}

export interface ExportReport {
  bytes: Uint8Array;
  sheets: number;
  cardsPlaced: number;
  /** things the user must know about (never silently degraded) */
  limitations: string[];
  /** result of re-opening the generated PDF */
  verification: PdfVerification;
}

export interface PdfVerification {
  ok: boolean;
  pageCount: number;
  messages: string[];
}

export class ExportError extends Error {}

/** Largest page size most PDF viewers (Acrobat) handle: 14400 pt = 200 inches. */
export const MAX_PDF_PAGE_PT = 14400;

interface PageBox {
  left: number;
  bottom: number;
  w: number;
  h: number;
}

interface EmbeddedSource {
  embedded: PDFEmbeddedPage | null;
  box: PageBox;
  rotation: number;
  dispW: number;
  dispH: number;
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

function normaliseRotation(angle: number): number {
  return ((Math.round(angle) % 360) + 360) % 360;
}

/** Effective visible box of a page = CropBox ∩ MediaBox (what viewers display). */
function visibleBox(page: PDFPage): PageBox {
  const mb = page.getMediaBox();
  const cb = page.getCropBox();
  const left = Math.max(mb.x, cb.x);
  const bottom = Math.max(mb.y, cb.y);
  const right = Math.min(mb.x + mb.width, cb.x + cb.width);
  const top = Math.min(mb.y + mb.height, cb.y + cb.height);
  if (right - left > 0 && top - bottom > 0) return { left, bottom, w: right - left, h: top - bottom };
  return { left: mb.x, bottom: mb.y, w: mb.width, h: mb.height };
}

export async function buildManufacturingPdf(input: ExportInput): Promise<ExportReport> {
  const { layout, designs, sources } = input;
  if (!layout.valid) throw new ExportError('The layout has errors. Fix them before exporting.');

  const limitations: string[] = [];
  const designById = new Map(designs.map((d) => [d.id, d]));
  const out = await PDFDocument.create();
  out.setTitle('PrintSheet Studio - manufacturing sheets');
  out.setProducer('PrintSheet Studio');
  out.setCreator('PrintSheet Studio');
  out.setCreationDate(new Date());

  const sheetWpt = input.sheetW * PT_PER_MM;
  const sheetHpt = input.sheetH * PT_PER_MM;
  if (Math.max(sheetWpt, sheetHpt) > MAX_PDF_PAGE_PT) {
    limitations.push(
      `The sheet is larger than 200 inches (14400 pt) on one side. Some PDF viewers and RIPs cannot open pages this large; ` +
        `consider exporting at a smaller scale or splitting the job.`,
    );
  }

  // --- load every source once, embed every used page once
  const srcDocs = new Map<string, PDFDocument>();
  const embeds = new Map<string, EmbeddedSource>();

  async function getSource(design: ExportDesign): Promise<EmbeddedSource> {
    const key = `${design.fileId}:${design.pageIndex}`;
    const cached = embeds.get(key);
    if (cached) return cached;

    let doc = srcDocs.get(design.fileId);
    if (!doc) {
      const bytes = sources.get(design.fileId);
      if (!bytes) throw new ExportError(`The source PDF "${design.fileName}" is no longer loaded.`);
      try {
        doc = await PDFDocument.load(bytes, { updateMetadata: false });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/encrypt/i.test(msg)) {
          throw new ExportError(
            `"${design.fileName}" is encrypted/protected, so its pages cannot be embedded without losing quality. ` +
              `Remove the protection (print-to-PDF is NOT recommended - it can rasterise) and upload it again.`,
          );
        }
        throw new ExportError(`"${design.fileName}" could not be read for export: ${msg}`);
      }
      srcDocs.set(design.fileId, doc);
    }
    if (design.pageIndex < 0 || design.pageIndex >= doc.getPageCount()) {
      throw new ExportError(`"${design.fileName}" has no page ${design.pageIndex + 1}.`);
    }
    const page = doc.getPage(design.pageIndex);
    const box = visibleBox(page);
    let rotation = normaliseRotation(page.getRotation().angle);
    if (rotation % 90 !== 0) {
      limitations.push(`"${design.fileName}" page ${design.pageIndex + 1} has an unsupported /Rotate value; treated as 0°.`);
      rotation = 0;
    }
    const swap = rotation === 90 || rotation === 270;
    let embedded: PDFEmbeddedPage | null = null;
    try {
      embedded = await out.embedPage(page, {
        left: box.left,
        bottom: box.bottom,
        right: box.left + box.w,
        top: box.bottom + box.h,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      limitations.push(
        `"${design.fileName}" page ${design.pageIndex + 1} could not be embedded (${msg}). Its cards are left blank in the output.`,
      );
    }
    const src: EmbeddedSource = {
      embedded,
      box,
      rotation,
      dispW: swap ? box.h : box.w,
      dispH: swap ? box.w : box.h,
    };
    embeds.set(key, src);
    return src;
  }

  const total = layout.pack.sheets.length;
  let cardsPlaced = 0;

  for (let si = 0; si < total; si++) {
    const sheet = layout.pack.sheets[si];
    input.onProgress?.(si, total, `Sheet ${si + 1} of ${total}`);
    const page = out.addPage([sheetWpt, sheetHpt]);
    const xobjectKeys = new Map<PDFEmbeddedPage, PDFName>();

    for (const p of sheet.placements) {
      const design = designById.get(p.itemId);
      const art = layout.art[p.itemId];
      if (!design || !art) throw new ExportError('A placed card has no matching design.');
      const src = await getSource(design);
      cardsPlaced++;
      if (!src.embedded) continue;

      const t = placementTransform({
        pageWpt: src.dispW,
        pageHpt: src.dispH,
        rotation: src.rotation,
        boxW: src.box.w,
        boxH: src.box.h,
        crop: design.crop,
        fit: art.fit,
        cellW: art.cellW,
        cellH: art.cellH,
        x: p.x,
        y: p.y,
        rotated: p.rotated,
        sheetH: input.sheetH,
      });

      let key = xobjectKeys.get(src.embedded);
      if (!key) {
        key = page.node.newXObject('PSPage', src.embedded.ref as PDFRef);
        xobjectKeys.set(src.embedded, key);
      }
      const [cx, cy, cw, ch] = t.clipRect;
      const m = t.matrix;
      page.pushOperators(
        pushGraphicsState(),
        rectangle(cx, cy, cw, ch),
        clip(),
        endPath(),
        concatTransformationMatrix(m[0], m[1], m[2], m[3], m[4], m[5]),
        drawObject(key),
        popGraphicsState(),
      );
    }

    if (input.cuttingMarks) {
      const { lines, warning } = cuttingMarkLines(sheet.placements, input.sheetW, input.sheetH, input.gapX, input.gapY);
      if (warning && !limitations.includes(warning)) limitations.push(warning);
      if (lines.length) {
        const ops = [pushGraphicsState(), setLineWidth(MARK_LINE_WIDTH_PT), setStrokingColor(grayscale(0))];
        for (const l of lines) {
          ops.push(
            moveTo(l.x1 * PT_PER_MM, (input.sheetH - l.y1) * PT_PER_MM),
            lineTo(l.x2 * PT_PER_MM, (input.sheetH - l.y2) * PT_PER_MM),
            stroke(),
          );
        }
        ops.push(popGraphicsState());
        page.pushOperators(...ops);
      }
    }
    await yieldToUi();
  }
  input.onProgress?.(total, total, 'Saving PDF…');
  await yieldToUi();

  // classic xref tables (no object streams) are the most compatible with print RIPs
  const bytes = await out.save({ useObjectStreams: false });
  const verification = await verifyPdf(bytes, total, sheetWpt, sheetHpt);
  return { bytes, sheets: total, cardsPlaced, limitations, verification };
}

/** Re-open the generated PDF and check page count and the exact physical page size. */
export async function verifyPdf(
  bytes: Uint8Array,
  expectedPages: number,
  expectedWpt: number,
  expectedHpt: number,
): Promise<PdfVerification> {
  const messages: string[] = [];
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const pages = doc.getPages();
    if (pages.length !== expectedPages) {
      messages.push(`Expected ${expectedPages} pages but the PDF has ${pages.length}.`);
    }
    pages.forEach((pg, i) => {
      const { width, height } = pg.getSize();
      if (Math.abs(width - expectedWpt) > 0.01 || Math.abs(height - expectedHpt) > 0.01) {
        messages.push(`Page ${i + 1} is ${width.toFixed(2)} × ${height.toFixed(2)} pt instead of ${expectedWpt.toFixed(2)} × ${expectedHpt.toFixed(2)} pt.`);
      }
    });
    return { ok: messages.length === 0, pageCount: pages.length, messages };
  } catch (e) {
    return { ok: false, pageCount: 0, messages: [`The generated PDF could not be re-opened: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
