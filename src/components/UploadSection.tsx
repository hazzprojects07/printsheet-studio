'use client';

import { useRef, useState, type DragEvent } from 'react';
import { formatBytes, guessCards } from '../lib/inspect';
import { isFullPage, type Design, type PageInfo, type SourceFile } from '../lib/types';
import { formatSize, ptToMm } from '../lib/units';
import { PageThumb } from './PageThumb';
import { Button, Notice } from './ui';

export function UploadSection({
  files,
  designs,
  cardW,
  cardH,
  onFiles,
  onRemoveFile,
  onToggleWholePage,
  onImportAll,
  onOpenCrop,
}: {
  files: SourceFile[];
  designs: Design[];
  cardW: number;
  cardH: number;
  onFiles: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  onToggleWholePage: (file: SourceFile, page: PageInfo) => void;
  onImportAll: (file: SourceFile) => void;
  onOpenCrop: (file: SourceFile, page: PageInfo) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    onFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
          over ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/40'
        }`}
      >
        <div className="text-base font-medium text-gray-800">
          Drop PDF files here, or <span className="text-indigo-600 underline">browse</span>
        </div>
        <div className="mt-1 text-sm text-gray-500">
          Several files at once. You can add more later. Files stay on your computer – nothing is uploaded.
        </div>
        <input
          ref={input}
          data-testid="file-input"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>

      {files.map((f) => (
        <FilePanel
          key={f.id}
          file={f}
          designs={designs.filter((d) => d.fileId === f.id)}
          cardW={cardW}
          cardH={cardH}
          onRemove={() => onRemoveFile(f.id)}
          onToggleWholePage={(p) => onToggleWholePage(f, p)}
          onImportAll={() => onImportAll(f)}
          onOpenCrop={(p) => onOpenCrop(f, p)}
        />
      ))}
    </div>
  );
}

function FilePanel({
  file,
  designs,
  cardW,
  cardH,
  onRemove,
  onToggleWholePage,
  onImportAll,
  onOpenCrop,
}: {
  file: SourceFile;
  designs: Design[];
  cardW: number;
  cardH: number;
  onRemove: () => void;
  onToggleWholePage: (p: PageInfo) => void;
  onImportAll: () => void;
  onOpenCrop: (p: PageInfo) => void;
}) {
  const [open, setOpen] = useState(true);
  const ready = file.status === 'ready';
  const allWhole = ready && file.pages.every((p) => designs.some((d) => d.pageIndex === p.index && isFullPage(d.crop)));
  const guesses = ready ? file.pages.map((p) => guessCards(p, cardW, cardH)) : [];
  const looksSingle = ready && guesses.length > 0 && guesses.every((g) => g.kind === 'single');

  return (
    <div className="rounded-lg border border-gray-200" data-testid="file-panel">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button type="button" className="text-gray-400 hover:text-gray-700" onClick={() => setOpen(!open)} aria-label="Toggle pages">
          {open ? '▾' : '▸'}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-gray-900" title={file.name}>
            {file.name}
          </div>
          <div className="text-xs text-gray-500">
            {formatBytes(file.sizeBytes)}
            {ready && ` · ${file.pageCount} page${file.pageCount === 1 ? '' : 's'}`}
            {ready && file.pages[0] && !file.mixedSizes && ` · ${formatSize(ptToMm(file.pages[0].widthPt), ptToMm(file.pages[0].heightPt))} (${file.pages[0].orientation})`}
          </div>
        </div>
        <StatusBadge file={file} />
        {ready && (
          <Button size="sm" variant={looksSingle ? 'primary' : 'secondary'} disabled={allWhole} onClick={onImportAll}>
            {allWhole ? 'All pages imported' : `Import all ${file.pageCount} pages as cards`}
          </Button>
        )}
        <Button size="sm" variant="danger" onClick={onRemove}>
          Remove
        </Button>
      </div>

      {file.status === 'error' && (
        <div className="px-4 pb-3">
          <Notice tone="error" title="Could not import this file">
            {file.error}
          </Notice>
        </div>
      )}

      {ready && file.mixedSizes && (
        <div className="px-4 pb-3">
          <Notice tone="warning" title="Pages have different dimensions">
            Check each page below – its size is shown under the thumbnail.
          </Notice>
        </div>
      )}

      {ready && open && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4 border-t border-gray-100 p-4">
          {file.pages.map((p, i) => {
            const pageDesigns = designs.filter((d) => d.pageIndex === p.index);
            const whole = pageDesigns.find((d) => isFullPage(d.crop));
            const g = guesses[i];
            return (
              <div key={p.index} className="flex flex-col gap-2" data-testid="page-card">
                <div className="relative">
                  <PageThumb fileId={file.id} pageIndex={p.index} />
                  {pageDesigns.length > 0 && (
                    <span className="absolute right-1 top-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {pageDesigns.length} card{pageDesigns.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-600">
                  <div className="font-medium text-gray-800">Page {p.index + 1}</div>
                  <div>
                    {formatSize(ptToMm(p.widthPt), ptToMm(p.heightPt))} · {p.orientation}
                    {p.rotation ? ` · rotated ${p.rotation}°` : ''}
                  </div>
                  <div className={g.kind === 'multiple' ? 'font-medium text-amber-700' : g.kind === 'single' ? 'text-emerald-700' : 'text-gray-500'}>
                    {g.label}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant={whole ? 'secondary' : 'primary'} onClick={() => onToggleWholePage(p)}>
                    {whole ? '✓ Added' : 'Use page'}
                  </Button>
                  <Button size="sm" onClick={() => onOpenCrop(p)}>
                    Crop…
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ file }: { file: SourceFile }) {
  if (file.status === 'reading') {
    return (
      <span className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
        Reading… {Math.round(file.progress * 100)}%
      </span>
    );
  }
  if (file.status === 'error') {
    return <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">Failed</span>;
  }
  return <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">Imported</span>;
}
