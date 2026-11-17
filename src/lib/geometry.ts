import { PT_PER_MM } from './units';
import type { Crop } from './types';

/** 2D affine matrix [a, b, c, d, e, f]:  x' = a·x + c·y + e,  y' = b·x + d·y + f  (PDF convention). */
export type Mat = [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** Returns m1 ∘ m2 (m2 is applied first). */
export function mul(m1: Mat, m2: Mat): Mat {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function applyMat(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function invert(m: Mat): Mat {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) throw new Error('Matrix is not invertible');
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/**
 * Maps a point on the page AS DISPLAYED (top-left origin, y down, points, after /Rotate) to the page's own
 * unrotated PDF user space (bottom-left origin, y up) with the box origin moved to (0,0) -
 * exactly the coordinate space of a pdf-lib embedded page.
 *
 * W, H: size of the unrotated box in points. rotation: clockwise page /Rotate (0, 90, 180, 270).
 */
export function displayedToForm(rotation: number, W: number, H: number): Mat {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return [0, 1, 1, 0, 0, 0];
    case 180:
      return [-1, 0, 0, 1, W, 0];
    case 270:
      return [0, -1, -1, 0, W, H];
    default:
      return [1, 0, 0, -1, 0, H];
  }
}

export interface ArtFit {
  /** artwork scale relative to its original size (1 = original) */
  scale: number;
  drawW: number; // mm, in the nominal (unrotated) cell frame
  drawH: number;
  offsetX: number;
  offsetY: number;
}

/** Fit artwork into a cell without ever distorting it (uniform scale, centred). */
export function fitArtwork(
  srcW: number,
  srcH: number,
  cellW: number,
  cellH: number,
  mode: 'contain' | 'cover',
): ArtFit {
  const sx = cellW / srcW;
  const sy = cellH / srcH;
  const scale = mode === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  return { scale, drawW, drawH, offsetX: (cellW - drawW) / 2, offsetY: (cellH - drawH) / 2 };
}

export interface PlacementInput {
  /** displayed page size in points */
  pageWpt: number;
  pageHpt: number;
  rotation: number;
  /** unrotated box size in points (what pdf-lib embeds) */
  boxW: number;
  boxH: number;
  crop: Crop;
  fit: ArtFit;
  /** nominal (unrotated) cell size in mm */
  cellW: number;
  cellH: number;
  /** placement on the sheet, mm, top-left origin */
  x: number;
  y: number;
  rotated: boolean;
  sheetH: number; // mm
}

export interface PlacementTransform {
  /** form (embedded page) space -> sheet space in PDF points (y up) */
  matrix: Mat;
  /** artwork (crop) rectangle on the sheet in points, y up: [left, bottom, width, height] */
  artRect: [number, number, number, number];
  /** card cell rectangle on the sheet in points, y up */
  cellRect: [number, number, number, number];
  /** intersection of the two: the clip applied when drawing */
  clipRect: [number, number, number, number];
}

/** Everything needed to draw one card: transform + clip rectangle. Pure maths, unit-tested. */
export function placementTransform(p: PlacementInput): PlacementTransform {
  const k = PT_PER_MM;
  const cropX = p.crop.x * p.pageWpt;
  const cropY = p.crop.y * p.pageHpt;
  const cropW = p.crop.w * p.pageWpt;
  const cropH = p.crop.h * p.pageHpt;

  // displayed page (pt, y down) -> nominal cell frame (mm, y down)
  const s = p.fit.scale / k;
  const N: Mat = [s, 0, 0, s, p.fit.offsetX - cropX * s, p.fit.offsetY - cropY * s];
  // nominal cell frame -> sheet (mm, y down)
  const P: Mat = p.rotated ? [0, -1, 1, 0, p.x, p.y + p.cellW] : [1, 0, 0, 1, p.x, p.y];
  // sheet (mm, y down) -> sheet (pt, y up)
  const S: Mat = [k, 0, 0, -k, 0, p.sheetH * k];

  const displayedToSheet = mul(S, mul(P, N));
  const formToDisplayed = invert(displayedToForm(p.rotation, p.boxW, p.boxH));
  const matrix = mul(displayedToSheet, formToDisplayed);

  const [x1, y1] = applyMat(displayedToSheet, cropX, cropY);
  const [x2, y2] = applyMat(displayedToSheet, cropX + cropW, cropY + cropH);
  const artRect: [number, number, number, number] = [
    Math.min(x1, x2),
    Math.min(y1, y2),
    Math.abs(x2 - x1),
    Math.abs(y2 - y1),
  ];

  const pw = p.rotated ? p.cellH : p.cellW; // on-sheet extents
  const ph = p.rotated ? p.cellW : p.cellH;
  const cellRect: [number, number, number, number] = [p.x * k, (p.sheetH - p.y - ph) * k, pw * k, ph * k];

  const left = Math.max(artRect[0], cellRect[0]);
  const bottom = Math.max(artRect[1], cellRect[1]);
  const right = Math.min(artRect[0] + artRect[2], cellRect[0] + cellRect[2]);
  const top = Math.min(artRect[1] + artRect[3], cellRect[1] + cellRect[3]);
  const clipRect: [number, number, number, number] = [left, bottom, Math.max(0, right - left), Math.max(0, top - bottom)];

  return { matrix, artRect, cellRect, clipRect };
}
