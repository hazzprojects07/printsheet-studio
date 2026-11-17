export interface SheetPreset {
  id: string;
  label: string;
  /** width × height in millimetres, exactly as listed in the label */
  w: number;
  h: number;
}

export const SHEET_PRESETS: SheetPreset[] = [
  { id: 'a4', label: 'A4 – 297 × 210 mm', w: 297, h: 210 },
  { id: 'a3', label: 'A3 – 420 × 297 mm', w: 420, h: 297 },
  { id: 'a2', label: 'A2 – 594 × 420 mm', w: 594, h: 420 },
  { id: 'a1', label: 'A1 – 841 × 594 mm', w: 841, h: 594 },
  { id: '4x3ft', label: '4 × 3 feet', w: 4 * 304.8, h: 3 * 304.8 },
  { id: '4x8ft', label: '4 × 8 feet', w: 4 * 304.8, h: 8 * 304.8 },
];

export function matchPreset(w: number, h: number): string {
  const hit = SHEET_PRESETS.find((p) => Math.abs(p.w - w) < 0.01 && Math.abs(p.h - h) < 0.01);
  return hit ? hit.id : 'custom';
}
