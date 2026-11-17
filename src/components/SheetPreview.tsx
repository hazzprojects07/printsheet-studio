'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlannedLayout } from '../lib/layout';
import { cuttingMarkLines } from '../lib/marks';
import type { LayoutSettings, Unit } from '../lib/types';
import { formatLength, formatNumber } from '../lib/units';
import { Button, Stat } from './ui';

const COLORS = ['#c7d2fe', '#fde68a', '#a7f3d0', '#fecaca', '#ddd6fe', '#bae6fd', '#fbcfe8', '#d9f99d'];

export function SheetPreview({
  layout,
  settings,
  unit,
  previews,
  names,
}: {
  layout: PlannedLayout;
  settings: LayoutSettings;
  unit: Unit;
  previews: Record<string, string>;
  names: Record<string, string>;
}) {
  const s = settings;
  const [sheetIdx, setSheetIdx] = useState(0);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [showNames, setShowNames] = useState(false);
  const [showMarks, setShowMarks] = useState(s.cuttingMarks);
  const [showImages, setShowImages] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(900);

  useEffect(() => setShowMarks(s.cuttingMarks), [s.cuttingMarks]);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const total = layout.pack.sheets.length;
  const idx = Math.min(sheetIdx, Math.max(0, total - 1));
  const sheet = layout.pack.sheets[idx];

  const colorFor = useMemo(() => {
    const map = new Map<string, string>();
    layout.items.forEach((it, i) => map.set(it.id, COLORS[i % COLORS.length]));
    return (id: string) => map.get(id) ?? '#e5e7eb';
  }, [layout.items]);

  const marks = useMemo(
    () => (sheet && showMarks ? cuttingMarkLines(sheet.placements, s.sheetW, s.sheetH, s.gapX, s.gapY) : { lines: [] }),
    [sheet, showMarks, s.sheetW, s.sheetH, s.gapX, s.gapY],
  );

  if (!sheet) return null;

  const fitW = Math.max(300, boxW - 2);
  const fitScale = Math.min(fitW / s.sheetW, 640 / s.sheetH); // px per mm
  const scale = zoom === 'fit' ? fitScale : fitScale * zoom;
  const pxW = s.sheetW * scale;
  const pxH = s.sheetH * scale;
  const zoomPct = Math.round((zoom === 'fit' ? 1 : zoom) * 100);
  const step = (f: number) => setZoom(Math.min(8, Math.max(0.25, (zoom === 'fit' ? 1 : zoom) * f)));

  const st = layout.stats;
  const perSheet =
    layout.pack.capacityPerSheet != null
      ? String(layout.pack.capacityPerSheet)
      : layout.pack.minPerSheet === layout.pack.maxPerSheet
        ? String(layout.pack.maxPerSheet)
        : `up to ${layout.pack.maxPerSheet}`;

  const sheetsList = layout.pack.sheets.map((sh) => sh.placements.length);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="summary">
        <Stat label="Total designs" value={st.totalDesigns} />
        <Stat label="Cards requested" value={st.totalRequested} sub={`${st.totalPlaced} placed`} />
        <Stat label="Cards per sheet" value={perSheet} sub={layout.pack.algorithm === 'maxrects' ? 'mixed sizes (heuristic)' : undefined} />
        <Stat label="Number of sheets" value={st.sheetCount} />
        <Stat label="Unused sheet area" value={`${formatNumber(st.unusedPercent, 1)}%`} sub="incl. margins and gaps" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-600">
        Sheet {formatLength(s.sheetW, unit)} × {formatLength(s.sheetH, unit)}
        {layout.pack.notes.length > 0 && <> · {layout.pack.notes.join(' ')}</>}
        {' '}· Sheets: {sheetsList.length <= 12 ? sheetsList.map((n, i) => `${i + 1}: ${n}`).join(', ') : `${sheetsList.length} sheets, ${layout.pack.minPerSheet}–${layout.pack.maxPerSheet} cards each`}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={idx === 0} onClick={() => setSheetIdx(idx - 1)} aria-label="Previous sheet">
          ◀ Prev
        </Button>
        <span className="min-w-[8rem] text-center text-sm font-medium" data-testid="sheet-label">
          Sheet {idx + 1} of {total} · {sheet.placements.length} cards
        </span>
        <Button size="sm" disabled={idx >= total - 1} onClick={() => setSheetIdx(idx + 1)} aria-label="Next sheet">
          Next ▶
        </Button>
        <span className="mx-2 h-5 w-px bg-gray-300" />
        <Button size="sm" onClick={() => step(1 / 1.25)} aria-label="Zoom out">
          −
        </Button>
        <span className="w-12 text-center text-sm tabular-nums">{zoomPct}%</span>
        <Button size="sm" onClick={() => step(1.25)} aria-label="Zoom in">
          +
        </Button>
        <Button size="sm" onClick={() => setZoom('fit')}>
          Fit to screen
        </Button>
        <span className="mx-2 h-5 w-px bg-gray-300" />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={showMarks} onChange={(e) => setShowMarks(e.target.checked)} /> Cutting marks
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} /> Names
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={showImages} onChange={(e) => setShowImages(e.target.checked)} /> Artwork
        </label>
      </div>

      <div ref={box} className="overflow-auto rounded-lg border border-gray-200 bg-gray-200 p-3" style={{ maxHeight: 720 }}>
        <svg
          width={pxW}
          height={pxH}
          viewBox={`0 0 ${s.sheetW} ${s.sheetH}`}
          className="mx-auto block bg-white shadow"
          role="img"
          aria-label={`Sheet ${idx + 1} layout`}
          data-testid="sheet-svg"
        >
          <rect x={0} y={0} width={s.sheetW} height={s.sheetH} fill="#fff" />
          {/* margins */}
          <rect
            x={s.marginLeft}
            y={s.marginTop}
            width={s.sheetW - s.marginLeft - s.marginRight}
            height={s.sheetH - s.marginTop - s.marginBottom}
            fill="none"
            stroke="#f43f5e"
            strokeWidth={0.35}
            strokeDasharray="2 1.5"
            vectorEffect="non-scaling-stroke"
            style={{ strokeWidth: 1 }}
          />
          {sheet.placements.map((p, i) => {
            const a = layout.art[p.itemId];
            const img = previews[p.itemId];
            // artwork rectangle inside the card cell (nominal frame), then rotate with the card
            let art: { x: number; y: number; w: number; h: number } | null = null;
            if (a) {
              const f = a.fit;
              const nominal = { x: f.offsetX, y: f.offsetY, w: f.drawW, h: f.drawH };
              art = p.rotated
                ? { x: p.x + nominal.y, y: p.y + a.cellW - nominal.x - nominal.w, w: nominal.h, h: nominal.w }
                : { x: p.x + nominal.x, y: p.y + nominal.y, w: nominal.w, h: nominal.h };
            }
            const cx = `clip-${idx}-${i}`;
            return (
              <g key={`${p.itemId}-${p.copy}`}>
                <clipPath id={cx}>
                  <rect x={p.x} y={p.y} width={p.w} height={p.h} />
                </clipPath>
                <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={colorFor(p.itemId)} />
                {showImages && img && art && (
                  <g clipPath={`url(#${cx})`}>
                    {p.rotated ? (
                      <image
                        href={img}
                        x={0}
                        y={0}
                        width={a!.fit.drawW}
                        height={a!.fit.drawH}
                        preserveAspectRatio="none"
                        transform={`translate(${p.x + a!.fit.offsetY} ${p.y + a!.cellW - a!.fit.offsetX}) rotate(-90)`}
                      />
                    ) : (
                      <image href={img} x={art.x} y={art.y} width={art.w} height={art.h} preserveAspectRatio="none" />
                    )}
                  </g>
                )}
                <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="none" stroke="#4f46e5" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                {showNames && (
                  <text
                    x={p.x + p.w / 2}
                    y={p.y + p.h / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.max(2, Math.min(p.w, p.h) / 7)}
                    fill="#111827"
                    stroke="#fff"
                    strokeWidth={0.6}
                    paintOrder="stroke"
                  >
                    {names[p.itemId] ?? ''}
                  </text>
                )}
              </g>
            );
          })}
          {marks.lines.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#000" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
      <p className="text-xs text-gray-500">
        Red dashed line = margins · blue outline = card boundary · the preview is for checking the layout; the downloaded PDF uses the original
        vector artwork.
      </p>
    </div>
  );
}
