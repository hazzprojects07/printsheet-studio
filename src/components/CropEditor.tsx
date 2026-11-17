'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Crop, PageInfo, SourceFile, Design } from '../lib/types';
import { FULL_PAGE } from '../lib/types';
import { RenderHandle, renderCropToCanvas } from '../lib/pdfjs';
import { formatSize } from '../lib/units';
import { ptToMm } from '../lib/units';
import { Button, IntInput } from './ui';

const MIN = 0.02; // smallest crop edge as a fraction of the page

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Modal for choosing one or more rectangular card areas on a page.
 * Nothing is cropped automatically: the user draws a rectangle (or previews a regular grid) and confirms.
 */
export function CropEditor({
  file,
  page,
  existing,
  onAdd,
  onClose,
}: {
  file: SourceFile;
  page: PageInfo;
  existing: Design[];
  onAdd: (crops: Crop[]) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number } | null>(null);
  const [sel, setSel] = useState<Crop | null>(null);
  const [cols, setCols] = useState(1);
  const [rows, setRows] = useState(1);
  const [ready, setReady] = useState(false);

  const displayW = useMemo(() => {
    const maxW = typeof window === 'undefined' ? 800 : Math.min(860, window.innerWidth - 120);
    const maxH = typeof window === 'undefined' ? 600 : window.innerHeight - 280;
    const byH = (maxH * page.widthPt) / page.heightPt;
    return Math.max(260, Math.min(maxW, byH));
  }, [page]);
  const displayH = (displayW * page.heightPt) / page.widthPt;

  useEffect(() => {
    if (!canvasRef.current) return;
    const handle = new RenderHandle();
    renderCropToCanvas(file.id, page.index, canvasRef.current, FULL_PAGE, displayW, handle)
      .then(() => !handle.cancelled && setReady(true))
      .catch(() => undefined);
    return () => handle.cancel();
  }, [file.id, page.index, displayW]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const point = (e: ReactPointerEvent) => {
    const r = areaRef.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };

  const gridCrops: Crop[] = useMemo(() => {
    if (cols * rows <= 1) return [];
    const base = sel ?? FULL_PAGE;
    const out: Crop[] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        out.push({ x: base.x + (c * base.w) / cols, y: base.y + (r * base.h) / rows, w: base.w / cols, h: base.h / rows });
    return out;
  }, [cols, rows, sel]);

  const selSize = (c: Crop) => formatSize(ptToMm(c.w * page.widthPt), ptToMm(c.h * page.heightPt));
  const pct = (n: number) => `${n * 100}%`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="max-h-full overflow-auto rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h3 className="font-semibold text-gray-900">
              Select card areas – {file.name}, page {page.index + 1}
            </h3>
            <p className="text-xs text-gray-500">
              Drag a rectangle on the page, or split the area into a regular grid. Nothing is cropped until you confirm.
              Page size {selSize(FULL_PAGE)}.
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>

        <div className="flex flex-col gap-4 p-5 lg:flex-row">
          <div className="mx-auto">
            <div
              ref={areaRef}
              className="relative cursor-crosshair touch-none select-none overflow-hidden rounded border border-gray-300 bg-gray-100"
              style={{ width: displayW, height: displayH }}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                const p = point(e);
                setDrag({ x0: p.x, y0: p.y });
                setSel(null);
              }}
              onPointerMove={(e) => {
                if (!drag) return;
                const p = point(e);
                setSel({
                  x: Math.min(drag.x0, p.x),
                  y: Math.min(drag.y0, p.y),
                  w: Math.abs(p.x - drag.x0),
                  h: Math.abs(p.y - drag.y0),
                });
              }}
              onPointerUp={() => {
                setDrag(null);
                setSel((s) => (s && s.w >= MIN && s.h >= MIN ? s : null));
              }}
            >
              <canvas ref={canvasRef} style={{ width: displayW, height: displayH }} className="pointer-events-none" />
              {!ready && <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">Rendering…</div>}

              {existing.map((d, i) => (
                <div
                  key={d.id}
                  className="pointer-events-none absolute border-2 border-dashed border-emerald-500 bg-emerald-400/10"
                  style={{ left: pct(d.crop.x), top: pct(d.crop.y), width: pct(d.crop.w), height: pct(d.crop.h) }}
                  title={d.name}
                >
                  <span className="absolute left-0 top-0 bg-emerald-600 px-1 text-[10px] font-semibold text-white">{i + 1}</span>
                </div>
              ))}

              {sel && (
                <div
                  className="pointer-events-none absolute border-2 border-indigo-600 bg-indigo-500/15"
                  style={{ left: pct(sel.x), top: pct(sel.y), width: pct(sel.w), height: pct(sel.h) }}
                />
              )}
              {gridCrops.map((c, i) => (
                <div
                  key={i}
                  className="pointer-events-none absolute border border-fuchsia-600 bg-fuchsia-400/10"
                  style={{ left: pct(c.x), top: pct(c.y), width: pct(c.w), height: pct(c.h) }}
                />
              ))}
            </div>
          </div>

          <div className="w-full shrink-0 space-y-4 lg:w-72">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-sm font-medium text-gray-800">Whole page</div>
              <p className="mb-2 text-xs text-gray-500">The entire page is one card ({selSize(FULL_PAGE)}).</p>
              <Button size="sm" onClick={() => onAdd([FULL_PAGE])}>
                Add whole page as card
              </Button>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-sm font-medium text-gray-800">Drawn rectangle</div>
              <p className="mb-2 text-xs text-gray-500">
                {sel ? `Selected area: ${selSize(sel)}` : 'Drag on the page to draw an area.'}
              </p>
              <Button size="sm" variant="primary" disabled={!sel || gridCrops.length > 0} onClick={() => sel && (onAdd([sel]), setSel(null))}>
                Add selected area as card
              </Button>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-sm font-medium text-gray-800">Split into a regular grid</div>
              <p className="mb-2 text-xs text-gray-500">
                For pages holding several equal cards. Splits the drawn rectangle (or the whole page) evenly.
              </p>
              <div className="mb-2 flex items-center gap-2 text-sm">
                <IntInput label="Columns" value={cols} min={1} max={20} className="w-16" onChange={setCols} />
                <span>×</span>
                <IntInput label="Rows" value={rows} min={1} max={20} className="w-16" onChange={setRows} />
                <span className="text-xs text-gray-500">cols × rows</span>
              </div>
              <Button
                size="sm"
                variant="primary"
                disabled={gridCrops.length === 0}
                onClick={() => {
                  onAdd(gridCrops);
                  setSel(null);
                  setCols(1);
                  setRows(1);
                }}
              >
                Add {gridCrops.length || ''} cards from grid
              </Button>
              {gridCrops.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">Each card: {selSize(gridCrops[0])}</p>
              )}
            </div>

            <p className="text-xs text-gray-500">
              {existing.length} card area{existing.length === 1 ? '' : 's'} already selected on this page (green).
            </p>
            <Button className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
