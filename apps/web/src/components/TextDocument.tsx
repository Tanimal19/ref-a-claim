import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { readMarkdown } from "../parse/markdown.ts";
import { highlightClass, type Highlight, type PassageStart } from "./highlights.ts";
import { MarkdownContent } from "./MarkdownContent.tsx";

interface Props {
  file: File;
  format: "markdown" | "text";
  highlights: readonly Highlight[];
  starts: readonly PassageStart[];
  /** Called after highlights are (re)drawn, so the view can scroll to a passage that has just been drawn. */
  onPainted: () => void;
}

interface Segment {
  start: number;
  end: number;
  highlight: Highlight;
}

/** Shows a Markdown document rendered, or a plain-text one as written, with its passages' text items tinted. */
export function TextDocument({ file, format, highlights, starts, onPainted }: Props) {
  const [source, setSource] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    file.text().then(
      (text) => {
        if (!cancelled) setSource(text);
      },
      (reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [file]);

  const markdown = useMemo(
    () => (format === "markdown" && source !== undefined ? readMarkdown(source) : undefined),
    [format, source],
  );

  const segmentsByItem = useMemo(() => {
    const byItem = new Map<number, Segment[]>();
    for (const highlight of highlights) {
      for (const { item, start, end } of highlight.ranges) {
        let segments = byItem.get(item);
        if (!segments) byItem.set(item, (segments = []));
        segments.push({ start, end, highlight });
      }
    }
    for (const segments of byItem.values()) segments.sort((a, b) => a.start - b.start);
    return byItem;
  }, [highlights]);

  const startsByItem = useMemo(() => {
    const byItem = new Map<number, PassageStart[]>();
    for (const start of starts) {
      let onItem = byItem.get(start.item);
      if (!onItem) byItem.set(start.item, (onItem = []));
      onItem.push(start);
    }
    for (const onItem of byItem.values()) onItem.sort((a, b) => a.start - b.start);
    return byItem;
  }, [starts]);

  useLayoutEffect(() => {
    if (source !== undefined) onPainted();
  }, [source, segmentsByItem, startsByItem, onPainted]);

  if (error) return <p className="error document-status">The document could not be shown: {error}</p>;
  if (source === undefined) return <p className="document-status">Loading…</p>;

  const renderItem = (item: number, text: string) =>
    itemContent(text, segmentsByItem.get(item) ?? NO_SEGMENTS, startsByItem.get(item) ?? NO_STARTS);

  return (
    <div className="text-pages">
      {markdown ? (
        <article className="text-document markdown">
          <MarkdownContent tree={markdown} renderItem={renderItem} />
        </article>
      ) : (
        <pre className="text-document plain">{renderItem(0, source)}</pre>
      )}
    </div>
  );
}

const NO_SEGMENTS: readonly Segment[] = [];
const NO_STARTS: readonly PassageStart[] = [];

/**
 * Splits an item's text into tinted spans, the way the PDF text layer does, with a marker just before the first
 * character of each passage that begins in it. `segments` and `starts` are sorted by `start`; where segments overlap,
 * the earlier one wins.
 */
function itemContent(text: string, segments: readonly Segment[], starts: readonly PassageStart[]): ReactNode[] {
  const cuts = new Set([0, text.length]);
  for (const { start, end } of segments) {
    cuts.add(Math.min(start, text.length));
    cuts.add(Math.min(end, text.length));
  }
  for (const { start } of starts) if (start < text.length) cuts.add(start);
  const positions = [...cuts].sort((a, b) => a - b);

  const nodes: ReactNode[] = [];
  let segment = 0;
  let marker = 0;
  for (let i = 0; i + 1 < positions.length; i++) {
    const from = positions[i]!;
    const to = positions[i + 1]!;
    for (; marker < starts.length && starts[marker]!.start <= from; marker++) {
      const { passageId, category } = starts[marker]!;
      nodes.push(
        <span key={`marker:${passageId}`} className={`passage-marker ${category ?? "pending"}`} aria-hidden="true" />,
      );
    }
    while (segment < segments.length && segments[segment]!.end <= from) segment++;
    let covering: Segment | undefined;
    for (let j = segment; !covering && j < segments.length && segments[j]!.start <= from; j++) {
      if (from < segments[j]!.end) covering = segments[j];
    }
    const piece = text.slice(from, to);
    nodes.push(
      covering ? (
        <span key={from} className={highlightClass(covering.highlight)} data-passage-id={covering.highlight.passageId}>
          {piece}
        </span>
      ) : (
        piece
      ),
    );
  }
  return nodes;
}
