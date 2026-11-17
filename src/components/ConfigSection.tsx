'use client';

import { gridCapacity, availableArea } from '../lib/packing';
import { SHEET_PRESETS, matchPreset } from '../lib/presets';
import type { LayoutSettings, Unit } from '../lib/types';
import { UNITS, formatLength } from '../lib/units';
import { Button, Field, MeasureInput, Notice, inputClass } from './ui';

export function ConfigSection({
  settings,
  unit,
  onUnit,
  onChange,
}: {
  settings: LayoutSettings;
  unit: Unit;
  onUnit: (u: Unit) => void;
  onChange: (patch: Partial<LayoutSettings>) => void;
}) {
  const s = settings;
  const preset = matchPreset(s.sheetW, s.sheetH);
  const avail = availableArea({ ...s, arrangeMode: 'mixed', allowRotate: s.allowRotate });
  const quick =
    s.cardSizeMode === 'common' && avail.w > 0 && avail.h > 0
      ? gridCapacity(avail.w, avail.h, s.cardW, s.cardH, s.gapX, s.gapY, s.allowRotate)
      : null;

  const setCardW = (mm: number) => {
    if (s.lockAspect && s.cardW > 0) onChange({ cardW: mm, cardH: (mm * s.cardH) / s.cardW });
    else onChange({ cardW: mm });
  };
  const setCardH = (mm: number) => {
    if (s.lockAspect && s.cardH > 0) onChange({ cardH: mm, cardW: (mm * s.cardW) / s.cardH });
    else onChange({ cardH: mm });
  };
  const setAllMargins = (mm: number) =>
    onChange({ marginTop: mm, marginRight: mm, marginBottom: mm, marginLeft: mm });
  const allEqual = s.marginTop === s.marginRight && s.marginTop === s.marginBottom && s.marginTop === s.marginLeft;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-56">
          <Field label="Measurement unit">
            <select className={inputClass} value={unit} onChange={(e) => onUnit(e.target.value as Unit)} aria-label="Measurement unit">
              {UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="pb-2 text-xs text-gray-500">The unit applies to every size below. Values are stored exactly (in mm) – changing unit never rounds them.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------------- sheet */}
        <fieldset className="space-y-3 rounded-lg border border-gray-200 p-4">
          <legend className="px-1 text-sm font-semibold text-gray-800">Manufacturing sheet</legend>
          <Field label="Sheet size">
            <select
              className={inputClass}
              aria-label="Sheet size"
              value={preset}
              onChange={(e) => {
                const p = SHEET_PRESETS.find((x) => x.id === e.target.value);
                if (p) onChange({ sheetW: p.w, sheetH: p.h });
              }}
            >
              {SHEET_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom size…</option>
            </select>
          </Field>
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
            <MeasureInput label="Sheet width" valueMm={s.sheetW} unit={unit} positive onChange={(v) => onChange({ sheetW: v })} />
            <MeasureInput label="Sheet height" valueMm={s.sheetH} unit={unit} positive onChange={(v) => onChange({ sheetH: v })} />
            <Button size="md" title="Swap width and height" onClick={() => onChange({ sheetW: s.sheetH, sheetH: s.sheetW })}>
              ⇄ Swap
            </Button>
          </div>

          <div className="pt-1 text-xs font-medium text-gray-600">Margins</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <MeasureInput label="All margins" valueMm={allEqual ? s.marginTop : 0} unit={unit} onChange={setAllMargins} hint={allEqual ? undefined : 'differ'} />
            <MeasureInput label="Top" valueMm={s.marginTop} unit={unit} onChange={(v) => onChange({ marginTop: v })} />
            <MeasureInput label="Right" valueMm={s.marginRight} unit={unit} onChange={(v) => onChange({ marginRight: v })} />
            <MeasureInput label="Bottom" valueMm={s.marginBottom} unit={unit} onChange={(v) => onChange({ marginBottom: v })} />
            <MeasureInput label="Left" valueMm={s.marginLeft} unit={unit} onChange={(v) => onChange({ marginLeft: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MeasureInput label="Horizontal gap" valueMm={s.gapX} unit={unit} onChange={(v) => onChange({ gapX: v })} />
            <MeasureInput label="Vertical gap" valueMm={s.gapY} unit={unit} onChange={(v) => onChange({ gapY: v })} />
          </div>
        </fieldset>

        {/* ---------------- cards */}
        <fieldset className="space-y-3 rounded-lg border border-gray-200 p-4">
          <legend className="px-1 text-sm font-semibold text-gray-800">Card size</legend>
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="cardSizeMode"
                checked={s.cardSizeMode === 'common'}
                onChange={() => onChange({ cardSizeMode: 'common' })}
                className="mt-1"
              />
              <span>
                <b>Set one common card size</b>
                <span className="block text-xs text-gray-500">Every design is placed on a card of this size (default 4.5 × 4.5 in = 114.3 × 114.3 mm).</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="cardSizeMode"
                checked={s.cardSizeMode === 'original'}
                onChange={() => onChange({ cardSizeMode: 'original' })}
                className="mt-1"
              />
              <span>
                <b>Use original dimensions</b>
                <span className="block text-xs text-gray-500">Each design keeps the exact size of its page / crop area (1:1, no scaling).</span>
              </span>
            </label>
          </div>

          {s.cardSizeMode === 'common' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <MeasureInput label="Card width" valueMm={s.cardW} unit={unit} positive onChange={setCardW} />
                <MeasureInput label="Card height" valueMm={s.cardH} unit={unit} positive onChange={setCardH} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={s.lockAspect} onChange={(e) => onChange({ lockAspect: e.target.checked })} />
                Lock aspect ratio when editing width / height
              </label>
              <Field label="If the artwork shape differs from the card" hint="Artwork is never stretched – only scaled uniformly.">
                <select className={inputClass} value={s.fitMode} onChange={(e) => onChange({ fitMode: e.target.value as LayoutSettings['fitMode'] })} aria-label="Artwork fit">
                  <option value="contain">Fit inside the card (nothing cut off, may leave blank space)</option>
                  <option value="cover">Fill the card (edges may be cropped)</option>
                </select>
              </Field>
            </>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.allowRotate} onChange={(e) => onChange({ allowRotate: e.target.checked })} />
            Allow rotating cards by 90° when it fits more cards
          </label>
        </fieldset>
      </div>

      <fieldset className="rounded-lg border border-gray-200 p-4">
        <legend className="px-1 text-sm font-semibold text-gray-800">Arrangement</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50">
            <input type="radio" name="arrangeMode" className="mt-1" checked={s.arrangeMode === 'mixed'} onChange={() => onChange({ arrangeMode: 'mixed' })} />
            <span>
              <b>Mixed designs</b>
              <span className="block text-xs text-gray-500">Different designs share sheets, so no space is wasted. Fewest sheets.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50">
            <input type="radio" name="arrangeMode" className="mt-1" checked={s.arrangeMode === 'group'} onChange={() => onChange({ arrangeMode: 'group' })} />
            <span>
              <b>Group by design</b>
              <span className="block text-xs text-gray-500">Each design gets its own sheet(s); identical cards stay together. May use more sheets.</span>
            </span>
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.cuttingMarks} onChange={(e) => onChange({ cuttingMarks: e.target.checked })} />
          Add thin cutting marks at card corners (needs a gap of at least 1 mm)
        </label>
      </fieldset>

      {quick && (
        <Notice tone="info" title="Live capacity check">
          Printable area {formatLength(avail.w, unit)} × {formatLength(avail.h, unit)}. Normal orientation:{' '}
          <b>
            {quick.normal.cols} × {quick.normal.rows} = {quick.normal.capacity}
          </b>
          {quick.rotated && (
            <>
              {' '}
              · rotated 90°:{' '}
              <b>
                {quick.rotated.cols} × {quick.rotated.rows} = {quick.rotated.capacity}
              </b>
            </>
          )}
          {' '}
          → <b>{quick.best.capacity} cards per sheet</b>
          {quick.best.capacity === 0 && ' – the card does not fit on this sheet.'}
        </Notice>
      )}
    </div>
  );
}
