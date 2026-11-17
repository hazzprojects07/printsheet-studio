'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasMixedSizes } from '../lib/inspect';
import { planAll, type DesignGeometry } from '../lib/layout';
import { OpenPdfError, openPdf, releaseFile, renderCropToDataUrl } from '../lib/pdfjs';
import { buildManufacturingPdf, ExportError, type ExportReport } from '../lib/pdfExport';
import {
  DEFAULT_SETTINGS,
  FULL_PAGE,
  isFullPage,
  type Crop,
  type Design,
  type LayoutSettings,
  type PageInfo,
  type SourceFile,
  type Unit,
} from '../lib/types';
import { formatSize, ptToMm } from '../lib/units';
import { CardsTable, type DesignRow } from './CardsTable';
import { ConfigSection } from './ConfigSection';
import { CropEditor } from './CropEditor';
import { SheetPreview } from './SheetPreview';
import { UploadSection } from './UploadSection';
import { Button, Notice, Section } from './ui';

let counter = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;
const stripExt = (n: string) => n.replace(/\.pdf$/i, '');

export default function Workspace() {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [settings, setSettings] = useState<LayoutSettings>(DEFAULT_SETTINGS);
  const [unit, setUnit] = useState<Unit>('mm');
  const [arranged, setArranged] = useState(false);
  const [cropTarget, setCropTarget] = useState<{ fileId: string; pageIndex: number } | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState<{ done: number; total: number; label: string } | null>(null);
  const [report, setReport] = useState<(Omit<ExportReport, 'bytes'> & { fileName: string; at: number }) | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const filesRef = useRef(files);
  filesRef.current = files;
  const previewsRequested = useRef(new Set<string>());

  const patchSettings = useCallback((p: Partial<LayoutSettings>) => setSettings((s) => ({ ...s, ...p })), []);

  // ------------------------------------------------------------ files
  const addFiles = useCallback(async (list: File[]) => {
    const pdfs = list.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    const skipped = list.filter((f) => !pdfs.includes(f)).map((f) => f.name);
    setRejected(skipped.length ? [`Ignored (not PDF): ${skipped.join(', ')}`] : []);
    for (const f of pdfs) {
      const id = uid('f');
      const base: SourceFile = {
        id, name: f.name, sizeBytes: f.size, bytes: null, status: 'reading', progress: 0, pageCount: 0, pages: [], mixedSizes: false,
      };
      setFiles((prev) => [...prev, base]);
      const update = (p: Partial<SourceFile>) => setFiles((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        if (!filesRef.current.some((x) => x.id === id)) continue; // removed while loading
        const pages = await openPdf(id, bytes, (d, t) => update({ progress: d / t }));
        if (!filesRef.current.some((x) => x.id === id)) {
          releaseFile(id);
          continue;
        }
        update({ bytes, pages, pageCount: pages.length, mixedSizes: hasMixedSizes(pages), status: 'ready', progress: 1 });
      } catch (e) {
        update({ status: 'error', error: e instanceof OpenPdfError || e instanceof Error ? e.message : 'Unknown error' });
      }
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    releaseFile(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setDesigns((prev) => prev.filter((d) => d.fileId !== id));
  }, []);

  useEffect(() => () => filesRef.current.forEach((f) => releaseFile(f.id)), []);

  // ------------------------------------------------------------ designs
  const pageOf = useCallback(
    (fileId: string, pageIndex: number): PageInfo | undefined => files.find((f) => f.id === fileId)?.pages[pageIndex],
    [files],
  );

  const makeDesign = (file: SourceFile, page: PageInfo, crop: Crop, suffix = ''): Design => ({
    id: uid('d'),
    name: `${stripExt(file.name)} – p${page.index + 1}${suffix}`,
    fileId: file.id,
    fileName: file.name,
    pageIndex: page.index,
    crop,
    qty: 1,
  });

  const toggleWholePage = (file: SourceFile, page: PageInfo) =>
    setDesigns((prev) => {
      const existing = prev.find((d) => d.fileId === file.id && d.pageIndex === page.index && isFullPage(d.crop));
      return existing ? prev.filter((d) => d !== existing) : [...prev, makeDesign(file, page, FULL_PAGE)];
    });

  const importAll = (file: SourceFile) =>
    setDesigns((prev) => {
      const add = file.pages
        .filter((p) => !prev.some((d) => d.fileId === file.id && d.pageIndex === p.index && isFullPage(d.crop)))
        .map((p) => makeDesign(file, p, FULL_PAGE));
      return [...prev, ...add];
    });

  const addCrops = (fileId: string, pageIndex: number, crops: Crop[]) => {
    const file = files.find((f) => f.id === fileId);
    const page = file?.pages[pageIndex];
    if (!file || !page) return;
    setDesigns((prev) => {
      const onPage = prev.filter((d) => d.fileId === fileId && d.pageIndex === pageIndex && !isFullPage(d.crop)).length;
      const add = crops.map((c, i) =>
        isFullPage(c) ? makeDesign(file, page, c) : makeDesign(file, page, c, ` area ${onPage + i + 1}`),
      );
      const existingWhole = prev.some((d) => d.fileId === fileId && d.pageIndex === pageIndex && isFullPage(d.crop));
      return [...prev, ...add.filter((a) => !(isFullPage(a.crop) && existingWhole))];
    });
  };

  const patchDesign = (id: string, patch: Partial<Design>) =>
    setDesigns((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  // ------------------------------------------------------------ previews (lazy, cached)
  useEffect(() => {
    let cancelled = false;
    designs.forEach((d) => {
      if (previewsRequested.current.has(d.id)) return;
      previewsRequested.current.add(d.id);
      renderCropToDataUrl(d.fileId, d.pageIndex, d.crop, 360)
        .then((url) => !cancelled && url && setPreviews((p) => ({ ...p, [d.id]: url })))
        .catch(() => previewsRequested.current.delete(d.id));
    });
    return () => {
      cancelled = true;
    };
  }, [designs]);

  // ------------------------------------------------------------ geometry + layout (recomputed on every change)
  const rows: DesignRow[] = useMemo(
    () =>
      designs.map((d) => {
        const p = pageOf(d.fileId, d.pageIndex);
        return {
          design: d,
          srcW: p ? ptToMm(p.widthPt * d.crop.w) : null,
          srcH: p ? ptToMm(p.heightPt * d.crop.h) : null,
        };
      }),
    [designs, pageOf],
  );

  const geoms: DesignGeometry[] = useMemo(
    () =>
      rows
        .filter((r) => r.srcW && r.srcH)
        .map((r) => ({ id: r.design.id, name: r.design.name, srcW: r.srcW!, srcH: r.srcH!, qty: r.design.qty })),
    [rows],
  );

  const layout = useMemo(() => planAll(geoms, settings), [geoms, settings]);
  const totalQty = designs.reduce((n, d) => n + d.qty, 0);
  const names = useMemo(() => Object.fromEntries(designs.map((d) => [d.id, d.name])), [designs]);
  const canArrange = designs.length > 0 && totalQty > 0;

  // invalidate any previous download result when the layout inputs change
  useEffect(() => {
    setReport(null);
    setExportError(null);
  }, [layout]);

  useEffect(() => {
    if (designs.length === 0) setArranged(false);
  }, [designs.length]);

  // ------------------------------------------------------------ export
  const download = async () => {
    setExportError(null);
    setReport(null);
    setExporting({ done: 0, total: layout.pack.sheets.length, label: 'Starting…' });
    try {
      const sources = new Map<string, Uint8Array>();
      files.forEach((f) => f.bytes && sources.set(f.id, f.bytes));
      const res = await buildManufacturingPdf({
        layout,
        designs,
        sources,
        sheetW: settings.sheetW,
        sheetH: settings.sheetH,
        cuttingMarks: settings.cuttingMarks,
        gapX: settings.gapX,
        gapY: settings.gapY,
        onProgress: (done, total, label) => setExporting({ done, total, label }),
      });
      const fileName = `printsheet-${new Date().toISOString().slice(0, 10)}-${res.sheets}sheets.pdf`;
      if (!res.verification.ok) {
        setExportError(`The generated PDF failed its self-check, so it was not downloaded. ${res.verification.messages.join(' ')}`);
        return;
      }
      const url = URL.createObjectURL(new Blob([res.bytes as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      const { bytes: _bytes, ...rest } = res;
      setReport({ ...rest, fileName, at: Date.now() });
    } catch (e) {
      setExportError(e instanceof ExportError || e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setExporting(null);
    }
  };

  const cropFile = cropTarget ? files.find((f) => f.id === cropTarget.fileId) : undefined;
  const cropPage = cropFile && cropTarget ? cropFile.pages[cropTarget.pageIndex] : undefined;
  const readyFiles = files.filter((f) => f.status === 'ready').length;

  const steps = [
    { n: 1, t: 'Upload PDFs', done: readyFiles > 0, href: '#step-1' },
    { n: 2, t: 'Configure Sheet', done: canArrange, href: '#step-2' },
    { n: 3, t: 'Automatic Arrangement', done: arranged && layout.valid, href: '#step-3' },
    { n: 4, t: 'Download PDF', done: !!report, href: '#step-4' },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">PrintSheet Studio</h1>
          <p className="text-sm text-gray-500">Arrange card designs from PDFs onto manufacturing sheets. Everything runs locally in your browser.</p>
        </div>
        <ol className="flex flex-wrap gap-2 text-xs">
          {steps.map((s) => (
            <li key={s.n}>
              <a
                href={s.href}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 font-medium ${
                  s.done ? 'border-green-300 bg-green-50 text-green-800' : 'border-gray-300 bg-white text-gray-600'
                }`}
              >
                <span className="font-bold">{s.done ? '✓' : s.n}</span> {s.t}
              </a>
            </li>
          ))}
        </ol>
      </header>

      <Section id="step-1" step={1} title="Upload PDFs" subtitle="Add the PDFs that contain your card designs, then choose which pages (or areas of a page) are cards.">
        <UploadSection
          files={files}
          designs={designs}
          cardW={settings.cardW}
          cardH={settings.cardH}
          onFiles={addFiles}
          onRemoveFile={removeFile}
          onToggleWholePage={toggleWholePage}
          onImportAll={importAll}
          onOpenCrop={(f, p) => setCropTarget({ fileId: f.id, pageIndex: p.index })}
        />
        {rejected.map((r) => (
          <div key={r} className="mt-3">
            <Notice tone="warning">{r}</Notice>
          </div>
        ))}
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Selected cards – names and quantities</h3>
          <CardsTable
            rows={rows}
            previews={previews}
            onChange={patchDesign}
            onRemove={(id) => setDesigns((p) => p.filter((d) => d.id !== id))}
            onSetAllQty={(q) => setDesigns((p) => p.map((d) => ({ ...d, qty: q })))}
            onClearAll={() => setDesigns([])}
          />
        </div>
      </Section>

      <Section id="step-2" step={2} title="Configure Sheet" subtitle="Card size, sheet size, margins and spacing. Defaults: 114.3 mm card, 3 mm gaps, 10 mm margins.">
        <ConfigSection settings={settings} unit={unit} onUnit={setUnit} onChange={patchSettings} />
      </Section>

      <Section
        id="step-3"
        step={3}
        title="Automatic Arrangement"
        subtitle="One click calculates how many cards fit and fills as many sheets as needed. After that, the preview updates automatically whenever you change something."
      >
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Button variant="primary" size="lg" disabled={!canArrange} onClick={() => setArranged(true)} data-testid="arrange">
            AUTOMATICALLY ARRANGE
          </Button>
          {!canArrange && <span className="text-sm text-gray-500">Select at least one card with a quantity above zero first.</span>}
          {arranged && canArrange && <span className="text-sm text-gray-500">Live – the layout recalculates when you edit anything above.</span>}
        </div>

        {arranged && canArrange && (
          <div className="space-y-4">
            {layout.errors.map((e, i) => (
              <Notice key={i} tone="error" title={i === 0 ? 'Cannot arrange' : undefined}>
                {e}
              </Notice>
            ))}
            {layout.warnings.length > 0 && (
              <Notice tone="warning" title="Artwork is not the same size / shape as the card">
                <ul className="ml-4 list-disc">
                  {layout.warnings.slice(0, 8).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                  {layout.warnings.length > 8 && <li>…and {layout.warnings.length - 8} more.</li>}
                </ul>
              </Notice>
            )}
            {layout.pack.sheets.length > 0 && layout.errors.length === 0 && (
              <SheetPreview layout={layout} settings={settings} unit={unit} previews={previews} names={names} />
            )}
          </div>
        )}
      </Section>

      <Section id="step-4" step={4} title="Download PDF" subtitle="Builds the manufacturing PDF from your original files (vector artwork stays vector) and checks it before download.">
        {!arranged || !canArrange ? (
          <p className="text-sm text-gray-500">Arrange the cards first (step 3).</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Summary label="Total sheets" value={layout.stats.sheetCount} />
              <Summary label="Cards placed" value={layout.stats.totalPlaced} />
              <Summary label="Quantity requested" value={layout.stats.totalRequested} />
              <Summary
                label="Unplaced cards"
                value={Math.max(0, layout.stats.totalRequested - layout.stats.totalPlaced)}
                bad={layout.stats.totalRequested !== layout.stats.totalPlaced}
              />
            </div>
            <ValidationList layout={layout} />
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="primary" size="lg" disabled={!layout.valid || !!exporting} onClick={download} data-testid="download">
                {exporting ? 'Generating…' : 'DOWNLOAD MANUFACTURING PDF'}
              </Button>
              {layout.valid && layout.stats.sheetCount > 0 && (
                <span className="text-sm text-gray-500">
                  {layout.stats.sheetCount} page{layout.stats.sheetCount === 1 ? '' : 's'}, each exactly{' '}
                  {formatSize(settings.sheetW, settings.sheetH, unit)}
                </span>
              )}
            </div>
            {exporting && (
              <div>
                <div className="h-2 overflow-hidden rounded bg-gray-200">
                  <div className="h-full bg-indigo-600 transition-all" style={{ width: `${(exporting.done / Math.max(1, exporting.total)) * 100}%` }} />
                </div>
                <div className="mt-1 text-xs text-gray-500">{exporting.label}</div>
              </div>
            )}
            {exportError && (
              <Notice tone="error" title="Export problem">
                {exportError}
              </Notice>
            )}
            {report && (
              <Notice tone="success" title="Manufacturing PDF downloaded">
                {report.fileName} – {report.sheets} sheet{report.sheets === 1 ? '' : 's'}, {report.cardsPlaced} cards. The file was re-opened and checked:
                page count and physical page size are correct.
                {report.limitations.length > 0 && (
                  <ul className="ml-4 mt-2 list-disc text-amber-900">
                    {report.limitations.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                )}
              </Notice>
            )}
          </div>
        )}
      </Section>

      {cropFile && cropPage && cropTarget && (
        <CropEditor
          file={cropFile}
          page={cropPage}
          existing={designs.filter((d) => d.fileId === cropFile.id && d.pageIndex === cropPage.index)}
          onAdd={(crops) => addCrops(cropTarget.fileId, cropTarget.pageIndex, crops)}
          onClose={() => setCropTarget(null)}
        />
      )}
    </main>
  );
}

function Summary({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${bad ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${bad ? 'text-red-700' : 'text-gray-900'}`}>{value}</div>
    </div>
  );
}

function ValidationList({ layout }: { layout: ReturnType<typeof planAll> }) {
  if (layout.errors.length > 0) {
    return (
      <Notice tone="error" title="Export is blocked until these are fixed">
        <ul className="ml-4 list-disc">
          {layout.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </Notice>
    );
  }
  return (
    <Notice tone="success" title="Validation passed">
      Every requested card is placed · no overlaps · inside the margins · spacing respected · card sizes exact · artwork not distorted.
    </Notice>
  );
}
