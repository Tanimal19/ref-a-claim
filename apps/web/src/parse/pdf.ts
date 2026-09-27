import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdf, pageTextContent, textItems } from "../pdfjs.ts";
import type { TextRange } from "../types.ts";
import { rangesOf, splitTracedParagraphs, traced, type TracedText } from "./split.ts";

export interface PdfBlock {
  text: TracedText;
  page: number;
  /** Maps offsets from `text` (or from pieces cut out of it) to the page's text items. */
  textRanges: (offsets: readonly number[]) => TextRange[];
}

export async function pdfBlocks(data: Uint8Array): Promise<PdfBlock[]> {
  const loadingTask = loadPdf(data);
  try {
    const pdf = await loadingTask.promise;
    const pages = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pageBlocks(pdf, i + 1)));
    return pages.flat();
  } finally {
    await loadingTask.destroy();
  }
}

async function pageBlocks(pdf: PDFDocumentProxy, pageNumber: number): Promise<PdfBlock[]> {
  const items = textItems(await pageTextContent(await pdf.getPage(pageNumber)));
  // The page's text is its items joined, with a line break after each item that ends a line. For every UTF-16 code
  // unit of it, `itemOf` holds the item it came from (-1 for the line breaks) and `charOf` its position in that item.
  let pageText = "";
  const itemOf: number[] = [];
  const charOf: number[] = [];
  items.forEach((item, index) => {
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

  const textRanges = (offsets: readonly number[]) =>
    rangesOf(offsets, (offset) => (itemOf[offset]! < 0 ? undefined : { item: itemOf[offset]!, char: charOf[offset]! }));
  return splitTracedParagraphs(traced(pageText)).map((text) => ({ text, page: pageNumber, textRanges }));
}
