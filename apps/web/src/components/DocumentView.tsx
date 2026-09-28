import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { judge, type Outcome, type Reading } from "../results.ts";
import { documentFormat, type ParsedDocument, type Passage, type TextRange } from "../types.ts";
import type { Highlight, PassageStart } from "./highlights.ts";
import { PassageCard } from "./PassageCard.tsx";
import { TextDocument } from "./TextDocument.tsx";

// pdf.js is most of the bundle, so it loads only once a PDF is shown.
const PdfDocument = lazy(() => import("./PdfDocument.tsx").then((module) => ({ default: module.PdfDocument })));

interface Props {
  document: ParsedDocument;
  /** The file `document` was read from. */
  file?: File;
  claims: readonly string[];
  reading: Reading;
  outcomes: ReadonlyMap<string, Outcome>;
  activeId?: string;
}

/** Shows the original document with each analyzed passage tinted by its stance; unrelated passages stay untinted. */
export function DocumentView({ document, file, claims, reading, outcomes, activeId }: Props) {
  const { view, possibleAbove } = reading;
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [hoveredId, setHoveredId] = useState<string>();
  // The passage to bring into view once it has been drawn; its page may not be rendered yet.
  const pendingRef = useRef<{ passageId: string; page?: number }>(undefined);
  const hoveredRef = useRef<string>(undefined);

  const highlights = useMemo(
    () =>
      document.passages.flatMap((passage): Highlight[] => {
        const outcome = outcomes.get(passage.id);
        if (!outcome || !passage.textRanges) return [];
        const { category, lowConfidence } = judge(outcome, { view, possibleAbove });
        // Unrelated passages get (untinted) spans only when navigated to, as scrolling to a passage looks for its spans.
        if (category === "unrelated" && passage.id !== activeId) return [];
        return rangesByPage(passage, passage.textRanges).map(({ page, ranges }) => ({
          passageId: passage.id,
          page,
          category,
          lowConfidence,
          ranges,
        }));
      }),
    [document, outcomes, activeId, view, possibleAbove],
  );

  const starts = useMemo(
    () =>
      document.passages.flatMap((passage): PassageStart[] => {
        const first = passage.textRanges?.[0];
        if (!first) return [];
        const outcome = outcomes.get(passage.id);
        return [
          {
            passageId: passage.id,
            page: first.page ?? passage.page,
            category: outcome && judge(outcome, { view, possibleAbove }).category,
            item: first.item,
            start: first.start,
          },
        ];
      }),
    [document, outcomes, view, possibleAbove],
  );

  const activePassage = document.passages.find((passage) => passage.id === activeId);
  const cardPassage = document.passages.find((passage) => passage.id === hoveredId);
  const cardOutcome = cardPassage && outcomes.get(cardPassage.id);

  /**
   * Called when the active passage changes or the pages are laid out anew, and with `painted` whenever highlights have
   * been painted: on one PDF page, or (with no page) across a whole text document.
   */
  const reveal = useCallback(
    (painted?: { page?: number }) => {
      const pending = pendingRef.current;
      if (!pending || !scroller) return;
      const spans = scroller.querySelectorAll(`.hl[data-passage-id="${CSS.escape(pending.passageId)}"]`);
      if (spans.length > 0) {
        pendingRef.current = undefined;
        centerIn(scroller, spans);
        return;
      }
      if (painted) {
        // Where it should be is drawn and it is still not there, so there is nothing to scroll to; waiting longer
        // would only pull the view back to it later.
        if (painted.page === pending.page) pendingRef.current = undefined;
        return;
      }
      if (pending.page === undefined) return;
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
    (page?: number) => {
      markHovered();
      reveal({ page });
    },
    [markHovered, reveal],
  );

  const revealActive = useCallback(() => {
    if (!activePassage) return;
    pendingRef.current = { passageId: activePassage.id, page: activePassage.page };
    reveal();
  }, [activePassage, reveal]);

  useEffect(revealActive, [revealActive]);

  function handleMouseOver(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    setHoveredId(event.target.closest<HTMLElement>(".hl:not(.unrelated)")?.dataset.passageId);
  }

  const format = documentFormat(document.path);

  return (
    <div className="document-view">
      <div
        ref={setScroller}
        className="document-scroll"
        onMouseOver={handleMouseOver}
        onMouseLeave={() => setHoveredId(undefined)}
      >
        {!file ? (
          <p className="document-status">The original file of this paper is not available.</p>
        ) : format === "pdf" ? (
          <Suspense fallback={<p className="document-status">Loading…</p>}>
            <PdfDocument
              file={file}
              scroller={scroller}
              highlights={highlights}
              starts={starts}
              onLayout={revealActive}
              onPainted={handlePainted}
            />
          </Suspense>
        ) : format ? (
          <TextDocument file={file} format={format} highlights={highlights} starts={starts} onPainted={handlePainted} />
        ) : (
          <p className="error document-status">This type of file cannot be shown.</p>
        )}
      </div>
      {cardPassage && cardOutcome && (
        <div className="passage-card-dock">
          <PassageCard passage={cardPassage} outcome={cardOutcome} claims={claims} reading={reading} />
        </div>
      )}
    </div>
  );
}

/** Splits a passage's ranges by the page they are on, as each page draws its own; one group outside PDFs. */
function rangesByPage(passage: Passage, ranges: readonly TextRange[]): { page?: number; ranges: TextRange[] }[] {
  const groups: { page?: number; ranges: TextRange[] }[] = [];
  for (const range of ranges) {
    const page = range.page ?? passage.page;
    const last = groups.at(-1);
    if (last && last.page === page) last.ranges.push(range);
    else groups.push({ page, ranges: [range] });
  }
  return groups;
}

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
