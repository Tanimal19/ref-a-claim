export const STANCES = ["supports", "refutes", "unrelated"] as const;
export type Stance = (typeof STANCES)[number];

export type DocumentFormat = "pdf" | "markdown" | "text";

const FORMAT_BY_EXTENSION: Record<string, DocumentFormat> = {
  ".pdf": "pdf",
  ".md": "markdown",
  ".markdown": "markdown",
  ".txt": "text",
};

export const SUPPORTED_EXTENSIONS = Object.keys(FORMAT_BY_EXTENSION);

export function documentFormat(path: string): DocumentFormat | undefined {
  return FORMAT_BY_EXTENSION[path.slice(path.lastIndexOf(".")).toLowerCase()];
}

export interface Passage {
  id: string;
  /** 0-based position of the passage within its document. */
  index: number;
  text: string;
  /** 1-based page number; only set for PDFs. */
  page?: number;
  /** Where the passage sits in its document's text items (its page's, for PDFs), in document order. */
  textRanges?: TextRange[];
  /** Trail of headings the passage sits under, outermost first, joined by " > "; only set for Markdown and PDFs. */
  heading?: string;
}

/**
 * The UTF-16 code units `[start, end)` of text item `item`. What an item is depends on the document's format:
 * - PDF: an item on the passage's page, counted as pdf.js's `TextLayer` counts its `textDivs`: the page's
 *   `getTextContent()` items that have a `str`, in order.
 * - Markdown: a text or inline code node of the syntax tree, counted in document order (see `readMarkdown`).
 * - Plain text: always item 0, the whole file as read.
 */
export interface TextRange {
  /**
   * PDF only: the page the item is on, which differs from the passage's page for a passage that runs on from one page
   * to the next. Absent in results files exported before it was recorded, where every range is on the passage's page.
   */
  page?: number;
  item: number;
  start: number;
  end: number;
}

export interface ParsedDocument {
  id: string;
  /** Path relative to the folder the user picked. */
  path: string;
  passages: Passage[];
}

export interface ParseFailure {
  path: string;
  message: string;
}

export interface ParseResult {
  documents: ParsedDocument[];
  failures: ParseFailure[];
}

export interface AnalyzePassage {
  id: string;
  text: string;
  /** Surroundings the model may read to understand `text`; the stance is judged on `text` alone. */
  context?: PassageContext;
}

export interface PassageContext {
  heading?: string;
  /** Text of the passages just before, in the same document, separated by blank lines. */
  before?: string;
  /** Text of the passages just after, in the same document, separated by blank lines. */
  after?: string;
}

export const CONTEXT_PARAGRAPHS_MAX = 3;
export const POSSIBLE_ABOVE_MIN = 0.05;
export const POSSIBLE_ABOVE_MAX = 0.5;
export const PASSAGE_MAX_CHARS_MIN = 100;
export const PASSAGE_MAX_CHARS_MAX = 10_000;

export interface Settings {
  /** Kept in `sessionStorage`, so it is gone once the tab closes. */
  apiKey?: string;
  /** Empty means `DEFAULT_MODEL`. */
  model: string;
  passageMaxChars: number;
  /** Paragraphs of the same document sent as context on each side of a passage; 0 sends none. */
  contextParagraphs: number;
  /** Whether a passage's heading trail is sent as context. */
  contextHeading: boolean;
  /**
   * A passage judged unrelated to a claim is shown as possibly supporting or refuting it when that stance's
   * probability is at least this.
   */
  possibleAbove: number;
}

export interface ModelInfo {
  name: string;
  description: string;
}

export interface ClaimStance {
  stance: Stance;
  confidence: number;
  probabilities: Record<Stance, number>;
}

export interface StanceResult {
  passageId: string;
  /** One per claim of the run, in the same order. */
  stances: ClaimStance[];
  /** Versioned model ID that produced the answer, e.g. "jev-1.13.0". */
  model: string;
  usage: TokenUsage;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface PassageFailure {
  passageId: string;
  message: string;
}
