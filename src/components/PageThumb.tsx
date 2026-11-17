'use client';

import { useEffect, useRef, useState } from 'react';
import { FULL_PAGE } from '../lib/types';
import { RenderHandle, renderCropToCanvas } from '../lib/pdfjs';

/** Lazily rendered page thumbnail: only renders once scrolled into view. */
export function PageThumb({ fileId, pageIndex, width = 170 }: { fileId: string; pageIndex: number; width?: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !canvas.current) return;
    const handle = new RenderHandle();
    renderCropToCanvas(fileId, pageIndex, canvas.current, FULL_PAGE, width, handle)
      .then((r) => {
        if (r && !handle.cancelled) setHeight(r.cssHeight);
      })
      .catch(() => undefined);
    return () => handle.cancel();
  }, [visible, fileId, pageIndex, width]);

  return (
    <div
      ref={holder}
      className="flex items-center justify-center overflow-hidden rounded border border-gray-200 bg-gray-100"
      style={{ width, minHeight: height ?? width }}
    >
      <canvas ref={canvas} style={{ width, height: height ?? undefined, display: visible ? 'block' : 'none' }} />
      {!visible && <span className="text-xs text-gray-400">Page {pageIndex + 1}</span>}
    </div>
  );
}
