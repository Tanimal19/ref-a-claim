import type { Category } from "../results.ts";
import type { TextRange } from "../types.ts";

/** Where a passage begins: the first character of its first text range. */
export interface PassageStart {
  passageId: string;
  /** Only set for PDFs. */
  page?: number;
  /** Unset while the passage has no outcome yet. */
  category?: Category;
  item: number;
  start: number;
}

export interface Highlight {
  passageId: string;
  /** Only set for PDFs. */
  page?: number;
  category: Category;
  lowConfidence: boolean;
  ranges: readonly TextRange[];
}

export function highlightClass({ category, lowConfidence }: Highlight): string {
  return `hl ${category}${lowConfidence ? " low-confidence" : ""}`;
}
