export const STANCES = ["supports", "refutes", "unrelated"] as const;
export type Stance = (typeof STANCES)[number];

// Only PDFs can be shown as the original document so far; the Markdown and plain-text readers stay in parse/.
export const SUPPORTED_EXTENSIONS = [".pdf"] as const;

export interface Passage {
  id: string;
  /** 0-based position of the passage within its document. */
  index: number;
  text: string;
  /** 1-based page number; only set for PDFs. */
  page?: number;
  /** Where the passage sits in its page's text, in document order; only set for PDFs. */
  textRanges?: TextRange[];
  /** Trail of headings the passage sits under, outermost first, joined by " > "; only set for Markdown. */
  heading?: string;
}

/**
 * The UTF-16 code units `[start, end)` of text item `item` on a PDF page. Items are counted as pdf.js's `TextLayer`
 * counts its `textDivs`: the page's `getTextContent()` items that have a `str`, in order.
 */
export interface TextRange {
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
  /** Whether a Markdown passage's heading trail is sent as context. */
  contextHeading: boolean;
}

export interface ModelInfo {
  name: string;
  description: string;
}

export interface StanceResult {
  passageId: string;
  stance: Stance;
  confidence: number;
  probabilities: Record<Stance, number>;
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
