import type { TextRange } from "../types.ts";

const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u;

const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });

/**
 * Text that remembers where it came from: `offsets[i]` is the position in the source string of the UTF-16 code unit
 * `text[i]`, or -1 for text that was inserted rather than taken from the source (the space that joins two lines).
 */
export interface TracedText {
  text: string;
  offsets: number[];
}

export function traced(text: string): TracedText {
  return { text, offsets: Array.from({ length: text.length }, (_, i) => i) };
}

/** Joins `parts` with `separator` between them; the separators are inserted text. */
export function joinTraced(parts: readonly TracedText[], separator: string): TracedText {
  const result: TracedText = { text: "", offsets: [] };
  parts.forEach((part, i) => {
    if (i > 0) append(result, { text: separator, offsets: Array.from({ length: separator.length }, () => -1) });
    append(result, part);
  });
  return result;
}

/** Where the source's code unit at an offset lies: its text item and its position in that item, if it is in one. */
export type Locate = (offset: number) => { item: number; char: number } | undefined;

/**
 * A passage is one stretch of its source, so within an item its range runs from its first to its last code unit,
 * which takes in the whitespace and hyphens that were trimmed or dropped from its text.
 */
export function rangesOf(offsets: readonly number[], locate: Locate): TextRange[] {
  const ranges: TextRange[] = [];
  for (const offset of offsets) {
    if (offset < 0) continue;
    const location = locate(offset);
    if (!location) continue;
    const { item, char } = location;
    const last = ranges.at(-1);
    if (last && last.item === item && char >= last.end) last.end = char + 1;
    else ranges.push({ item, start: char, end: char + 1 });
  }
  return ranges;
}

/** Splits text on blank lines and rejoins hard-wrapped lines inside each paragraph. */
export function splitTracedParagraphs(source: TracedText): TracedText[] {
  const normalized = normalizeNewlines(source);
  const paragraphs: TracedText[] = [];
  let start = 0;
  for (const separator of normalized.text.matchAll(/\n[ \t]*\n/g)) {
    paragraphs.push(slice(normalized, start, separator.index));
    start = separator.index + separator[0].length;
  }
  paragraphs.push(slice(normalized, start));
  return paragraphs.map(unwrapTracedLines).filter((paragraph) => paragraph.text.length > 0);
}

/**
 * Joins wrapped lines into one line: drops end-of-line hyphenation ("exam-\nple"), joins CJK
 * text without a space, and everything else with a single space.
 */
export function unwrapLines(text: string): string {
  return unwrapTracedLines(traced(text)).text;
}

export function unwrapTracedLines(source: TracedText): TracedText {
  const result: TracedText = { text: "", offsets: [] };
  let lineStart = 0;
  for (const lineEnd of [...lineBreaks(source.text), source.text.length]) {
    const trimmed = trim(slice(source, lineStart, lineEnd));
    lineStart = lineEnd + 1;
    if (trimmed.text === "") continue;
    if (result.text === "") {
      append(result, trimmed);
    } else if (/\p{L}-$/u.test(result.text) && /^\p{Ll}/u.test(trimmed.text)) {
      result.text = result.text.slice(0, -1);
      result.offsets.pop();
      append(result, trimmed);
    } else if (CJK_CHAR.test(result.text.at(-1)!) && CJK_CHAR.test(trimmed.text[0]!)) {
      append(result, trimmed);
    } else {
      append(result, { text: " ", offsets: [-1] });
      append(result, trimmed);
    }
  }
  return result;
}

/**
 * Splits text longer than `maxChars` into chunks of whole sentences. A single sentence longer
 * than `maxChars` is cut at the character limit.
 */
export function chunkBySentence(text: string, maxChars: number): string[] {
  return chunkTracedBySentence(traced(text), maxChars).map((chunk) => chunk.text);
}

export function chunkTracedBySentence(source: TracedText, maxChars: number): TracedText[] {
  if (source.text.length <= maxChars) return [source];

  const chunks: TracedText[] = [];
  let current: TracedText = { text: "", offsets: [] };
  for (const { segment, index } of sentenceSegmenter.segment(source.text)) {
    for (const piece of cutAt(slice(source, index, index + segment.length), maxChars)) {
      if (current.text !== "" && current.text.length + piece.text.length > maxChars) {
        chunks.push(trim(current));
        current = { text: "", offsets: [] };
      }
      append(current, piece);
    }
  }
  if (current.text.trim() !== "") chunks.push(trim(current));
  return chunks;
}

/** Cuts `source` into pieces of at most `maxChars` code points. */
function cutAt(source: TracedText, maxChars: number): TracedText[] {
  if (source.text.length <= maxChars) return [source];
  const pieces: TracedText[] = [];
  let start = 0;
  let end = 0;
  let count = 0;
  for (const codePoint of source.text) {
    if (count === maxChars) {
      pieces.push(slice(source, start, end));
      start = end;
      count = 0;
    }
    end += codePoint.length;
    count++;
  }
  pieces.push(slice(source, start, end));
  return pieces;
}

/** Turns "\r\n" and lone "\r" into "\n". */
function normalizeNewlines(source: TracedText): TracedText {
  const result: TracedText = { text: "", offsets: [] };
  for (let i = 0; i < source.text.length; i++) {
    const char = source.text[i]!;
    if (char === "\r" && source.text[i + 1] === "\n") continue;
    result.text += char === "\r" ? "\n" : char;
    result.offsets.push(source.offsets[i]!);
  }
  return result;
}

function* lineBreaks(text: string): Generator<number> {
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) yield i;
}

function slice(source: TracedText, start: number, end = source.text.length): TracedText {
  return { text: source.text.slice(start, end), offsets: source.offsets.slice(start, end) };
}

function trim(source: TracedText): TracedText {
  const start = source.text.length - source.text.trimStart().length;
  const end = source.text.trimEnd().length;
  return end <= start ? { text: "", offsets: [] } : slice(source, start, end);
}

function append(target: TracedText, addition: TracedText): void {
  target.text += addition.text;
  for (const offset of addition.offsets) target.offsets.push(offset);
}
