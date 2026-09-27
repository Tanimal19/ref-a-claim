import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { loadPdf } from "../pdfjs.ts";
import { isLowConfidence, outcomeCategory, type Outcome } from "../results.ts";
import type { ParsedDocument } from "../types.ts";
import { PassageCard } from "./PassageCard.tsx";
import { PdfPage, type Highlight, type PassageStart } from "./PdfPage.tsx";

interface Props {
  document: ParsedDocument;
  /** The file `document` was read from. */
  file?: File;
  outcomes: ReadonlyMap<string, Outcome>;
  activeId?: string;
}

interface LoadedPdf {
  proxy: PDFDocumentProxy;
  /** Each page's size at scale 1, in CSS pixels. */
  pages: { width: number; height: number; userUnit: number }[];
}

const PAGE_GUTTER = 32;
const MAX_SCALE = 2;

/** Shows the original PDF with each analyzed passage tinted by its stance; unrelated passages stay untinted. */
export function DocumentView({ document, file, outcomes, activeId }: Props) {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [pdf, setPdf] = useState<LoadedPdf>();
  const [error, setError] = useState<string>();
  const [availableWidth, setAvailableWidth] = useState(0);
  const [hoveredId, setHoveredId] = useState<string>();
  // The passage to bring into view once it has been drawn; its page may not be rendered yet.
  const pendingRef = useRef<{ passageId: string; page?: number }>(undefined);
  const hoveredRef = useRef<string>(undefined);

  useEffect(() => {
    if (!file) return;
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

  const highlightsByPage = useMemo(() => {
    const byPage = new Map<number, Highlight[]>();
    for (const passage of document.passages) {
      const outcome = outcomes.get(passage.id);
      if (!outcome || passage.page === undefined || !passage.textRanges) continue;
      const category = outcomeCategory(outcome);
      // Unrelated passages get (untinted) spans only when navigated to, as scrolling to a passage looks for its spans.
      if (category === "unrelated" && passage.id !== activeId) continue;
      let highlights = byPage.get(passage.page);
      if (!highlights) byPage.set(passage.page, (highlights = []));
      highlights.push({
        passageId: passage.id,
        category,
        lowConfidence: isLowConfidence(outcome),
        ranges: passage.textRanges,
      });
    }
    return byPage;
  }, [document, outcomes, activeId]);

  const startsByPage = useMemo(() => {
    const byPage = new Map<number, PassageStart[]>();
    for (const passage of document.passages) {
      const first = passage.textRanges?.[0];
      if (passage.page === undefined || !first) continue;
      const outcome = outcomes.get(passage.id);
      let starts = byPage.get(passage.page);
      if (!starts) byPage.set(passage.page, (starts = []));
      starts.push({
        passageId: passage.id,
        category: outcome && outcomeCategory(outcome),
        item: first.item,
        start: first.start,
      });
    }
    return byPage;
  }, [document, outcomes]);

  const activePassage = document.passages.find((passage) => passage.id === activeId);
  const cardPassage = document.passages.find((passage) => passage.id === hoveredId);
  const cardOutcome = cardPassage && outcomes.get(cardPassage.id);

  /** Called when the active passage changes, and with `paintedPage` whenever a page has painted its highlights. */
  const reveal = useCallback(
    (paintedPage?: number) => {
      const pending = pendingRef.current;
      if (!pending || !scroller) return;
      const spans = scroller.querySelectorAll(`.hl[data-passage-id="${CSS.escape(pending.passageId)}"]`);
      if (spans.length > 0) {
        pendingRef.current = undefined;
        centerIn(scroller, spans);
        return;
      }
      if (paintedPage !== undefined) {
        // Its page is drawn and it is still not there, so there is nothing to scroll to; waiting longer would only
        // pull the view back to it later.
        if (paintedPage === pending.page) pendingRef.current = undefined;
        return;
      }
      // Not drawn yet: bring its page near, and this runs again once the page has painted its highlights.
      const page = scroller.querySelector(`[data-page-number="${pending.page}"]`);
      if (page && !isPartlyInView(page, scroller)) page.scrollIntoView({ block: "start" });
    },
    [scroller],
  );

  /**
   * Darkens every span of the hovered passage. Done on the DOM rather than by repainting, so hovering doesn't rebuild
   * every drawn page; pages call it again after each repaint, which starts their spans afresh.
   */
  const markHovered = useCallback(() => {
    if (!scroller) return;
    for (const span of scroller.querySelectorAll(".hl.hovered")) span.classList.remove("hovered");
    const passageId = hoveredRef.current;
    if (passageId === undefined) return;
    for (const span of scroller.querySelectorAll(`.hl[data-passage-id="${CSS.escape(passageId)}"]`)) {
      span.classList.add("hovered");
    }
  }, [scroller]);

  useLayoutEffect(() => {
    hoveredRef.current = hoveredId;
    markHovered();
  }, [hoveredId, markHovered]);

  const handlePainted = useCallback(
    (pageNumber: number) => {
      markHovered();
      reveal(pageNumber);
    },
    [markHovered, reveal],
  );

  useEffect(() => {
    if (!activePassage || !pdf || scale === 0) return;
    pendingRef.current = { passageId: activePassage.id, page: activePassage.page };
    reveal();
  }, [activePassage, pdf, scale, reveal]);

  function handleMouseOver(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    setHoveredId(event.target.closest<HTMLElement>(".hl:not(.unrelated)")?.dataset.passageId);
  }

  const status = !file
    ? "The original file of this paper is not available."
    : error
      ? `The paper could not be shown: ${error}`
      : !pdf
        ? "Loading…"
        : undefined;

  return (
    <div className="document-view">
      <div
        ref={setScroller}
        className="document-scroll"
        onMouseOver={handleMouseOver}
        onMouseLeave={() => setHoveredId(undefined)}
      >
        {status ? (
          <p className={error ? "error document-status" : "document-status"}>{status}</p>
        ) : (
          pdf &&
          scale > 0 && (
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
                    onPainted={handlePainted}
                  />
                );
              })}
            </div>
          )
        )}
      </div>
      {cardPassage && cardOutcome && (
        <div className="passage-card-dock">
          <PassageCard
            passage={cardPassage}
            outcome={cardOutcome}
          />
        </div>
      )}
    </div>
  );
}

const NO_HIGHLIGHTS: readonly Highlight[] = [];
const NO_STARTS: readonly PassageStart[] = [];

/** Scrolls so the passage drawn by `spans` sits in the middle of the view, or its top near the top if it is taller. */
function centerIn(scroller: HTMLElement, spans: Iterable<Element>): void {
  let top = Infinity;
  let bottom = -Infinity;
  for (const span of spans) {
    const rect = span.getBoundingClientRect();
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
  }
  const view = scroller.getBoundingClientRect();
  const offset = bottom - top > view.height ? top - view.top - 24 : (top + bottom) / 2 - (view.top + view.bottom) / 2;
  scroller.scrollBy({ top: offset });
}

function isPartlyInView(element: Element, scroller: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  return rect.bottom > view.top && rect.top < view.bottom;
}
