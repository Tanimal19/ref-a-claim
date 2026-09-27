import { STANCES, type Passage } from "../types.ts";
import { CATEGORY_LABELS, isLowConfidence, outcomeCategory, type Outcome } from "../results.ts";

interface Props {
  passage: Passage;
  outcome: Outcome;
}

export function PassageCard({ passage, outcome }: Props) {
  const category = outcomeCategory(outcome);
  return (
    <section
      className={`passage-card ${category}${isLowConfidence(outcome) ? " low-confidence" : ""}`}
      aria-label="Paragraph result"
    >
      <div className="passage-card-header">
        <span className="stance-label">{CATEGORY_LABELS[category]}</span>
        <ConfidenceBadge outcome={outcome} />
        <span className="spacer" />
        <span className="passage-card-where">
          {passage.page !== undefined && <>p. {passage.page} · </>}¶ {passage.index + 1}
        </span>
      </div>
      {outcome.kind === "result" ? (
        <p className="scores">
          {STANCES.map((stance) => (
            <span key={stance} className={stance === outcome.result.stance ? `chosen ${stance}` : undefined}>
              {CATEGORY_LABELS[stance]} {outcome.result.probabilities[stance].toFixed(2)}
            </span>
          ))}
          <span className="model">{outcome.result.model}</span>
        </p>
      ) : (
        <p className="error">{outcome.message}</p>
      )}
    </section>
  );
}

/** Every result shows its confidence; below the threshold it becomes the highlighted low-confidence tag. */
export function ConfidenceBadge({ outcome }: { outcome: Outcome }) {
  if (outcome.kind !== "result") return null;
  const low = isLowConfidence(outcome);
  return (
    <span className={low ? "confidence low-confidence-tag" : "confidence"}>
      {low ? "Low confidence" : "Confidence"} {outcome.result.confidence.toFixed(2)}
    </span>
  );
}
