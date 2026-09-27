import type { ParsedDocument, Stance, StanceResult } from "./types.ts";

export type Outcome = { kind: "result"; result: StanceResult } | { kind: "failure"; message: string };

export type Category = Stance | "failed";
export type Counts = Record<Category, number>;

export const CATEGORY_LABELS: Record<Category, string> = {
  supports: "Supports",
  refutes: "Refutes",
  unrelated: "Unrelated",
  failed: "Failed",
};

/** Left-to-right order of the segments in a stance bar. */
export const BAR_CATEGORIES: readonly Category[] = ["supports", "unrelated", "refutes", "failed"];

// Unrelated paragraphs usually dominate a paper, so bars draw them at half length to keep the others readable.
export const BAR_SCALES: Record<Category, number> = { supports: 1, unrelated: 0.5, refutes: 1, failed: 1 };

/** A result whose chosen stance has a probability below this is flagged for a closer look. */
export const LOW_CONFIDENCE_BELOW = 0.6;

export interface Tally {
  counts: Counts;
  /** Results with confidence below `LOW_CONFIDENCE_BELOW`, across all stances. */
  lowConfidence: number;
  /** Passages that have an outcome; the rest of `total` are still pending. */
  analyzed: number;
  total: number;
}

export interface PaperStats extends Tally {
  document: ParsedDocument;
}

export function outcomeCategory(outcome: Outcome): Category {
  return outcome.kind === "result" ? outcome.result.stance : "failed";
}

export function isLowConfidence(outcome: Outcome): boolean {
  return outcome.kind === "result" && outcome.result.confidence < LOW_CONFIDENCE_BELOW;
}

export function emptyCounts(): Counts {
  return { supports: 0, refutes: 0, unrelated: 0, failed: 0 };
}

export function paperStats(documents: readonly ParsedDocument[], outcomes: ReadonlyMap<string, Outcome>): PaperStats[] {
  return documents.map((document) => {
    const counts = emptyCounts();
    let analyzed = 0;
    let lowConfidence = 0;
    for (const passage of document.passages) {
      const outcome = outcomes.get(passage.id);
      if (!outcome) continue;
      counts[outcomeCategory(outcome)]++;
      analyzed++;
      if (isLowConfidence(outcome)) lowConfidence++;
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
