import type { Placement } from './packing';

export interface MarkLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const MARK_LINE_WIDTH_PT = 0.25;
const MAX_MARK_LEN = 2.5; // mm

/**
 * Corner cutting marks, in sheet millimetres (top-left origin).
 *
 * Every card gets two thin lines at each corner. Each line continues the card's edge OUTWARDS, starting exactly
 * at the corner, so nothing is ever drawn inside the artwork. The length is capped at half the gap so a mark
 * can never reach a neighbouring card.
 * Marks need a gap of at least 1 mm; with a smaller gap they are skipped and a warning is returned.
 */
export function cuttingMarkLines(
  placements: Placement[],
  sheetW: number,
  sheetH: number,
  gapX: number,
  gapY: number,
): { lines: MarkLine[]; warning?: string } {
  if (gapX < 1 || gapY < 1) {
    return {
      lines: [],
      warning: 'Cutting marks were skipped: they need a gap of at least 1 mm between cards (so they never touch artwork).',
    };
  }
  const lh = Math.min(MAX_MARK_LEN, gapX / 2);
  const lv = Math.min(MAX_MARK_LEN, gapY / 2);
  const seen = new Set<string>();
  const lines: MarkLine[] = [];
  const add = (x1: number, y1: number, x2: number, y2: number) => {
    const key = [x1, y1, x2, y2].map((n) => n.toFixed(3)).join(',');
    if (seen.has(key)) return;
    seen.add(key);
    lines.push({ x1, y1, x2, y2 });
  };

  for (const p of placements) {
    const corners: [number, number, number, number][] = [
      [p.x, p.y, -1, -1],
      [p.x + p.w, p.y, 1, -1],
      [p.x, p.y + p.h, -1, 1],
      [p.x + p.w, p.y + p.h, 1, 1],
    ];
    for (const [cx, cy, dx, dy] of corners) {
      const hLen = Math.min(lh, dx < 0 ? cx : sheetW - cx);
      const vLen = Math.min(lv, dy < 0 ? cy : sheetH - cy);
      if (hLen >= 0.2) add(cx, cy, cx + dx * hLen, cy);
      if (vLen >= 0.2) add(cx, cy, cx, cy + dy * vLen);
    }
  }
  return { lines };
}
