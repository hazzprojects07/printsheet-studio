/**
 * Automatic rectangle packing for manufacturing sheets.
 *
 * All lengths are millimetres. Sheet coordinates have their origin at the TOP-LEFT corner and y grows down.
 *
 * Algorithms (all heuristic - none of them claims to be mathematically optimal nesting):
 *  - GRID      : used whenever every card has the same size. Columns/rows are computed exactly with
 *                  cols = floor((availW + gapX) / (w + gapX)),  rows = floor((availH + gapY) / (h + gapY))
 *                for both orientations; the orientation that fits more cards wins (ties keep "normal").
 *  - MAXRECTS  : used for mixed designs of different sizes (Best-Short-Side-Fit heuristic, rotation optional).
 */

export const EPS = 1e-6;

export interface PackSettings {
  sheetW: number;
  sheetH: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  gapX: number;
  gapY: number;
  allowRotate: boolean;
  /** group: every design gets its own sheet(s). mixed: designs share sheets. */
  arrangeMode: 'group' | 'mixed';
}

export interface PackItem {
  id: string;
  name: string;
  /** nominal card cell size (unrotated) */
  w: number;
  h: number;
  qty: number;
}

export interface Placement {
  sheet: number; // 0-based
  itemId: string;
  copy: number; // 0-based copy number of this design
  x: number;
  y: number;
  /** on-sheet extents (already swapped when rotated) */
  w: number;
  h: number;
  /** true when the card is turned 90 degrees on the sheet */
  rotated: boolean;
}

export interface PackedSheet {
  index: number;
  placements: Placement[];
}

export interface GridCandidate {
  rotated: boolean;
  cols: number;
  rows: number;
  capacity: number;
  /** on-sheet card size for this orientation */
  cellW: number;
  cellH: number;
}

export interface GridInfo {
  best: GridCandidate;
  normal: GridCandidate;
  rotated: GridCandidate | null;
}

export interface PackResult {
  sheets: PackedSheet[];
  algorithm: 'grid' | 'maxrects' | 'none';
  /** Cards per full sheet when it is a single number (grid, uniform size). */
  capacityPerSheet: number | null;
  /** min/max cards over generated sheets */
  minPerSheet: number;
  maxPerSheet: number;
  requested: number;
  placed: number;
  errors: string[];
  notes: string[];
}

export function availableArea(s: PackSettings): { w: number; h: number } {
  return {
    w: s.sheetW - s.marginLeft - s.marginRight,
    h: s.sheetH - s.marginTop - s.marginBottom,
  };
}

function candidate(
  availW: number,
  availH: number,
  w: number,
  h: number,
  gapX: number,
  gapY: number,
  rotated: boolean,
): GridCandidate {
  const cellW = rotated ? h : w;
  const cellH = rotated ? w : h;
  const cols = Math.max(0, Math.floor((availW + gapX + EPS) / (cellW + gapX)));
  const rows = Math.max(0, Math.floor((availH + gapY + EPS) / (cellH + gapY)));
  return { rotated, cols, rows, capacity: cols * rows, cellW, cellH };
}

/**
 * Grid capacity of one card size, trying both orientations.
 * capacity = columns x rows, using the real margins and gaps.
 */
export function gridCapacity(
  availW: number,
  availH: number,
  w: number,
  h: number,
  gapX: number,
  gapY: number,
  allowRotate: boolean,
): GridInfo {
  const normal = candidate(availW, availH, w, h, gapX, gapY, false);
  const rotated = allowRotate ? candidate(availW, availH, w, h, gapX, gapY, true) : null;
  const best = rotated && rotated.capacity > normal.capacity ? rotated : normal;
  return { best, normal, rotated };
}

