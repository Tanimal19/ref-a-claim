import { TextLayer, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useMessages } from "../i18n/index.tsx";
import { pageTextContent } from "../pdfjs.ts";
import type { Category } from "../results.ts";
import { highlightClass, type Highlight, type PassageStart } from "./highlights.ts";

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  /** pdf.js viewport scale; the page is drawn `width` × `height` CSS pixels. */
  scale: number;
  userUnit: number;
  width: number;
  height: number;
  /** The scrolling element; pages are drawn only while near its visible area. */
  root: HTMLElement | null;
  highlights: readonly Highlight[];
  /** Every passage on the page, analyzed or not, each marked where it begins. */
  passageStarts: readonly PassageStart[];
  /** Called after highlights are (re)applied, so the view can scroll to a passage that has just been drawn. */
  onPainted: (pageNumber: number) => void;
}

interface Layer {
  divs: HTMLElement[];
  strs: string[];
  /** Items whose div currently holds highlight spans. */
  painted: number[];
}

/** Marks where a passage begins, so passages that run together can be told apart. */
interface Marker {
  passageId: string;
  category?: Category;
  top: number;
  left: number;
}

export function PdfPage(props: Props) {
  const { pdf, pageNumber, scale, userUnit, width, height, root, highlights, passageStarts } = props;
  const { onPainted } = props;
  const m = useMessages();
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<Layer>(undefined);
  const [near, setNear] = useState(false);
  const [layerVersion, setLayerVersion] = useState(0);
  const [error, setError] = useState<string>();
  const [markers, setMarkers] = useState<Marker[]>([]);

  useEffect(() => {
    const page = pageRef.current;
    if (!page || !root) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry!.isIntersecting), {
      root,
      rootMargin: "100% 0px",
    });
    observer.observe(page);
    return () => observer.disconnect();
  }, [root]);

  // Pages far from view are torn down again, so a long paper holds only a few canvases at a time.
  useEffect(() => {
    const canvasHost = canvasHostRef.current;
    const textContainer = textRef.current;
    if (!near || !canvasHost || !textContainer) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    let textLayer: TextLayer | undefined;
    // A fresh canvas per drawing: pdf.js refuses a canvas that a cancelled render may still be using.
    const canvas = document.createElement("canvas");
    canvasHost.append(canvas);
    const fail = (reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
    };

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      renderTask = page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      renderTask.promise.catch(fail);

      const content = await pageTextContent(page);
      if (cancelled) return;
      textLayer = new TextLayer({ textContentSource: content, container: textContainer, viewport });
      await textLayer.render();
      if (cancelled) return;
      layerRef.current = { divs: textLayer.textDivs, strs: textLayer.textContentItemsStr, painted: [] };
      setLayerVersion((version) => version + 1);
    })().catch(fail);

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      layerRef.current = undefined;
      canvas.remove();
      // Releases the bitmap now rather than whenever the element is collected.
      canvas.width = canvas.height = 0;
      textContainer.replaceChildren();
    };
  }, [pdf, pageNumber, scale, near]);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const page = pageRef.current;
    if (!layer || !page) {
      setMarkers([]);
      return;
    }
    paint(layer, highlights);
    setMarkers(markersOf(page, layer, passageStarts));
    onPainted(pageNumber);
  }, [layerVersion, highlights, passageStarts, width, onPainted, pageNumber]);

  const style = {
    width,
    height,
    "--total-scale-factor": scale * userUnit,
    "--scale-round-x": "1px",
    "--scale-round-y": "1px",
  } as CSSProperties;

  return (
    <div ref={pageRef} className="pdf-page" data-page-number={pageNumber} style={style}>
      <div ref={canvasHostRef} className="pdf-canvas" />
      <div ref={textRef} className="textLayer" />
      {near &&
        markers.map((marker) => (
        <span
          key={marker.passageId}
          className={`passage-marker ${marker.category ?? "pending"}`}
          style={{ top: marker.top, left: marker.left }}
          aria-hidden="true"
        />
        ))}
      {error && <p className="pdf-page-error error">{m.document.pageError(pageNumber, error)}</p>}
    </div>
  );
}

/**
 * Wraps each highlighted stretch of a text item in a span, the way pdf.js's own find highlighting does. The spans sit
 * inside the item's positioned and scaled div, so they cover exactly the glyphs drawn on the canvas below.
 */
function paint(layer: Layer, highlights: readonly Highlight[]): void {
  const { divs, strs } = layer;
  for (const item of layer.painted) {
    const div = divs[item];
    if (div) div.textContent = strs[item]!;
  }
  layer.painted = [];

  const byItem = new Map<number, { start: number; end: number; highlight: Highlight }[]>();
  for (const highlight of highlights) {
    for (const { item, start, end } of highlight.ranges) {
      let segments = byItem.get(item);
      if (!segments) byItem.set(item, (segments = []));
      segments.push({ start, end, highlight });
    }
  }

  for (const [item, segments] of byItem) {
    const div = divs[item];
    const str = strs[item];
    if (!div || str === undefined) continue;
    segments.sort((a, b) => a.start - b.start);
    const nodes: Node[] = [];
    let position = 0;
    for (const { start, end, highlight } of segments) {
      const from = Math.max(start, position);
      const to = Math.min(end, str.length);
      if (to <= from) continue;
      if (from > position) nodes.push(document.createTextNode(str.slice(position, from)));
      const span = document.createElement("span");
      span.className = highlightClass(highlight);
      span.dataset.passageId = highlight.passageId;
      span.textContent = str.slice(from, to);
      nodes.push(span);
      position = to;
    }
    if (position < str.length) nodes.push(document.createTextNode(str.slice(position)));
    div.replaceChildren(...nodes);
    layer.painted.push(item);
  }
}

/** Placed over the first character of each passage; run after painting, as painting splits the items' text. */
function markersOf(page: HTMLElement, layer: Layer, starts: readonly PassageStart[]): Marker[] {
  const origin = page.getBoundingClientRect();
  return starts.flatMap(({ passageId, category, item, start }) => {
    const div = layer.divs[item];
    const rect = div && charRect(div, start);
    if (!rect) return [];
    return [{ passageId, category, top: rect.top - origin.top, left: rect.left - origin.left }];
  });
}

/** The on-screen box of the UTF-16 code unit at `offset` in `div`'s text, however the text is split into nodes. */
function charRect(div: HTMLElement, offset: number): DOMRect | undefined {
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (remaining < length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.setEnd(node, remaining + 1);
      return range.getBoundingClientRect();
    }
    remaining -= length;
  }
  return undefined;
}
