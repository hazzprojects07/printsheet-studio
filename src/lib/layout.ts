import { fitArtwork, type ArtFit } from './geometry';
import { planPack, type PackItem, type PackResult, type PackSettings } from './packing';
import type { LayoutSettings } from './types';
import { validatePacking, type ValidationIssue } from './validate';

/** What the planner needs to know about one selected card design. All sizes in millimetres. */
export interface DesignGeometry {
  id: string;
  name: string;
  /** size of the selected artwork (page or crop) at 100% */
  srcW: number;
  srcH: number;
  qty: number;
}

export interface DesignArt {
  srcW: number;
  srcH: number;
  /** nominal card cell (unrotated) */
  cellW: number;
  cellH: number;
  fit: ArtFit;
}

export interface PlannedLayout {
  pack: PackResult;
  items: PackItem[];
  art: Record<string, DesignArt>;
  /** non-blocking notes (scaling, aspect ratio, ...) */
  warnings: string[];
  /** blocking errors from packing + validation */
  errors: string[];
  issues: ValidationIssue[];
  stats: {
    totalDesigns: number;
    totalRequested: number;
    totalPlaced: number;
    sheetCount: number;
    cardAreaMm2: number;
    sheetAreaMm2: number;
    unusedPercent: number;
  };
  /** true when export is allowed */
  valid: boolean;
}

export function toPackSettings(s: LayoutSettings): PackSettings {
  return {
    sheetW: s.sheetW,
    sheetH: s.sheetH,
    marginTop: s.marginTop,
    marginRight: s.marginRight,
    marginBottom: s.marginBottom,
    marginLeft: s.marginLeft,
    gapX: s.gapX,
    gapY: s.gapY,
    allowRotate: s.allowRotate,
    arrangeMode: s.arrangeMode,
  };
}

const fmt = (n: number) => String(Number(n.toFixed(2)));

/** One call: sizes -> packing -> artwork fitting -> validation. */
export function planAll(designs: DesignGeometry[], s: LayoutSettings): PlannedLayout {
  const active = designs.filter((d) => d.qty > 0);
  const items: PackItem[] = [];
  const art: Record<string, DesignArt> = {};
  const warnings: string[] = [];

  for (const d of active) {
    const cellW = s.cardSizeMode === 'original' ? d.srcW : s.cardW;
    const cellH = s.cardSizeMode === 'original' ? d.srcH : s.cardH;
    items.push({ id: d.id, name: d.name, w: cellW, h: cellH, qty: d.qty });
    if (!(d.srcW > 0 && d.srcH > 0 && cellW > 0 && cellH > 0)) continue;
    const fit = fitArtwork(d.srcW, d.srcH, cellW, cellH, s.fitMode);
    art[d.id] = { srcW: d.srcW, srcH: d.srcH, cellW, cellH, fit };

    if (s.cardSizeMode === 'common') {
      const srcAspect = d.srcW / d.srcH;
      const cellAspect = cellW / cellH;
      const aspectDiff = Math.abs(srcAspect - cellAspect) / cellAspect;
      const scaled = Math.abs(fit.scale - 1) > 0.005;
      if (aspectDiff > 0.005) {
        warnings.push(
          `"${d.name}": artwork is ${fmt(d.srcW)} × ${fmt(d.srcH)} mm but the card is ${fmt(cellW)} × ${fmt(cellH)} mm. ` +
            (s.fitMode === 'contain'
              ? `Aspect ratio is preserved: the artwork is fitted inside the card (scaled to ${fmt(fit.scale * 100)}%) and blank space is left.`
              : `Aspect ratio is preserved: the artwork fills the card (scaled to ${fmt(fit.scale * 100)}%) and the overflow is cropped.`),
        );
      } else if (scaled) {
        warnings.push(
          `"${d.name}": artwork (${fmt(d.srcW)} × ${fmt(d.srcH)} mm) will be scaled to ${fmt(fit.scale * 100)}% to match the card size. Proportions are unchanged.`,
        );
      }
    }
  }

  const pack = planPack(items, toPackSettings(s));
  const issues: ValidationIssue[] = [];
  const errors: string[] = [...pack.errors];

  if (errors.length === 0) {
    const v = validatePacking({
      sheets: pack.sheets,
      items,
      settings: toPackSettings(s),
      art: Object.entries(art).map(([id, a]) => ({
        name: items.find((i) => i.id === id)?.name ?? id,
        srcW: a.srcW,
        srcH: a.srcH,
        drawW: a.fit.drawW,
        drawH: a.fit.drawH,
      })),
    });
    issues.push(...v.issues);
    for (const i of v.issues) if (i.level === 'error') errors.push(i.message);
  }

  let cardArea = 0;
  for (const sh of pack.sheets) for (const p of sh.placements) cardArea += p.w * p.h;
  const sheetArea = pack.sheets.length * s.sheetW * s.sheetH;

  return {
    pack,
    items,
    art,
    warnings,
    errors,
    issues,
    stats: {
      totalDesigns: active.length,
      totalRequested: pack.requested,
      totalPlaced: pack.placed,
      sheetCount: pack.sheets.length,
      cardAreaMm2: cardArea,
      sheetAreaMm2: sheetArea,
      unusedPercent: sheetArea > 0 ? (1 - cardArea / sheetArea) * 100 : 0,
    },
    valid: errors.length === 0 && pack.sheets.length > 0,
  };
}