export function validateSettings(s: PackSettings): string[] {
  const errors: string[] = [];
  const nums: [string, number][] = [
    ['Sheet width', s.sheetW],
    ['Sheet height', s.sheetH],
    ['Top margin', s.marginTop],
    ['Right margin', s.marginRight],
    ['Bottom margin', s.marginBottom],
    ['Left margin', s.marginLeft],
    ['Horizontal gap', s.gapX],
    ['Vertical gap', s.gapY],
  ];
  for (const [label, v] of nums) {
    if (!Number.isFinite(v)) errors.push(`${label} is not a valid number.`);
  }
  if (errors.length) return errors;
  if (s.sheetW <= 0 || s.sheetH <= 0) errors.push('Sheet width and height must be greater than zero.');
  for (const [label, v] of nums.slice(2)) {
    if (v < 0) errors.push(`${label} cannot be negative.`);
  }
  if (errors.length) return errors;
  const a = availableArea(s);
  if (a.w <= 0 || a.h <= 0) errors.push('The margins are larger than the sheet - there is no printable area left.');
  return errors;
}

function emptyResult(errors: string[], requested = 0): PackResult {
  return {
    sheets: [],
    algorithm: 'none',
    capacityPerSheet: null,
    minPerSheet: 0,
    maxPerSheet: 0,
    requested,
    placed: 0,
    errors,
    notes: [],
  };
}

function finish(
  sheets: PackedSheet[],
  algorithm: PackResult['algorithm'],
  capacityPerSheet: number | null,
  requested: number,
  errors: string[],
  notes: string[],
): PackResult {
  const counts = sheets.map((s) => s.placements.length);
  return {
    sheets,
    algorithm,
    capacityPerSheet,
    minPerSheet: counts.length ? Math.min(...counts) : 0,
    maxPerSheet: counts.length ? Math.max(...counts) : 0,
    requested,
    placed: counts.reduce((a, b) => a + b, 0),
    errors,
    notes,
  };
}

function fitsEmptySheet(item: PackItem, s: PackSettings): boolean {
  const a = availableArea(s);
  if (item.w <= a.w + EPS && item.h <= a.h + EPS) return true;
  return s.allowRotate && item.h <= a.w + EPS && item.w <= a.h + EPS;
}

/** Main entry point. Never loses or duplicates cards: placed === requested unless errors are returned. */
export function planPack(rawItems: PackItem[], s: PackSettings): PackResult {
  const settingsErrors = validateSettings(s);
  if (settingsErrors.length) return emptyResult(settingsErrors);

  const items = rawItems.filter((i) => i.qty > 0);
  const requested = items.reduce((n, i) => n + i.qty, 0);
  if (items.length === 0) return emptyResult(['Add at least one card with a quantity above zero.'], 0);

  const errors: string[] = [];
  for (const it of items) {
    if (!(it.w > 0 && it.h > 0)) {
      errors.push(`"${it.name}" has an invalid card size.`);
    } else if (!fitsEmptySheet(it, s)) {
      errors.push(
        `"${it.name}" (${fmt(it.w)} × ${fmt(it.h)} mm) does not fit on the sheet inside the margins ` +
          `(printable area ${fmt(availableArea(s).w)} × ${fmt(availableArea(s).h)} mm).`,
      );
    }
  }
  if (errors.length) return emptyResult(errors, requested);

  if (s.arrangeMode === 'group') return packGroup(items, s, requested);

  const first = items[0];
  const uniform = items.every((i) => Math.abs(i.w - first.w) < 1e-3 && Math.abs(i.h - first.h) < 1e-3);
  return uniform ? packUniformGrid(items, s, requested) : packMaxRects(items, s, requested);
}

const fmt = (n: number) => String(Number(n.toFixed(2)));

function gridPlacements(
  info: GridCandidate,
  s: PackSettings,
  sheetIndex: number,
  cells: { itemId: string; copy: number }[],
): Placement[] {
  const out: Placement[] = [];
  cells.forEach((c, i) => {
    const row = Math.floor(i / info.cols);
    const col = i % info.cols;
    out.push({
      sheet: sheetIndex,
      itemId: c.itemId,
      copy: c.copy,
      x: s.marginLeft + col * (info.cellW + s.gapX),
      y: s.marginTop + row * (info.cellH + s.gapY),
      w: info.cellW,
      h: info.cellH,
      rotated: info.rotated,
    });
  });
  return out;
}

