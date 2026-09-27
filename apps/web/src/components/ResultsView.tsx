import { useEffect, useEffectEvent, useMemo, useState } from "react";
import type { ParsedDocument, Passage } from "../types.ts";
import { outcomeCategory, paperStats, sumTallies, type Category, type Outcome, type PaperStats } from "../results.ts";
import { DocumentView } from "./DocumentView.tsx";
import { PaperNav, type PaperOrder } from "./PaperNav.tsx";

interface Props {
  documents: ParsedDocument[];
  outcomes: ReadonlyMap<string, Outcome>;
  /** The files the documents were read from, by document path. */
  files: ReadonlyMap<string, File>;
  /** The paper shown; the first paper when unset. */
  documentId?: string;
  onDocumentChange: (documentId: string) => void;
}

export function ResultsView({ documents, outcomes, files, documentId, onDocumentChange }: Props) {
  const [paperOrder, setPaperOrder] = useState<PaperOrder>("document");
  const [activeId, setActiveId] = useState<string>();

  const stats = useMemo(() => paperStats(documents, outcomes), [documents, outcomes]);
  const totals = useMemo(() => sumTallies(stats), [stats]);
  const papers = useMemo(
    () => (paperOrder === "document" ? stats : stats.toSorted((a, b) => share(b, paperOrder) - share(a, paperOrder))),
    [stats, paperOrder],
  );
  const current = stats.find((paper) => paper.document.id === documentId) ?? stats[0];

  const paperIndex = papers.findIndex((paper) => paper.document.id === current?.document.id);
  const prevPaper = paperIndex > 0 ? papers[paperIndex - 1] : undefined;
  const nextPaper = paperIndex === -1 ? undefined : papers[paperIndex + 1];

  function selectPaper(paper: PaperStats) {
    onDocumentChange(paper.document.id);
    setActiveId(undefined);
  }

  // From the paper's active paragraph onwards, wrapping around; from the top when the paper is not the one shown.
  function jump(paper: PaperStats, category: Category) {
    const candidates = paper.document.passages.filter((passage) => categoryOf(passage) === category);
    const active = paper === current ? paper.document.passages.find((passage) => passage.id === activeId) : undefined;
    const next = (active && candidates.find((passage) => passage.index > active.index)) ?? candidates[0];
    if (!next) return;
    onDocumentChange(paper.document.id);
    setActiveId(next.id);
  }

  // Steps through the tinted paragraphs only; unrelated ones are left out, as they are in the document.
  function moveTinted(delta: 1 | -1) {
    if (!current) return;
    const tinted = current.document.passages.filter((passage) => {
      const category = categoryOf(passage);
      return category !== undefined && category !== "unrelated";
    });
    const active = current.document.passages.find((passage) => passage.id === activeId);
    const next = !active
      ? delta === 1 ? tinted[0] : tinted.at(-1)
      : delta === 1
        ? tinted.find((passage) => passage.index > active.index)
        : tinted.findLast((passage) => passage.index < active.index);
    if (next) setActiveId(next.id);
  }

  function categoryOf(passage: Passage): Category | undefined {
    const outcome = outcomes.get(passage.id);
    return outcome && outcomeCategory(outcome);
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, dialog, [popover]")) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      moveTinted(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const paper = event.key === "ArrowLeft" ? prevPaper : nextPaper;
      if (!paper) return;
      selectPaper(paper);
    } else {
      return;
    }
    event.preventDefault();
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return (
    <div className="results-view">
      <PaperNav
        papers={papers}
        totals={totals}
        order={paperOrder}
        onOrderChange={setPaperOrder}
        selectedId={current?.document.id}
        onSelect={selectPaper}
        onJump={jump}
      />
      {current && (
        <section className="document-pane" aria-label={current.document.path}>
          <div className="document-header">
            <h1 title={current.document.path}>{current.document.path}</h1>
            <span className="spacer" />
            <button type="button" disabled={!prevPaper} onClick={() => prevPaper && selectPaper(prevPaper)}>
              ← Prev paper
            </button>
            <button type="button" disabled={!nextPaper} onClick={() => nextPaper && selectPaper(nextPaper)}>
              Next paper →
            </button>
          </div>
          <DocumentView
            key={current.document.id}
            document={current.document}
            file={files.get(current.document.path)}
            outcomes={outcomes}
            activeId={activeId}
          />
          <footer className="shortcuts">
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> tinted paragraph
            </span>
            <span>
              <kbd>←</kbd> <kbd>→</kbd> paper
            </span>
          </footer>
        </section>
      )}
    </div>
  );
}

function share({ counts, total }: PaperStats, category: "supports" | "refutes"): number {
  return total === 0 ? 0 : counts[category] / total;
}
