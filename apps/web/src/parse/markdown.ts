import type { InlineCode, Nodes, Root, RootContent, Text } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import type { TextRange } from "../types.ts";
import { joinTraced, rangesOf, unwrapLines, unwrapTracedLines, type TracedText } from "./split.ts";

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

export type TextItem = Text | InlineCode;

export interface MarkdownTree {
  root: Root;
  /** Every text and inline code node, numbered in document order; `TextRange.item` counts these. */
  items: ReadonlyMap<TextItem, number>;
}

export interface MarkdownBlock {
  text: TracedText;
  heading?: string;
  textRanges: (offsets: readonly number[]) => TextRange[];
}

/** Reading a document and showing it must both go through here, so they number the same items. */
export function readMarkdown(source: string): MarkdownTree {
  const root = fromMarkdown(source.replace(FRONTMATTER, ""), {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const items = new Map<TextItem, number>();
  const visit = (node: Nodes) => {
    if (node.type === "text" || node.type === "inlineCode") items.set(node, items.size);
    else if ("children" in node) node.children.forEach(visit);
  };
  visit(root);
  return { root, items };
}

/**
 * Returns the prose blocks of a Markdown document with syntax removed, each with the trail of
 * top-level headings it sits under. Headings, code, HTML and thematic breaks are not blocks
 * themselves because they carry no stance on their own.
 */
export function markdownBlocks(source: string): MarkdownBlock[] {
  const { root, items } = readMarkdown(source);
  // Offsets in the blocks' text count through the items' text laid end to end; `itemOf` and `charOf` hold, for each
  // code unit of that, the item it is in and its position there.
  const itemStarts = new Map<TextItem, number>();
  const itemOf: number[] = [];
  const charOf: number[] = [];
  for (const [node, item] of items) {
    itemStarts.set(node, itemOf.length);
    for (let char = 0; char < node.value.length; char++) {
      itemOf.push(item);
      charOf.push(char);
    }
  }
  const textRanges = (offsets: readonly number[]) =>
    rangesOf(offsets, (offset) => ({ item: itemOf[offset]!, char: charOf[offset]! }));

  let trail: { depth: number; text: string }[] = [];
  return root.children.flatMap((node) => {
    if (node.type === "heading") {
      const text = unwrapLines(textOf(node, itemStarts).text);
      trail = [...trail.filter((h) => h.depth < node.depth), { depth: node.depth, text }];
      return [];
    }
    const heading = trail.map((h) => h.text).filter((text) => text.length > 0).join(" > ");
    return blocksOf(node, itemStarts)
      .filter((block) => block.text.length > 0)
      .map((text) => (heading === "" ? { text, textRanges } : { text, heading, textRanges }));
  });
}

function blocksOf(node: RootContent, itemStarts: ReadonlyMap<TextItem, number>): TracedText[] {
  switch (node.type) {
    case "paragraph":
      return [unwrapTracedLines(textOf(node, itemStarts))];
    case "list":
      return [
        joinTraced(
          node.children
            .map((item) => joinTraced(item.children.flatMap((child) => blocksOf(child, itemStarts)), " "))
            .filter((item) => item.text.length > 0),
          "\n",
        ),
      ];
    case "blockquote":
    case "footnoteDefinition":
      return node.children.flatMap((child) => blocksOf(child, itemStarts));
    case "table":
      return [
        joinTraced(
          node.children.map((row) =>
            joinTraced(
              row.children.map((cell) => unwrapTracedLines(textOf(cell, itemStarts))),
              " | ",
            ),
          ),
          "\n",
        ),
      ];
    default:
      return [];
  }
}

function textOf(node: Nodes, itemStarts: ReadonlyMap<TextItem, number>): TracedText {
  if (node.type === "break") return { text: "\n", offsets: [-1] };
  if (node.type === "text" || node.type === "inlineCode") {
    const start = itemStarts.get(node)!;
    return { text: node.value, offsets: Array.from({ length: node.value.length }, (_, i) => start + i) };
  }
  if ("children" in node) return joinTraced(node.children.map((child) => textOf(child, itemStarts)), "");
  return { text: "", offsets: [] };
}