function gridNotes(info: GridInfo): string[] {
  const n = info.normal;
  const parts = [`Normal orientation: ${n.cols} × ${n.rows} = ${n.capacity}`];
  if (info.rotated) parts.push(`rotated 90°: ${info.rotated.cols} × ${info.rotated.rows} = ${info.rotated.capacity}`);
  return [`${parts.join(' · ')}. Chosen: ${info.best.rotated ? 'rotated 90°' : 'normal'}.`];
}

/** Mixed mode where every card has the same size: one grid, designs fill it in list order. */
function packUniformGrid(items: PackItem[], s: PackSettings, requested: number): PackResult {
  const a = availableArea(s);
  const first = items[0];
  const info = gridCapacity(a.w, a.h, first.w, first.h, s.gapX, s.gapY, s.allowRotate);
  if (info.best.capacity < 1) {
    return emptyResult(['Not even one card fits on the sheet with these margins and gaps.'], requested);
  }
  const cap = info.best.capacity;
  const seq: { itemId: string; copy: number }[] = [];
  for (const it of items) for (let c = 0; c < it.qty; c++) seq.push({ itemId: it.id, copy: c });

  const sheets: PackedSheet[] = [];
  for (let start = 0, idx = 0; start < seq.length; start += cap, idx++) {
    sheets.push({ index: idx, placements: gridPlacements(info.best, s, idx, seq.slice(start, start + cap)) });
  }
  return finish(sheets, 'grid', cap, requested, [], gridNotes(info));
}

/** Group mode: each design is laid out on its own sheet(s) so identical designs stay together. */
function packGroup(items: PackItem[], s: PackSettings, requested: number): PackResult {
  const a = availableArea(s);
  const sheets: PackedSheet[] = [];
  const notes: string[] = [];
  const caps = new Set<number>();
  for (const it of items) {
    const info = gridCapacity(a.w, a.h, it.w, it.h, s.gapX, s.gapY, s.allowRotate);
    const cap = info.best.capacity;
    if (cap < 1) {
      return emptyResult([`Not even one "${it.name}" card fits with these margins and gaps.`], requested);
    }
    caps.add(cap);
    for (let start = 0; start < it.qty; start += cap) {
      const n = Math.min(cap, it.qty - start);
      const cells = Array.from({ length: n }, (_, k) => ({ itemId: it.id, copy: start + k }));
      const idx = sheets.length;
      sheets.push({ index: idx, placements: gridPlacements(info.best, s, idx, cells) });
    }
    if (items.length > 1) notes.push(`${it.name}: ${cap} per sheet.`);
  }
  if (items.length === 1) notes.push(...gridNotes(gridCapacity(a.w, a.h, items[0].w, items[0].h, s.gapX, s.gapY, s.allowRotate)));
  return finish(sheets, 'grid', caps.size === 1 ? [...caps][0] : null, requested, [], notes);
}

// ---------------------------------------------------------------- MaxRects

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

class MaxRectsBin {
  free: Rect[];

  constructor(w: number, h: number) {
    this.free = [{ x: 0, y: 0, w, h }];
  }

  /** Best Short Side Fit; returns null if the rectangle does not fit anywhere. */
  insert(
    w: number,
    h: number,
    rotW: number,
    rotH: number,
    allowRotate: boolean,
  ): { x: number; y: number; rotated: boolean } | null {
    let best: { rect: Rect; rotated: boolean } | null = null;
    let bestShort = Infinity;
    let bestLong = Infinity;
    const consider = (fr: Rect, rw: number, rh: number, rotated: boolean) => {
      if (rw <= fr.w + EPS && rh <= fr.h + EPS) {
        const dw = Math.abs(fr.w - rw);
        const dh = Math.abs(fr.h - rh);
        const short = Math.min(dw, dh);
        const long = Math.max(dw, dh);
        if (short < bestShort - EPS || (Math.abs(short - bestShort) <= EPS && long < bestLong - EPS)) {
          bestShort = short;
          bestLong = long;
          best = { rect: { x: fr.x, y: fr.y, w: rw, h: rh }, rotated };
        }
      }
    };
    for (const fr of this.free) {
      consider(fr, w, h, false);
      if (allowRotate) consider(fr, rotW, rotH, true);
    }
    if (!best) return null;
    const { rect, rotated } = best as { rect: Rect; rotated: boolean };
    this.place(rect);
    return { x: rect.x, y: rect.y, rotated };
  }

