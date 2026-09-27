import { documentFormat, type ParseResult, type ParsedDocument, type Passage, type TextRange } from "../types.ts";
import { markdownBlocks } from "./markdown.ts";
import { chunkTracedBySentence, rangesOf, splitTracedParagraphs, traced, type TracedText } from "./split.ts";

interface Block {
  text: TracedText;
  page?: number;
  heading?: string;
  textRanges: (offsets: readonly number[]) => TextRange[];
}

/** Each document's path is the file's path relative to the picked folder. */
export async function parseDocuments(files: readonly File[], passageMaxChars: number): Promise<ParseResult> {
  const paths = files.map((file) => file.webkitRelativePath || file.name);
  const settled = await Promise.allSettled(files.map((file, i) => parseDocument(file, paths[i]!, passageMaxChars)));
  const result: ParseResult = { documents: [], failures: [] };
  settled.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") {
      result.documents.push(outcome.value);
    } else {
      const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      result.failures.push({ path: paths[i]!, message });
    }
  });
  return result;
}

async function parseDocument(
  file: File,
  path: string,
  passageMaxChars: number,
): Promise<ParsedDocument> {
  const blocks = await blocksOf(file, path);
  const id = crypto.randomUUID();
  const passages: Passage[] = blocks
    .flatMap(({ text, textRanges, ...rest }) =>
      chunkTracedBySentence(text, passageMaxChars).map((chunk) => ({
        ...rest,
        text: chunk.text,
        textRanges: textRanges(chunk.offsets),
      })),
    )
    .map(({ text, page, heading, textRanges }, index) => ({
      id: `${id}:${index}`,
      index,
      text,
      ...(page === undefined ? {} : { page }),
      ...(heading === undefined ? {} : { heading }),
      textRanges,
    }));
  return { id, path, passages };
}

async function blocksOf(file: File, path: string): Promise<Block[]> {
  switch (documentFormat(path)) {
    case "pdf":
      // pdf.js is most of the bundle, so it loads only once a PDF is read.
      return (await import("./pdf.ts")).pdfBlocks(new Uint8Array(await file.arrayBuffer()));
    case "markdown":
      return markdownBlocks(await file.text());
    case "text":
      return splitTracedParagraphs(traced(await file.text())).map((text) => ({ text, textRanges: plainTextRanges }));
    default:
      throw new Error("Unsupported file type; expected .pdf, .md, .markdown or .txt");
  }
}

function plainTextRanges(offsets: readonly number[]): TextRange[] {
  return rangesOf(offsets, (offset) => ({ item: 0, char: offset }));
}
