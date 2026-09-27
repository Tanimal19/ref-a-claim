import type { Nodes, RootContent } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { unwrapLines } from "./split.ts";

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

/**
 * Returns the prose blocks of a Markdown document with syntax removed, each with the trail of
 * top-level headings it sits under. Headings, code, HTML and thematic breaks are not blocks
 * themselves because they carry no stance on their own.
 */
export function markdownBlocks(source: string): { text: string; heading?: string }[] {
  const tree = fromMarkdown(source.replace(FRONTMATTER, ""), {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  let trail: { depth: number; text: string }[] = [];
  return tree.children.flatMap((node) => {
    if (node.type === "heading") {
      trail = [...trail.filter((h) => h.depth < node.depth), { depth: node.depth, text: unwrapLines(textOf(node)) }];
      return [];
    }
    const heading = trail.map((h) => h.text).filter((text) => text.length > 0).join(" > ");
    return blocksOf(node)
      .filter((block) => block.length > 0)
      .map((text) => (heading === "" ? { text } : { text, heading }));
  });
}

function blocksOf(node: RootContent): string[] {
  switch (node.type) {
    case "paragraph":
      return [unwrapLines(textOf(node))];
    case "list":
      return [
        node.children
          .map((item) => item.children.flatMap(blocksOf).join(" "))
          .filter((item) => item.length > 0)
          .join("\n"),
      ];
    case "blockquote":
    case "footnoteDefinition":
      return node.children.flatMap(blocksOf);
    case "table":
      return [
        node.children
          .map((row) => row.children.map((cell) => unwrapLines(textOf(cell))).join(" | "))
          .join("\n"),
      ];
    default:
      return [];
  }
}

function textOf(node: Nodes): string {
  if (node.type === "break") return "\n";
  if ("value" in node && node.type !== "html") return node.value;
  if ("children" in node) return node.children.map((child) => textOf(child)).join("");
  return "";
}