  private place(used: Rect) {
    const next: Rect[] = [];
    for (const fr of this.free) {
      if (
        used.x >= fr.x + fr.w - EPS ||
        used.x + used.w <= fr.x + EPS ||
        used.y >= fr.y + fr.h - EPS ||
        used.y + used.h <= fr.y + EPS
      ) {
        next.push(fr); // no intersection
        continue;
      }
      if (used.x > fr.x + EPS) next.push({ x: fr.x, y: fr.y, w: used.x - fr.x, h: fr.h });
      if (used.x + used.w < fr.x + fr.w - EPS)
        next.push({ x: used.x + used.w, y: fr.y, w: fr.x + fr.w - (used.x + used.w), h: fr.h });
      if (used.y > fr.y + EPS) next.push({ x: fr.x, y: fr.y, w: fr.w, h: used.y - fr.y });
      if (used.y + used.h < fr.y + fr.h - EPS)
        next.push({ x: fr.x, y: used.y + used.h, w: fr.w, h: fr.y + fr.h - (used.y + used.h) });
    }
    // prune rectangles fully contained in another one
    this.free = next.filter(
      (a, i) =>
        !next.some(
          (b, j) =>
            i !== j &&
            a.x >= b.x - EPS &&
            a.y >= b.y - EPS &&
            a.x + a.w <= b.x + b.w + EPS &&
            a.y + a.h <= b.y + b.h + EPS &&
            // identical rectangles: keep the first one only
            (j < i || Math.abs(a.w - b.w) > EPS || Math.abs(a.h - b.h) > EPS || Math.abs(a.x - b.x) > EPS || Math.abs(a.y - b.y) > EPS),
        ),
    );
  }
}

interface Unit {
  itemId: string;
  copy: number;
  w: number;
  h: number;
  order: number;
}

/** Mixed designs of different sizes. Largest cards first, then smaller cards fill the gaps. */
function packMaxRects(items: PackItem[], s: PackSettings, requested: number): PackResult {
  const a = availableArea(s);
  const binW = a.w + s.gapX;
  const binH = a.h + s.gapY;

  let remaining: Unit[] = [];
  items.forEach((it, order) => {
    for (let c = 0; c < it.qty; c++) remaining.push({ itemId: it.id, copy: c, w: it.w, h: it.h, order });
  });
  // predictable order: area (desc), longest side (desc), then the order the designs were listed
  remaining.sort(
    (p, q) =>
      q.w * q.h - p.w * p.h ||
      Math.max(q.w, q.h) - Math.max(p.w, p.h) ||
      p.order - q.order ||
      p.copy - q.copy,
  );

  const sheets: PackedSheet[] = [];
  const errors: string[] = [];
  while (remaining.length) {
    const bin = new MaxRectsBin(binW, binH);
    const placements: Placement[] = [];
    const left: Unit[] = [];
    for (const u of remaining) {
      // footprint = card + gap; when rotated the card's height is what spans the horizontal gap
      const pos = bin.insert(u.w + s.gapX, u.h + s.gapY, u.h + s.gapX, u.w + s.gapY, s.allowRotate);
      if (!pos) {
        left.push(u);
        continue;
      }
      placements.push({
        sheet: sheets.length,
        itemId: u.itemId,
        copy: u.copy,
        x: s.marginLeft + pos.x,
        y: s.marginTop + pos.y,
        w: pos.rotated ? u.h : u.w,
        h: pos.rotated ? u.w : u.h,
        rotated: pos.rotated,
      });
    }
    if (placements.length === 0) {
      errors.push('Internal packing failure: a card could not be placed on an empty sheet.');
      break;
    }
    sheets.push({ index: sheets.length, placements });
    remaining = left;
  }
  const notes = ['Cards have different sizes: MaxRects heuristic (not guaranteed optimal nesting).'];
  return finish(sheets, 'maxrects', null, requested, errors, notes);
}
