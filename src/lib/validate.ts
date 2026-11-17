import { EPS, type PackItem, type PackSettings, type PackedSheet } from './packing';

export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
}

export interface ArtCheck {
  name: string;
  srcW: number;
  srcH: number;
  drawW: number;
  drawH: number;
}

const TOL = 1e-4; // mm

/**
 * Pre-export checks (see spec section 11):
 *  1. every requested card is placed (no loss, no duplicates)
 *  2. no overlaps
 *  3. nothing outside the sheet / inside the margins
 *  4. card dimensions are exactly the requested ones
 *  5. gaps are respected
 *  7. artwork is not distorted
 * (6, exact PDF page sizes, is verified on the generated file itself - see pdfExport.verifyPdf.)
 */
export function validatePacking(input: {
  sheets: PackedSheet[];
  items: PackItem[];
  settings: PackSettings;
  art?: ArtCheck[];
}): { ok: boolean; issues: ValidationIssue[] } {
  const { sheets, items, settings: s } = input;
  const issues: ValidationIssue[] = [];
  const err = (message: string) => issues.push({ level: 'error', message });

  // 1. quantities
  const counts = new Map<string, Set<number>>();
  const dupes = new Set<string>();
  for (const sh of sheets) {
    for (const p of sh.placements) {
      let set = counts.get(p.itemId);
      if (!set) counts.set(p.itemId, (set = new Set()));
      if (set.has(p.copy)) dupes.add(p.itemId);
      set.add(p.copy);
    }
  }
  for (const it of items) {
    const placed = counts.get(it.id)?.size ?? 0;
    if (placed !== it.qty) err(`"${it.name}": ${placed} of ${it.qty} requested cards were placed.`);
    if (dupes.has(it.id)) err(`"${it.name}": a card was placed twice.`);
  }
  const known = new Set(items.map((i) => i.id));
  for (const id of counts.keys()) if (!known.has(id)) err('A placed card does not belong to any selected design.');

  const byId = new Map(items.map((i) => [i.id, i]));
  const right = s.sheetW - s.marginRight;
  const bottom = s.sheetH - s.marginBottom;

  for (const sh of sheets) {
    const label = `Sheet ${sh.index + 1}`;
    for (const p of sh.placements) {
      const it = byId.get(p.itemId);
      // 4. dimensions
      if (it) {
        const ew = p.rotated ? it.h : it.w;
        const eh = p.rotated ? it.w : it.h;
        if (Math.abs(p.w - ew) > TOL || Math.abs(p.h - eh) > TOL) {
          err(`${label}: "${it.name}" has the wrong size (${p.w} × ${p.h} mm instead of ${ew} × ${eh} mm).`);
        }
        if (p.rotated && !s.allowRotate) err(`${label}: "${it.name}" is rotated although rotation is not permitted.`);
      }
      // 3. boundaries & margins
      if (p.x < s.marginLeft - TOL || p.y < s.marginTop - TOL || p.x + p.w > right + TOL || p.y + p.h > bottom + TOL) {
        err(`${label}: a card extends outside the printable area (margins not respected).`);
      }
      if (p.x < -TOL || p.y < -TOL || p.x + p.w > s.sheetW + TOL || p.y + p.h > s.sheetH + TOL) {
        err(`${label}: a card extends beyond the sheet edge.`);
      }
    }

    // 2 + 5. overlaps and gaps (sweep over x)
    const ps = [...sh.placements].sort((a, b) => a.x - b.x);
    let overlap = false;
    let gapBreach = false;
    for (let i = 0; i < ps.length && !(overlap && gapBreach); i++) {
      const a = ps[i];
      for (let j = i + 1; j < ps.length; j++) {
        const b = ps[j];
        if (b.x >= a.x + a.w + s.gapX - TOL) break; // separated horizontally by at least the gap (sorted by x)
        const sepY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
        const sepX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
        if (sepX < -TOL && sepY < -TOL) overlap = true;
        else if (sepX < s.gapX - TOL && sepY < s.gapY - TOL) gapBreach = true;
      }
    }
    if (overlap) err(`${label}: cards overlap.`);
    if (gapBreach) err(`${label}: the spacing between some cards is smaller than the configured gap.`);
  }

  // 7. no distortion
  for (const a of input.art ?? []) {
    const src = a.srcW / a.srcH;
    const drawn = a.drawW / a.drawH;
    if (!Number.isFinite(src) || !Number.isFinite(drawn) || Math.abs(src - drawn) / src > 1e-6) {
      err(`"${a.name}": the artwork would be distorted.`);
    }
  }

  return { ok: !issues.some((i) => i.level === 'error'), issues };
}

export { EPS };
