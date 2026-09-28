import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdf, pageTextContent, textItems, type TextItem } from "../pdfjs.ts";
import type { TextRange } from "../types.ts";
import { CJK_CHAR, joinTraced, rangesOf, unwrapTracedLines, type TracedText } from "./split.ts";

export interface PdfBlock {
  text: TracedText;
  /** The page the block starts on; a paragraph that runs on past a column or page break is one block. */
  page: number;
  heading?: string;
  /** Maps offsets from `text` (or from pieces cut out of it) to text items, each with the page it is on. */
  textRanges: (offsets: readonly number[]) => TextRange[];
}

/** Share of the page's height at its top and bottom where running headers and footers sit. */
const MARGIN_SHARE = 0.08;
/** Blocks with fewer letters are figure labels, page numbers or stray symbols rather than prose. */
const MIN_LETTERS = 15;
/** Blocks with fewer words are figure or table labels rather than prose. */
const MIN_WORDS = 6;
/** Blocks with fewer words that don't end a sentence are figure or table labels rather than prose. */
const MIN_UNENDED_WORDS = 12;
/** Longer blocks are never headings. */
const HEADING_MAX_LINES = 3;
const HEADING_MAX_WORDS = 16;
/** How much larger than the body text an unnumbered heading's font is. */
const HEADING_SIZE_RATIO = 1.1;
/** A section number ("2", "4.1.3", "A.", "IV.") followed by the heading's words. */
const SECTION_NUMBER = /^(?:(\d+(?:\.\d+)*)\.?|[A-Z]\.|[IVX]+\.)\s+(?=\p{L})/u;
const SENTENCE_END = /[.!?。！？]["'”’)\]]*$/u;
/** Like `SENTENCE_END`, and also a colon, which introduces a quote or list that stands as a paragraph of its own. */
const PARAGRAPH_END = /[.!?:。！？：]["'”’)\]]*$/u;
/** How a paragraph that runs on from the previous block starts: not with a capital, as a new sentence would. */
const CONTINUATION_START = /^[\p{Ll}\d(\[,;–—-]/u;
const ABSTRACT_HEADING = /^(abstract\b|摘要)/i;
const REFERENCES_HEADING =
  /^(\d+(\.\d+)*\.?\s*)?(references|bibliography|works cited|literature cited|參考文獻|参考文献)$/i;
const APPENDIX_HEADING = /^(appendix|appendices|supplementary|附錄|附录)/i;

// Positions are in PDF user space, where y grows upwards and a line's y is its baseline.
interface Line {
  text: TracedText;
  x0: number;
  x1: number;
  y: number;
  size: number;
}

interface LaidOutBlock {
  text: TracedText;
  page: number;
  firstLine: string;
  top: number;
  bottom: number;
  lineCount: number;
  /** Font size of the block's longest line. */
  size: number;
}

interface PageLayout {
  page: number;
  top: number;
  bottom: number;
  /** Their text's offsets count through the page's text, which `itemOf` and `charOf` map to text items. */
  blocks: LaidOutBlock[];
  itemOf: number[];
  charOf: number[];
}

interface Heading {
  depth: number;
  text: string;
}

export async function pdfBlocks(data: Uint8Array): Promise<PdfBlock[]> {
  const loadingTask = loadPdf(data);
  try {
    const pdf = await loadingTask.promise;
    const pages = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pageLayout(pdf, i + 1)));
    // Offsets count through every page's text laid end to end, so a paragraph can run on from one page to the next.
    const itemOf: number[] = [];
    const charOf: number[] = [];
    const pageOf: number[] = [];
    const bases = new Map<number, number>();
    for (const layout of pages) {
      bases.set(layout.page, itemOf.length);
      for (let i = 0; i < layout.itemOf.length; i++) {
        itemOf.push(layout.itemOf[i]!);
        charOf.push(layout.charOf[i]!);
        pageOf.push(layout.page);
      }
    }
    const textRanges = (offsets: readonly number[]) =>
      rangesOf(offsets, (offset) =>
        itemOf[offset]! < 0 ? undefined : { page: pageOf[offset]!, item: itemOf[offset]!, char: charOf[offset]! },
      );
    const blocks = bodyBlocks(pages).map((block) => ({ ...block, text: shifted(block.text, bases.get(block.page)!) }));
    return paragraphs(blocks).map((paragraph) => ({ ...paragraph, textRanges }));
  } finally {
    await loadingTask.destroy();
  }
}

async function pageLayout(pdf: PDFDocumentProxy, pageNumber: number): Promise<PageLayout> {
  const page = await pdf.getPage(pageNumber);
  const items = textItems(await pageTextContent(page));
  // The page's text is its items joined, with a line break after each item that ends a line. For every UTF-16 code
  // unit of it, `itemOf` holds the item it came from (-1 for the line breaks) and `charOf` its position in that item.
  let pageText = "";
  const itemStart: number[] = [];
  const itemOf: number[] = [];
  const charOf: number[] = [];
  items.forEach((item, index) => {
    itemStart.push(pageText.length);
    pageText += item.str;
    for (let char = 0; char < item.str.length; char++) {
      itemOf.push(index);
      charOf.push(char);
    }
    if (item.hasEOL) {
      pageText += "\n";
      itemOf.push(-1);
      charOf.push(-1);
    }
  });

  const tracedItem = (index: number): TracedText => {
    const start = itemStart[index]!;
    return { text: items[index]!.str, offsets: Array.from({ length: items[index]!.str.length }, (_, i) => start + i) };
  };
  const blocks = groupLines(linesOf(items, tracedItem)).map((lines): LaidOutBlock => {
    const text = unwrapTracedLines(joinTraced(lines.map((line) => line.text), "\n"));
    const longest = lines.reduce((a, b) => (b.text.text.length > a.text.text.length ? b : a));
    return {
      text,
      page: pageNumber,
      firstLine: lines[0]!.text.text.trim(),
      top: Math.max(...lines.map((line) => line.y + line.size)),
      bottom: Math.min(...lines.map((line) => line.y)),
      lineCount: lines.length,
      size: longest.size,
    };
  });
  const [, bottom, , top] = page.view as [number, number, number, number];
  return { page: pageNumber, top, bottom, blocks, itemOf, charOf };
}

/**
 * Splits the items into lines at each end of line pdf.js reports, and where the text jumps to another baseline without
 * one. Rotated text, such as axis labels in figures, is left out.
 */
function linesOf(items: readonly TextItem[], tracedItem: (index: number) => TracedText): Line[] {
  const lines: Line[] = [];
  let current: number[] = [];
  const flush = () => {
    const line = lineOf(current, items, tracedItem);
    if (line) lines.push(line);
    current = [];
  };
  items.forEach((item, index) => {
    if (!isRotated(item)) {
      const last = current.findLast((i) => items[i]!.str.trim() !== "");
      if (last !== undefined && item.str.trim() !== "" && changesBaseline(items[last]!, item)) flush();
      current.push(index);
    }
    if (item.hasEOL) flush();
  });
  flush();
  return lines;
}

function lineOf(indices: readonly number[], items: readonly TextItem[], tracedItem: (index: number) => TracedText) {
  const inked = indices.map((i) => items[i]!).filter((item) => item.str.trim() !== "");
  if (inked.length === 0) return undefined;
  // Superscripts, subscripts and inline symbols are shorter runs than the line's own text.
  const main = inked.reduce((longest, item) => (item.str.length > longest.str.length ? item : longest));
  return {
    text: joinTraced(indices.map(tracedItem), ""),
    x0: Math.min(...inked.map((item) => item.transform[4] as number)),
    x1: Math.max(...inked.map((item) => (item.transform[4] as number) + item.width)),
    y: main.transform[5] as number,
    size: fontSize(main),
  } satisfies Line;
}

/** Groups consecutive lines into blocks, starting a new one wherever a paragraph, column or font size changes. */
function groupLines(lines: readonly Line[]): Line[][] {
  const blocks: Line[][] = [];
  for (const line of lines) {
    const block = blocks.at(-1);
    if (block && continuesBlock(block, line)) block.push(line);
    else blocks.push([line]);
  }
  return blocks;
}

function continuesBlock(block: readonly Line[], line: Line): boolean {
  const prev = block.at(-1)!;
  const size = Math.max(prev.size, line.size);
  if (Math.abs(prev.size - line.size) > 0.15 * size) return false;

  // Going up means the next column or a float; a gap wider than the block's own line spacing means a new paragraph.
  const gap = prev.y - line.y;
  const spacing = block.length >= 2 ? block.at(-2)!.y - prev.y : undefined;
  if (gap <= 0.1 * size) return false;
  if (spacing === undefined ? gap > 2.5 * size : gap > 1.4 * spacing + 0.1 * size) return false;

  const left = Math.min(...block.map((l) => l.x0));
  const right = Math.max(...block.map((l) => l.x1));
  if (line.x1 < left || line.x0 > right) return false;
  // A short line followed by an indented one is the end of one paragraph and the start of the next.
  return !(prev.x1 < right - size && line.x0 > left + 0.5 * size);
}

/** Leaves out running headers and footers, the title and author block before the abstract, and the references list. */
function bodyBlocks(pages: readonly PageLayout[]): LaidOutBlock[] {
  const marginBlocks = pages.flatMap((page) => page.blocks.filter((block) => inMargin(page, block)));
  const pagesByKey = new Map<string, Set<number>>();
  for (const block of marginBlocks) {
    const key = marginKey(block);
    pagesByKey.set(key, (pagesByKey.get(key) ?? new Set()).add(block.page));
  }
  const running = new Set(marginBlocks.filter((block) => pagesByKey.get(marginKey(block))!.size >= 2));
  let blocks = pages.flatMap((page) => page.blocks).filter((block) => !running.has(block));

  const abstract = blocks.findIndex((block) => block.page === 1 && ABSTRACT_HEADING.test(block.firstLine));
  if (abstract > 0) blocks = blocks.slice(abstract);

  const references = blocks.findLastIndex((block) => REFERENCES_HEADING.test(block.firstLine));
  if (references >= 0) {
    const appendix = blocks.findIndex((block, i) => i > references && APPENDIX_HEADING.test(block.firstLine));
    blocks = [...blocks.slice(0, references), ...(appendix < 0 ? [] : blocks.slice(appendix))];
  }
  return blocks;
}

/**
 * Turns body blocks into paragraphs: headings become the heading trail of the paragraphs under them, figure and table
 * labels are left out, and a paragraph cut by a column or page break (and any figure placed there) is joined up again.
 */
function paragraphs(blocks: readonly LaidOutBlock[]): Omit<PdfBlock, "textRanges">[] {
  const bodySize = dominantSize(blocks);
  const result: (Omit<PdfBlock, "textRanges"> & { size: number })[] = [];
  let trail: Heading[] = [];
  // The last paragraph, while the next block could still be its continuation.
  let open: (typeof result)[number] | undefined;
  for (const block of blocks) {
    const heading = headingOf(block, bodySize);
    if (heading) {
      trail = [...trail.filter((h) => h.depth < heading.depth), heading];
      open = undefined;
      continue;
    }
    if (isFragment(block)) continue;
    if (open && continues(open, block)) {
      open.text = unwrapTracedLines(joinTraced([open.text, block.text], "\n"));
      continue;
    }
    const headingTrail = trail.map((h) => h.text).join(" > ");
    open = { text: block.text, page: block.page, size: block.size, ...(headingTrail && { heading: headingTrail }) };
    result.push(open);
  }
  return result.map(({ size: _, ...paragraph }) => paragraph);
}

/** The font size that most of the text is set in. */
function dominantSize(blocks: readonly LaidOutBlock[]): number {
  const chars = new Map<number, number>();
  for (const block of blocks) {
    const size = Math.round(block.size * 2) / 2;
    chars.set(size, (chars.get(size) ?? 0) + block.text.text.length);
  }
  let dominant = 0;
  let most = -1;
  for (const [size, count] of chars) {
    if (count > most) [dominant, most] = [size, count];
  }
  return dominant;
}

/** A short block that is numbered like a section or set larger than the body text. */
function headingOf(block: LaidOutBlock, bodySize: number): Heading | undefined {
  const text = block.text.text;
  if (block.lineCount > HEADING_MAX_LINES || wordCount(text) > HEADING_MAX_WORDS || /[.,;:]$/.test(text)) {
    return undefined;
  }
  const numbered = SECTION_NUMBER.exec(text);
  if (numbered) return { depth: numbered[1]?.split(".").length ?? 1, text };
  if (ABSTRACT_HEADING.test(text) || block.size >= bodySize * HEADING_SIZE_RATIO) return { depth: 1, text };
  return undefined;
}

function isFragment(block: LaidOutBlock): boolean {
  const text = block.text.text;
  const words = wordCount(text);
  return (
    (text.match(/\p{L}/gu) ?? []).length < MIN_LETTERS ||
    words < MIN_WORDS ||
    (words < MIN_UNENDED_WORDS && !SENTENCE_END.test(text))
  );
}

/** Whether `block` carries on the sentence `paragraph` breaks off in, in the same size of type. */
function continues(paragraph: { text: TracedText; size: number }, block: LaidOutBlock): boolean {
  const before = paragraph.text.text;
  const after = block.text.text;
  if (PARAGRAPH_END.test(before)) return false;
  if (Math.abs(paragraph.size - block.size) > 0.15 * Math.max(paragraph.size, block.size)) return false;
  return CONTINUATION_START.test(after) || (CJK_CHAR.test(before.at(-1) ?? "") && CJK_CHAR.test(after[0] ?? ""));
}

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });

function wordCount(text: string): number {
  let count = 0;
  for (const segment of wordSegmenter.segment(text)) if (segment.isWordLike) count++;
  return count;
}

function shifted(text: TracedText, base: number): TracedText {
  return { text: text.text, offsets: text.offsets.map((offset) => (offset < 0 ? offset : offset + base)) };
}

function inMargin(page: PageLayout, block: LaidOutBlock): boolean {
  const margin = MARGIN_SHARE * (page.top - page.bottom);
  return block.bottom >= page.top - margin || block.top <= page.bottom + margin;
}

/** Running headers and footers repeat from page to page apart from their numbers. */
function marginKey(block: LaidOutBlock): string {
  return block.text.text.replace(/\d+/g, "#").toLowerCase();
}

function isRotated(item: TextItem): boolean {
  return Math.abs(item.transform[1] as number) > 1e-3;
}

function changesBaseline(prev: TextItem, item: TextItem): boolean {
  return Math.abs((prev.transform[5] as number) - (item.transform[5] as number)) > 0.9 * Math.max(fontSize(prev), fontSize(item));
}

function fontSize(item: TextItem): number {
  return Math.hypot(item.transform[2] as number, item.transform[3] as number);
}
