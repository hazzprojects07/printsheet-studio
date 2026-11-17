export type Unit = 'mm' | 'cm' | 'in' | 'ft';

/** Rectangle on a displayed PDF page, normalised 0..1, origin top-left of the page as displayed. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_PAGE: Crop = { x: 0, y: 0, w: 1, h: 1 };

export function isFullPage(c: Crop): boolean {
  return c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1;
}

export interface PageInfo {
  index: number; // 0-based
  /** Size of the page as DISPLAYED (after /Rotate), in PDF points. */
  widthPt: number;
  heightPt: number;
  rotation: number; // 0 | 90 | 180 | 270
  orientation: 'portrait' | 'landscape' | 'square';
}

export type FileStatus = 'reading' | 'ready' | 'error';

export interface SourceFile {
  id: string;
  name: string;
  sizeBytes: number;
  bytes: Uint8Array | null; // original bytes, never modified
  status: FileStatus;
  error?: string;
  progress: number; // 0..1 while reading
  pageCount: number;
  pages: PageInfo[];
  mixedSizes: boolean;
}

export interface Design {
  id: string;
  name: string;
  fileId: string;
  fileName: string;
  pageIndex: number;
  crop: Crop;
  qty: number;
}

export type CardSizeMode = 'common' | 'original';
export type FitMode = 'contain' | 'cover';
export type ArrangeMode = 'group' | 'mixed';

/** All lengths are millimetres internally. */
export interface LayoutSettings {
  sheetW: number;
  sheetH: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  gapX: number;
  gapY: number;
  cardSizeMode: CardSizeMode;
  cardW: number;
  cardH: number;
  lockAspect: boolean;
  fitMode: FitMode;
  allowRotate: boolean;
  arrangeMode: ArrangeMode;
  cuttingMarks: boolean;
}

export const DEFAULT_SETTINGS: LayoutSettings = {
  sheetW: 420,
  sheetH: 297,
  marginTop: 10,
  marginRight: 10,
  marginBottom: 10,
  marginLeft: 10,
  gapX: 3,
  gapY: 3,
  cardSizeMode: 'common',
  cardW: 114.3,
  cardH: 114.3,
  lockAspect: false,
  fitMode: 'contain',
  allowRotate: true,
  arrangeMode: 'mixed',
  cuttingMarks: false,
};
