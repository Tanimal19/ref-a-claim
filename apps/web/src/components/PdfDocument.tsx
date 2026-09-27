import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { loadPdf } from "../pdfjs.ts";
import type { Highlight, PassageStart } from "./highlights.ts";
import { PdfPage } from "./PdfPage.tsx";

interface Props {
  file: File;
  /** The scrolling element the pages are fitted into. */
  scroller: HTMLElement | null;
  highlights: readonly Highlight[];
  starts: readonly PassageStart[];
  /** Called once the pages are laid out, and again whenever their size changes. */
  onLayout: () => void;
  onPainted: (pageNumber: number) => void;
}

interface LoadedPdf {
  proxy: PDFDocumentProxy;
  /** Each page's size at scale 1, in CSS pixels. */
  pages: { width: number; height: number; userUnit: number }[];
}

const PAGE_GUTTER = 32;
const MAX_SCALE = 2;

export function PdfDocument({ file, scroller, highlights, starts, onLayout, onPainted }: Props) {
  const [pdf, setPdf] = useState<LoadedPdf>();
  const [error, setError] = useState<string>();
  const [availableWidth, setAvailableWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof loadPdf> | undefined;
    (async () => {
      const data = new Uint8Array(await file.arrayBuffer());
      if (cancelled) return;
      loadingTask = loadPdf(data);
      const proxy = await loadingTask.promise;
      const pages = await Promise.all(
        Array.from({ length: proxy.numPages }, async (_, i) => {
          const viewport = (await proxy.getPage(i + 1)).getViewport({ scale: 1 });
          return { width: viewport.width, height: viewport.height, userUnit: viewport.userUnit };
        }),
      );
      if (!cancelled) setPdf({ proxy, pages });
    })().catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [file]);

  useEffect(() => {
    if (!scroller) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry!.contentRect.width));
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scroller]);

  // One scale for the whole paper, fitting its widest page, so every page shows text at the same size.
  const scale = useMemo(() => {
    if (!pdf || availableWidth === 0) return 0;
    const widest = Math.max(...pdf.pages.map((page) => page.width));
    return Math.min(MAX_SCALE, Math.max(0.1, (availableWidth - 2 * PAGE_GUTTER) / widest));
  }, [pdf, availableWidth]);

  const laidOut = useEffectEvent(onLayout);
  useEffect(() => {
    if (pdf && scale > 0) laidOut();
  }, [pdf, scale]);

  const highlightsByPage = useMemo(() => byPage(highlights), [highlights]);
  const startsByPage = useMemo(() => byPage(starts), [starts]);

  if (error) return <p className="error document-status">The paper could not be shown: {error}</p>;
  if (!pdf) return <p className="document-status">Loading…</p>;
  if (scale === 0) return null;
  return (
    <div className="pdf-pages">
      {pdf.pages.map((size, i) => {
        const pageNumber = i + 1;
        return (
          <PdfPage
            key={pageNumber}
            pdf={pdf.proxy}
            pageNumber={pageNumber}
            scale={scale}
            userUnit={size.userUnit}
            width={Math.floor(size.width * scale)}
            height={Math.floor(size.height * scale)}
            root={scroller}
            highlights={highlightsByPage.get(pageNumber) ?? NO_HIGHLIGHTS}
            passageStarts={startsByPage.get(pageNumber) ?? NO_STARTS}
            onPainted={onPainted}
          />
        );
      })}
    </div>
  );
}

const NO_HIGHLIGHTS: readonly Highlight[] = [];
const NO_STARTS: readonly PassageStart[] = [];

function byPage<T extends { page?: number }>(entries: readonly T[]): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const entry of entries) {
    if (entry.page === undefined) continue;
    let onPage = grouped.get(entry.page);
    if (!onPage) grouped.set(entry.page, (onPage = []));
    onPage.push(entry);
  }
  return grouped;
}
