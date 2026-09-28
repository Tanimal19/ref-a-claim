import { STANCES, type ClaimStance, type Passage } from "../types.ts";
import { useMessages } from "../i18n/index.tsx";
import { judge, type Category, type Judgement, type Outcome, type Reading } from "../results.ts";

interface Props {
  passage: Passage;
  outcome: Outcome;
  claims: readonly string[];
  reading: Reading;
}

export function PassageCard({ passage, outcome, claims, reading }: Props) {
  const m = useMessages();
  const judgement = judge(outcome, reading);
  const { category, lowConfidence } = judgement;
  return (
    <section
      className={`passage-card ${category}${lowConfidence ? " low-confidence" : ""}`}
      aria-label={m.passage.label}
    >
      <div className="passage-card-header">
        <span className="stance-label">{m.categories[category]}</span>
        <ConfidenceBadge judgement={judgement} />
        <span className="spacer" />
        <span className="passage-card-where">
          {passage.page !== undefined && <>{m.passage.page(passage.page)} · </>}
          {m.passage.paragraph(passage.index + 1)}
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
  const m = useMessages();
  if (!stance) return null;
  const possible =
    category === "possibly-supports" ? "supports" : category === "possibly-refutes" ? "refutes" : undefined;
  return (
    <p className="scores">
      {STANCES.map((s) => (
        <span key={s} className={s === stance.stance ? `chosen ${s}` : s === possible ? `possible ${s}` : undefined}>
          {m.categories[s]} {stance.probabilities[s].toFixed(2)}
        </span>
      ))}
    </p>
  );
}

/** Shows the confidence of the model's choice; below the threshold it becomes the highlighted low-confidence tag. */
function ConfidenceBadge({ judgement }: { judgement: Judgement }) {
  const { confidence, lowConfidence } = judgement;
  const m = useMessages();
  if (confidence === undefined) return null;
  return (
    <span className={lowConfidence ? "confidence low-confidence-tag" : "confidence"}>
      {lowConfidence ? m.passage.lowConfidence : m.passage.confidence} {confidence.toFixed(2)}
    </span>
  );
}
