/**
 * Thin wrapper around PDF.js (browser only). PDF.js is used for READING / PREVIEWING; the manufacturing PDF
 * itself is built with pdf-lib from the original bytes, so previews never affect output quality.
 */
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { Crop, PageInfo } from './types';

type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | null = null;

export function getPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      // PDF.js 4 needs Promise.withResolvers (Chrome 119+/Safari 17.4+/Firefox 121+). Polyfill for older browsers.
      const P = Promise as unknown as { withResolvers?: () => unknown };
      if (typeof P.withResolvers !== 'function') {
        P.withResolvers = function () {
          let resolve!: (v: unknown) => void;
          let reject!: (e: unknown) => void;
          const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
          });
          return { promise, resolve, reject };
        };
      }
      const mod = await import('pdfjs-dist');
      // worker + fonts are copied into /public by scripts/copy-pdf-assets.mjs (no CDN, fully local)
      mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return mod;
    })();
  }
  return pdfjsPromise;
}

const docs = new Map<string, PDFDocumentProxy>();
const previewCache = new Map<string, string>();

/** Run at most `max` async jobs at once so thumbnails never freeze the browser. */
function createLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const pump = () => {
    while (active < max && queue.length) {
      const job = queue.shift()!;
      active++;
      job();
    }
  };
  return <T,>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            pump();
          });
      });
      pump();
    });
}
const limit = createLimiter(2);

export class OpenPdfError extends Error {}

/** Opens a PDF for preview and inspects the true size of every page. */
export async function openPdf(
  fileId: string,
  bytes: Uint8Array,
  onProgress?: (done: number, total: number) => void,
): Promise<PageInfo[]> {
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({
    data: bytes.slice(), // PDF.js transfers its buffer to the worker; keep our original intact
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    isEvalSupported: false,
  });
  let doc: PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === 'PasswordException') throw new OpenPdfError('This PDF is password protected.');
    if (name === 'InvalidPDFException') throw new OpenPdfError('This file is not a valid PDF.');
    throw new OpenPdfError(e instanceof Error ? e.message : 'The PDF could not be opened.');
  }
  docs.set(fileId, doc);

  const pages: PageInfo[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const [x0, y0, x1, y1] = page.view;
    const rotation = ((page.rotate % 360) + 360) % 360;
    let w = Math.abs(x1 - x0);
    let h = Math.abs(y1 - y0);
    if (rotation === 90 || rotation === 270) [w, h] = [h, w];
    pages.push({
      index: i - 1,
      widthPt: w,
      heightPt: h,
      rotation,
      orientation: Math.abs(w - h) < 0.5 ? 'square' : w > h ? 'landscape' : 'portrait',
    });
    page.cleanup();
    onProgress?.(i, doc.numPages);
    if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive
  }
  return pages;
}

/** Frees the PDF.js document and cached previews of a removed file. */
export function releaseFile(fileId: string) {
  const doc = docs.get(fileId);
  if (doc) {
    void doc.destroy();
    docs.delete(fileId);
  }
  for (const key of [...previewCache.keys()]) if (key.startsWith(fileId + '|')) previewCache.delete(key);
}

export class RenderHandle {
  cancelled = false;
  task: RenderTask | null = null;
  cancel() {
    this.cancelled = true;
    this.task?.cancel();
  }
}

const isCancel = (e: unknown) => (e as { name?: string })?.name === 'RenderingCancelledException';

async function renderToCanvas(
  fileId: string,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  crop: Crop,
  /** width in CSS pixels the crop should occupy */
  cssWidth: number,
  dpr: number,
  handle?: RenderHandle,
): Promise<{ cssWidth: number; cssHeight: number } | null> {
  const doc = docs.get(fileId);
  if (!doc) return null;
  const page = await doc.getPage(pageIndex + 1);
  try {
    if (handle?.cancelled) return null;
    const base = page.getViewport({ scale: 1 });
    const cropWpt = crop.w * base.width;
    const cropHpt = crop.h * base.height;
    const scale = (cssWidth * dpr) / cropWpt;
    const viewport = page.getViewport({ scale });
    canvas.width = Math.max(1, Math.round(cropWpt * scale));
    canvas.height = Math.max(1, Math.round(cropHpt * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const task = page.render({
      canvasContext: ctx,
      viewport,
      transform: [1, 0, 0, 1, -crop.x * viewport.width, -crop.y * viewport.height],
    });
    if (handle) handle.task = task;
    await task.promise;
    return { cssWidth, cssHeight: (cssWidth * cropHpt) / cropWpt };
  } catch (e) {
    if (isCancel(e)) return null;
    throw e;
  } finally {
    page.cleanup();
  }
}

/** Renders a (cropped) page into a canvas. Queued, cancellable. */
export function renderCropToCanvas(
  fileId: string,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  crop: Crop,
  cssWidth: number,
  handle?: RenderHandle,
) {
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  return limit(() => renderToCanvas(fileId, pageIndex, canvas, crop, cssWidth, dpr, handle));
}

/** PNG data URL of a crop (cached) - used for card previews in the list and on the sheet preview. */
export async function renderCropToDataUrl(
  fileId: string,
  pageIndex: number,
  crop: Crop,
  widthPx = 360,
): Promise<string | null> {
  const key = `${fileId}|${pageIndex}|${crop.x},${crop.y},${crop.w},${crop.h}|${widthPx}`;
  const hit = previewCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  const res = await limit(() => renderToCanvas(fileId, pageIndex, canvas, crop, widthPx, 1));
  if (!res) return null;
  const url = canvas.toDataURL('image/png');
  previewCache.set(key, url);
  return url;
}
