import type { Definition, List, Nodes, RootContent, Table } from "mdast";
import { Fragment, useMemo, type ReactNode } from "react";
import type { MarkdownTree } from "../parse/markdown.ts";

interface Props {
  tree: MarkdownTree;
  /** Draws `text`, the text of item `item`. */
  renderItem: (item: number, text: string) => ReactNode;
}

interface Context {
  items: MarkdownTree["items"];
  /** Link and image reference definitions, by identifier. */
  definitions: ReadonlyMap<string, Definition>;
  renderItem: Props["renderItem"];
}

const LINK_PROTOCOLS = ["http:", "https:", "mailto:"];

/**
 * Renders the syntax tree as HTML. Raw HTML in the source is shown as text rather than run, images by their alt text
 * (the image files are not at hand), and links only when they are absolute web or mail links.
 */
export function MarkdownContent({ tree, renderItem }: Props) {
  const definitions = useMemo(() => {
    const byIdentifier = new Map<string, Definition>();
    const visit = (node: Nodes) => {
      if (node.type === "definition") byIdentifier.set(node.identifier, node);
      else if ("children" in node) node.children.forEach(visit);
    };
    visit(tree.root);
    return byIdentifier;
  }, [tree]);

  return <>{renderNodes(tree.root.children, { items: tree.items, definitions, renderItem }, false)}</>;
}

function renderNodes(nodes: readonly RootContent[], context: Context, inline: boolean): ReactNode[] {
  return nodes.map((node, key) => renderNode(node, key, context, inline));
}

function renderNode(node: RootContent, key: number, context: Context, inline: boolean): ReactNode {
  switch (node.type) {
    case "paragraph":
      return <p key={key}>{renderNodes(node.children, context, true)}</p>;
    case "heading": {
      const Heading = `h${node.depth}` as const;
      return <Heading key={key}>{renderNodes(node.children, context, true)}</Heading>;
    }
    case "thematicBreak":
      return <hr key={key} />;
    case "blockquote":
      return <blockquote key={key}>{renderNodes(node.children, context, false)}</blockquote>;
    case "list":
      return renderList(node, key, context);
    case "table":
      return renderTable(node, key, context);
    case "code":
      return (
        <pre key={key} className="md-code">
          <code>{node.value}</code>
        </pre>
      );
    case "html":
      return inline ? (
        <code key={key} className="md-raw">
          {node.value}
        </code>
      ) : (
        <pre key={key} className="md-raw">
          {node.value}
        </pre>
      );
    case "footnoteDefinition":
      return (
        <div key={key} className="md-footnote">
          <span className="md-footnote-label">[{node.label ?? node.identifier}]</span>
          {renderNodes(node.children, context, false)}
        </div>
      );
    case "text":
      return <Fragment key={key}>{context.renderItem(context.items.get(node)!, node.value)}</Fragment>;
    case "inlineCode":
      return <code key={key}>{context.renderItem(context.items.get(node)!, node.value)}</code>;
    case "emphasis":
      return <em key={key}>{renderNodes(node.children, context, true)}</em>;
    case "strong":
      return <strong key={key}>{renderNodes(node.children, context, true)}</strong>;
    case "delete":
      return <del key={key}>{renderNodes(node.children, context, true)}</del>;
    case "break":
      return <br key={key} />;
    case "link":
      return renderLink(node.url, node.title, renderNodes(node.children, context, true), key);
    case "linkReference": {
      const definition = context.definitions.get(node.identifier);
      return renderLink(definition?.url, definition?.title, renderNodes(node.children, context, true), key);
    }
    case "image":
    case "imageReference":
      return (
        <span key={key} className="md-image">
          {node.alt}
        </span>
      );
    case "footnoteReference":
      return (
        <sup key={key} className="md-footnote-ref">
          [{node.label ?? node.identifier}]
        </sup>
      );
    default:
      // Definitions draw nothing; list items and table rows and cells are drawn by their parents.
      return null;
  }
}

function renderList(list: List, key: number, context: Context): ReactNode {
  // As in HTML rendered from Markdown, the items of a tight list hold their paragraphs' text without paragraph breaks.
  const tight = !list.spread && !list.children.some((item) => item.spread);
  const items = list.children.map((item, i) => (
    <li key={i} className={item.checked == null ? undefined : "md-task"}>
      {item.checked != null && <input type="checkbox" checked={item.checked} disabled readOnly />}
      {item.children.map((child, j) =>
        tight && child.type === "paragraph" ? (
          <Fragment key={j}>{renderNodes(child.children, context, true)}</Fragment>
        ) : (
          renderNode(child, j, context, false)
        ),
      )}
    </li>
  ));
  return list.ordered ? (
    <ol key={key} start={list.start ?? undefined}>
      {items}
    </ol>
  ) : (
    <ul key={key}>{items}</ul>
  );
}

function renderTable(table: Table, key: number, context: Context): ReactNode {
  const [head, ...body] = table.children;
  const cells = (row: Table["children"][number], Cell: "th" | "td") =>
    row.children.map((cell, i) => (
      <Cell key={i} style={{ textAlign: table.align?.[i] ?? undefined }}>
        {renderNodes(cell.children, context, true)}
      </Cell>
    ));
  return (
    <div key={key} className="md-table">
      <table>
        {head && (
          <thead>
            <tr>{cells(head, "th")}</tr>
          </thead>
        )}
        {body.length > 0 && (
          <tbody>
            {body.map((row, i) => (
              <tr key={i}>{cells(row, "td")}</tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}

function renderLink(url: string | undefined, title: string | null | undefined, children: ReactNode, key: number) {
  const href = url !== undefined && isLinkable(url) ? url : undefined;
  return href ? (
    <a key={key} href={href} title={title ?? undefined} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : (
    <span key={key} className="md-link">
      {children}
    </span>
  );
}

function isLinkable(url: string): boolean {
  try {
    return LINK_PROTOCOLS.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
