import {
  BAR_CATEGORIES,
  BAR_SCALES,
  CATEGORY_LABELS,
  type Category,
  type Counts,
  type PaperStats,
  type Tally,
} from "../results.ts";

export type PaperOrder = "document" | "supports" | "refutes";

interface Props {
  /** Already in `order`. */
  papers: readonly PaperStats[];
  totals: Tally;
  order: PaperOrder;
  onOrderChange: (order: PaperOrder) => void;
  selectedId?: string;
  onSelect: (paper: PaperStats) => void;
  /** Called from a stance bar segment: go to that paper's next paragraph of that stance. */
  onJump: (paper: PaperStats, category: Category) => void;
}

export function PaperNav({ papers, totals, order, onOrderChange, selectedId, onSelect, onJump }: Props) {
  return (
    <nav className="paper-nav" aria-label="Papers">
      <div className="paper-nav-header">
        <span className="eyebrow">Papers</span>
        <label className="quiet-select">
          Sort
          <select value={order} onChange={(e) => onOrderChange(e.target.value as PaperOrder)}>
            <option value="document">Document order</option>
            <option value="supports">Most supporting</option>
            <option value="refutes">Most refuting</option>
          </select>
        </label>
      </div>

      <PaperRow label="All papers" tally={totals} selected={false} />
      <hr />
      <ol className="paper-rows">
        {papers.map((stats) => (
          <li key={stats.document.id}>
            <PaperRow
              label={stats.document.path}
              tally={stats}
              selected={selectedId === stats.document.id}
              onSelect={() => onSelect(stats)}
              onJump={(category) => onJump(stats, category)}
            />
          </li>
        ))}
      </ol>
    </nav>
  );
}

interface PaperRowProps {
  label: string;
  tally: Tally;
  selected: boolean;
  /** Without these the row is a summary only. */
  onSelect?: () => void;
  onJump?: (category: Category) => void;
}

function PaperRow({ label, tally, selected, onSelect, onJump }: PaperRowProps) {
  const { counts, analyzed, total } = tally;
  const name = (
    <>
      <span className="paper-label">{label}</span>
      <SideCounts counts={counts} lowConfidence={tally.lowConfidence} />
    </>
  );
  return (
    <div className={`paper-row${selected ? " selected" : ""}${onSelect ? "" : " summary"}`}>
      {onSelect ? (
        <button type="button" className="paper-name" title={label} aria-current={selected || undefined} onClick={onSelect}>
          {name}
        </button>
      ) : (
        <div className="paper-name">{name}</div>
      )}
      <div className="stance-bar">
        {BAR_CATEGORIES.map((category) => {
          const count = counts[category];
          if (count === 0) return null;
          const description = `${CATEGORY_LABELS[category]}: ${count} of ${total} paragraph${total === 1 ? "" : "s"}`;
          const style = { flexGrow: count * BAR_SCALES[category] };
          return onJump ? (
            <button
              key={category}
              type="button"
              className={`segment ${category}`}
              style={style}
              title={`${description}. Go to the next one`}
              aria-label={`${label}, ${description}. Go to the next one`}
              onClick={() => onJump(category)}
            />
          ) : (
            <span key={category} className={`segment ${category}`} style={style} title={description} />
          );
        })}
        {analyzed < total && <span className="segment pending" style={{ flexGrow: total - analyzed }} />}
      </div>
    </div>
  );
}

function SideCounts({ counts, lowConfidence }: { counts: Counts; lowConfidence: number }) {
  return (
    <span className="side-counts">
      <span className="supports" title={CATEGORY_LABELS.supports}>
        {counts.supports}
      </span>
      <PossibleCount counts={counts} category="possibly-supports" />
      {" · "}
      <span className="refutes" title={CATEGORY_LABELS.refutes}>
        {counts.refutes}
      </span>
      <PossibleCount counts={counts} category="possibly-refutes" />
      {counts.failed > 0 && (
        <>
          {" · "}
          <span className="failed" title={CATEGORY_LABELS.failed}>
            {counts.failed}
          </span>
        </>
      )}
      {lowConfidence > 0 && (
        <span
          className="low-confidence-count"
          title={`${lowConfidence} low-confidence paragraph${lowConfidence === 1 ? "" : "s"}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          {lowConfidence}
        </span>
      )}
    </span>
  );
}

function PossibleCount({ counts, category }: { counts: Counts; category: "possibly-supports" | "possibly-refutes" }) {
  const count = counts[category];
  if (count === 0) return null;
  return (
    <span className={`possible-count ${category}`} title={CATEGORY_LABELS[category]}>
      {" "}+{count}
    </span>
  );
}
