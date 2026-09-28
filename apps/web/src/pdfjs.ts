import {
  GlobalWorkerOptions,
  PDFWorker,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFPageProxy,
} from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export type TextContent = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>;
export type TextItem = Extract<TextContent["items"][number], { str: string }>;

// Copied into the build by vite.config.ts. Without the CMaps, text in CJK fonts that rely on them comes out empty or garbled.
const assetRoot = new URL(`${import.meta.env.BASE_URL}pdfjs/`, location.href);
const cMapUrl = new URL("cmaps/", assetRoot).href;
const standardFontDataUrl = new URL("standard_fonts/", assetRoot).href;

GlobalWorkerOptions.workerSrc = workerSrc;
// One worker thread shared by every document, rather than one per document.
let worker: PDFWorker | undefined;

/** pdf.js takes ownership of `data`, so callers pass a buffer they no longer need. */
export function loadPdf(data: Uint8Array): PDFDocumentLoadingTask {
  worker ??= new PDFWorker();
  return getDocument({ data, worker, cMapUrl, cMapPacked: true, standardFontDataUrl, useSystemFonts: true });
}

/**
 * The page's text content, fetched the same way whenever it is needed: passages record positions by text item, so
 * reading a page and showing it must see the same items.
 */
export function pageTextContent(page: PDFPageProxy): Promise<TextContent> {
  return page.getTextContent();
}

/** The items that carry text, which is what `TextRange.item` counts. */
export function textItems(content: TextContent): TextItem[] {
  return content.items.filter((item): item is TextItem => "str" in item);
}
