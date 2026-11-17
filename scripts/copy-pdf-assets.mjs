// Copies the PDF.js worker, CMaps and standard fonts from node_modules into /public
// so the browser can load them from the same origin (no CDN, no external requests).
// Safe to run repeatedly. Never fails the install.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pdfjs = join(root, 'node_modules', 'pdfjs-dist');
const pub = join(root, 'public');

try {
  if (!existsSync(pdfjs)) {
    console.log('[copy-pdf-assets] pdfjs-dist not installed yet - skipping.');
    process.exit(0);
  }
  mkdirSync(pub, { recursive: true });
  const worker = join(pdfjs, 'build', 'pdf.worker.min.mjs');
  if (existsSync(worker)) {
    cpSync(worker, join(pub, 'pdf.worker.min.mjs'));
  } else {
    console.warn('[copy-pdf-assets] worker file not found at', worker);
  }
  for (const dir of ['cmaps', 'standard_fonts']) {
    const src = join(pdfjs, dir);
    if (existsSync(src)) cpSync(src, join(pub, 'pdfjs', dir), { recursive: true });
  }
  console.log('[copy-pdf-assets] PDF.js assets copied to /public');
} catch (err) {
  console.warn('[copy-pdf-assets] could not copy assets:', err && err.message ? err.message : err);
}
