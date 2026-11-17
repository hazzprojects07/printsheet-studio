// Re-opens any PDF and prints its physical page sizes:   npm run verify-pdf -- path/to/output.pdf
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run verify-pdf -- <file.pdf>');
  process.exit(1);
}
const doc = await PDFDocument.load(readFileSync(file));
const MM = 72 / 25.4;
console.log(`${file}: ${doc.getPageCount()} page(s)`);
doc.getPages().forEach((p, i) => {
  const { width, height } = p.getSize();
  console.log(`  page ${i + 1}: ${(width / MM).toFixed(2)} x ${(height / MM).toFixed(2)} mm  (${width.toFixed(2)} x ${height.toFixed(2)} pt)`);
});
