import type { Unit } from './types';

export const UNITS: { id: Unit; label: string }[] = [
  { id: 'mm', label: 'Millimetres (mm)' },
  { id: 'cm', label: 'Centimetres (cm)' },
  { id: 'in', label: 'Inches (in)' },
  { id: 'ft', label: 'Feet (ft)' },
];

export const MM_PER_UNIT: Record<Unit, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  ft: 304.8,
};

/** PDF points per millimetre (1 pt = 1/72 inch). */
export const PT_PER_MM = 72 / 25.4;

export const toMm = (value: number, unit: Unit): number => value * MM_PER_UNIT[unit];
export const fromMm = (mm: number, unit: Unit): number => mm / MM_PER_UNIT[unit];
export const mmToPt = (mm: number): number => mm * PT_PER_MM;
export const ptToMm = (pt: number): number => pt / PT_PER_MM;

/** Format a number, trimming trailing zeros ("114.30" -> "114.3"). */
export function formatNumber(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '–';
  return String(Number(n.toFixed(digits)));
}

export function formatLength(mm: number, unit: Unit, digits?: number): string {
  const d = digits ?? (unit === 'mm' ? 2 : 3);
  return `${formatNumber(fromMm(mm, unit), d)} ${unit}`;
}

export function formatSize(wMm: number, hMm: number, unit: Unit = 'mm'): string {
  const d = unit === 'mm' ? 1 : 2;
  return `${formatNumber(fromMm(wMm, unit), d)} × ${formatNumber(fromMm(hMm, unit), d)} ${unit}`;
}
