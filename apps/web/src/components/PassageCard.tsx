import { STANCES, type ClaimStance, type Passage } from "../types.ts";
import { CATEGORY_LABELS, judge, type Category, type Judgement, type Outcome, type Reading } from "../results.ts";

interface Props {
  passage: Passage;
  outcome: Outcome;
  claims: readonly string[];
  reading: Reading;
}

export function PassageCard({ passage, outcome, claims, reading }: Props) {
  const judgement = judge(outcome, reading);
  const { category, lowConfidence } = judgement;
  return (
    <section
      className={`passage-card ${category}${lowConfidence ? " low-confidence" : ""}`}
      aria-label="Paragraph result"
    >
      <div className="passage-card-header">
        <span className="stance-label">{CATEGORY_LABELS[category]}</span>
        <ConfidenceBadge judgement={judgement} />
        <span className="spacer" />
        <span className="passage-card-where">
          {passage.page !== undefined && <>p. {passage.page} · </>}¶ {passage.index + 1}
        </span>
      </div>
      {outcome.kind === "result" ? (
        <>
          {reading.view === "all" && claims.length > 1 ? (
            <ol className="claim-scores">
              {outcome.result.stances.map((stance, i) => (
                <li key={i}>
                  <p className="claim-scores-claim" title={claims[i]}>
                    <span className="claim-number">{i + 1}</span>
                    <span className="claim-text">{claims[i]}</span>
                  </p>
                  <Scores stance={stance} category={judge(outcome, { ...reading, view: i }).category} />
                </li>
              ))}
            </ol>
          ) : (
            <Scores
              stance={outcome.result.stances[reading.view === "all" ? 0 : reading.view]}
              category={category}
            />
          )}
          <p className="model">{outcome.result.model}</p>
        </>
      ) : (
        <p className="error">{outcome.message}</p>
      )}
    </section>
  );
}

/**
 * One claim's probabilities: the highest in bold, tinted when it is a supporting or refuting stance, and the leaning
 * stance of a possibly related passage tinted but not bold.
 */
function Scores({ stance, category }: { stance: ClaimStance | undefined; category: Category }) {
  if (!stance) return null;
  const possible =
    category === "possibly-supports" ? "supports" : category === "possibly-refutes" ? "refutes" : undefined;
  return (
    <p className="scores">
      {STANCES.map((s) => (
        <span key={s} className={s === stance.stance ? `chosen ${s}` : s === possible ? `possible ${s}` : undefined}>
          {CATEGORY_LABELS[s]} {stance.probabilities[s].toFixed(2)}
        </span>
      ))}
    </p>
  );
}

/** Shows the confidence of the model's choice; below the threshold it becomes the highlighted low-confidence tag. */
function ConfidenceBadge({ judgement }: { judgement: Judgement }) {
  const { confidence, lowConfidence } = judgement;
  if (confidence === undefined) return null;
  return (
    <span className={lowConfidence ? "confidence low-confidence-tag" : "confidence"}>
      {lowConfidence ? "Low confidence" : "Confidence"} {confidence.toFixed(2)}
    </span>
  );
}
