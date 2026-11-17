'use client';

import { useState } from 'react';
import { isFullPage, type Design } from '../lib/types';
import { formatSize } from '../lib/units';
import { Button, IntInput, inputClass } from './ui';

export interface DesignRow {
  design: Design;
  /** original size of the selected artwork in mm (null if the source is missing) */
  srcW: number | null;
  srcH: number | null;
}

export function CardsTable({
  rows,
  previews,
  onChange,
  onRemove,
  onSetAllQty,
  onClearAll,
}: {
  rows: DesignRow[];
  previews: Record<string, string>;
  onChange: (id: string, patch: Partial<Design>) => void;
  onRemove: (id: string) => void;
  onSetAllQty: (qty: number) => void;
  onClearAll: () => void;
}) {
  const [bulk, setBulk] = useState(1);
  const total = rows.reduce((n, r) => n + r.design.qty, 0);

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
        No cards selected yet. Use <b>Use page</b> / <b>Import all pages</b> above, or <b>Crop…</b> for pages that hold several cards.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-700">
          <b>{rows.length}</b> design{rows.length === 1 ? '' : 's'} · <b>{total}</b> cards requested
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">Set every quantity to</span>
          <IntInput label="Bulk quantity" value={bulk} min={0} className="w-20" onChange={setBulk} />
          <Button size="sm" onClick={() => onSetAllQty(bulk)}>
            Apply
          </Button>
          <Button size="sm" variant="danger" onClick={onClearAll}>
            Clear all
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-left text-sm" data-testid="cards-table">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Preview</th>
              <th className="px-3 py-2">Design name</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Original size</th>
              <th className="px-3 py-2">Quantity</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ design: d, srcW, srcH }) => (
              <tr key={d.id} data-testid="card-row">
                <td className="px-3 py-2">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded border border-gray-200 bg-gray-100">
                    {previews[d.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previews[d.id]} alt={d.name} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-gray-400">…</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <input
                    aria-label="Design name"
                    className={`${inputClass} min-w-[12rem]`}
                    value={d.name}
                    onChange={(e) => onChange(d.id, { name: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  <div className="max-w-[14rem] truncate" title={d.fileName}>
                    {d.fileName}
                  </div>
                  <div>
                    page {d.pageIndex + 1}
                    {!isFullPage(d.crop) && ' · cropped area'}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                  {srcW && srcH ? (
                    <>
                      <div>{formatSize(srcW, srcH, 'mm')}</div>
                      <div className="text-gray-400">{formatSize(srcW, srcH, 'in')}</div>
                    </>
                  ) : (
                    '–'
                  )}
                </td>
                <td className="px-3 py-2">
                  <IntInput label="Quantity" value={d.qty} min={0} className="w-24" onChange={(n) => onChange(d.id, { qty: n })} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => onRemove(d.id)} aria-label={`Remove ${d.name}`}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
