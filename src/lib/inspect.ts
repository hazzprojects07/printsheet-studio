import type { PageInfo } from './types';
import { ptToMm } from './units';

export interface PageGuess {
  kind: 'single' | 'multiple' | 'unknown';
  /** estimated number of cards if the page looks like a multi-card sheet */
  estimate: number;
  label: string;
}

/** Heuristic only - the user always confirms. Compares the page size with the configured card size. */
export function guessCards(page: PageInfo, cardW: number, cardH: number): PageGuess {
  const pw = ptToMm(page.widthPt);
  const ph = ptToMm(page.heightPt);
  const near = (a: number, b: number) => Math.abs(a - b) / b <= 0.2;
  const sameAsCard = (near(pw, cardW) && near(ph, cardH)) || (near(pw, cardH) && near(ph, cardW));
  if (sameAsCard) return { kind: 'single', estimate: 1, label: 'Looks like 1 card' };

  const fit = (w: number, h: number) => Math.floor((pw * 1.05) / w) * Math.floor((ph * 1.05) / h);
  const count = Math.max(fit(cardW, cardH), fit(cardH, cardW));
  if (count >= 2 && (pw * ph) / (cardW * cardH) >= 1.6) {
    return { kind: 'multiple', estimate: count, label: `May hold ~${count} cards` };
  }
  return { kind: 'unknown', estimate: 1, label: 'Different from card size' };
}

/** True when pages of a file do not all share the same dimensions. */
export function hasMixedSizes(pages: PageInfo[]): boolean {
  if (pages.length < 2) return false;
  const a = pages[0];
  return pages.some((p) => Math.abs(p.widthPt - a.widthPt) > 0.5 || Math.abs(p.heightPt - a.heightPt) > 0.5);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
