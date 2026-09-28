import type { ClaimStance, ParsedDocument, StanceResult } from "./types.ts";

export type Outcome = { kind: "result"; result: StanceResult } | { kind: "failure"; message: string };

/** The claim results are shown for: one of the run's claims, by index, or all of them combined. */
export type ClaimView = number | "all";

/**
 * How results are read: for which claim, and from what probability a passage judged unrelated is shown as possibly
 * supporting or refuting it.
 */
export interface Reading {
  view: ClaimView;
  possibleAbove: number;
}

export type Category = "supports" | "possibly-supports" | "unrelated" | "possibly-refutes" | "refutes" | "failed";
export type Counts = Record<Category, number>;

/** Left-to-right order of the segments in a stance bar. */
export const BAR_CATEGORIES: readonly Category[] = [
  "supports",
  "possibly-supports",
  "unrelated",
  "possibly-refutes",
  "refutes",
  "failed",
];

// Unrelated paragraphs usually dominate a paper, so bars draw them at half length to keep the others readable.
export const BAR_SCALES: Record<Category, number> = {
  supports: 1,
  "possibly-supports": 1,
  unrelated: 0.5,
  "possibly-refutes": 1,
  refutes: 1,
  failed: 1,
};

/** A result whose chosen stance has a probability below this is flagged for a closer look. */
export const LOW_CONFIDENCE_BELOW = 0.6;

export interface Judgement {
  category: Category;
  /** The confidence of the model's own choice; unset for failures and for possibly related passages. */
  confidence?: number;
  /** The model's own choice (supports, refutes or unrelated) has a confidence below `LOW_CONFIDENCE_BELOW`. */
  lowConfidence: boolean;
}

export interface Tally {
  counts: Counts;
  /** Results flagged `lowConfidence`, across all categories. */
  lowConfidence: number;
  /** Passages that have an outcome; the rest of `total` are still pending. */
  analyzed: number;
  total: number;
}

export interface PaperStats extends Tally {
  document: ParsedDocument;
}

/**
 * Reads an outcome for `reading.view`. Combined across claims, a passage takes the strongest judgement any claim gets:
 * a supported or refuted claim over a possibly related one over an unrelated one, and among equals the one whose stance
 * is the most probable.
 */
export function judge(outcome: Outcome, reading: Reading): Judgement {
  if (outcome.kind === "failure") return { category: "failed", lowConfidence: false };
  const { stances } = outcome.result;
  const judged = stances.map((stance) => judgeClaim(stance, reading.possibleAbove));
  const chosen =
    reading.view === "all"
      ? judged.reduce((best, next) =>
          next.rank > best.rank || (next.rank === best.rank && next.strength > best.strength) ? next : best,
        )
      : judged[reading.view];
  if (!chosen) return { category: "failed", lowConfidence: false };
  const { category, confidence, lowConfidence } = chosen;
  return confidence === undefined ? { category, lowConfidence } : { category, confidence, lowConfidence };
}

function judgeClaim({ stance, confidence, probabilities }: ClaimStance, possibleAbove: number) {
  const lowConfidence = confidence < LOW_CONFIDENCE_BELOW;
  if (stance !== "unrelated") {
    return { category: stance, rank: 2, strength: probabilities[stance], confidence, lowConfidence };
  }
  const leaning = probabilities.supports >= probabilities.refutes ? "supports" : "refutes";
  const strength = probabilities[leaning];
  return strength >= possibleAbove
    ? { category: `possibly-${leaning}` as const, rank: 1, strength, confidence: undefined, lowConfidence: false }
    : { category: "unrelated" as const, rank: 0, strength, confidence, lowConfidence };
}

export function emptyCounts(): Counts {
  return { supports: 0, "possibly-supports": 0, unrelated: 0, "possibly-refutes": 0, refutes: 0, failed: 0 };
}

export function paperStats(
  documents: readonly ParsedDocument[],
  outcomes: ReadonlyMap<string, Outcome>,
  reading: Reading,
): PaperStats[] {
  return documents.map((document) => {
    const counts = emptyCounts();
    let analyzed = 0;
    let lowConfidence = 0;
    for (const passage of document.passages) {
      const outcome = outcomes.get(passage.id);
      if (!outcome) continue;
      const judgement = judge(outcome, reading);
      counts[judgement.category]++;
      analyzed++;
      if (judgement.lowConfidence) lowConfidence++;
    }
    return { document, counts, lowConfidence, analyzed, total: document.passages.length };
  });
}

export function sumTallies(tallies: readonly Tally[]): Tally {
  const sum: Tally = { counts: emptyCounts(), lowConfidence: 0, analyzed: 0, total: 0 };
  for (const tally of tallies) {
    for (const category of BAR_CATEGORIES) sum.counts[category] += tally.counts[category];
    sum.lowConfidence += tally.lowConfidence;
    sum.analyzed += tally.analyzed;
    sum.total += tally.total;
  }
  return sum;
}
