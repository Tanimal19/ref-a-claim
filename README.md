# ref-a-claim

Enter a claim, pick a folder of `.pdf`, `.md` or `.txt` files, and read each paper as it
is, with the paragraphs that support or refute the claim tinted in place. Each paragraph is classified by TypeSafe's
[Jev](https://docs.typesafe.ai/introduction) model.

![ref-a-claim checking a claim against a folder of papers](docs/demo.gif)

<sub>The papers in the video are fictional examples.</sub>

Everything runs in the browser; nothing is sent to a server.
See demo at [https://ref-a-claim.vercel.app/](https://ref-a-claim.vercel.app/).

## Settings

The gear button opens Settings: the TypeSafe API key, the model, the maximum paragraph length, and how much surrounding context is sent with each paragraph. The key is kept in the tab's `sessionStorage`, so it is cleared when the tab closes; the other settings are kept in `localStorage`.

## Run Locally

```sh
pnpm install
pnpm dev
```

## How it works

1. Picked files are read in the browser and split into paragraphs: PDFs by extracting their text
   with pdf.js and splitting it on blank lines, Markdown by parsing it (GFM) and taking its prose
   blocks (paragraphs, lists, block quotes, tables, footnotes; headings, code and HTML are left out),
   and plain text by splitting it on blank lines. Any paragraph longer than the maximum paragraph
   length is split on sentence boundaries. pdf.js seldom reports blank lines in a PDF's text, so a
   PDF usually comes out as one stretch per page, and its paragraphs are in practice runs of whole
   sentences up to that maximum length. Each paragraph remembers which text items (and which
   characters of them) it came from: pdf.js text items for PDFs, text and inline code nodes of the
   syntax tree for Markdown, and the file itself for plain text. Changing that length in Settings
   re-reads the loaded documents.
2. **Analyze** sends one Jev request per paragraph, with `{ claim, context, passage }` as the state
   and a single Choice question (`supports` / `refutes` / `unrelated`), at most 8 at a time.
   `context` holds the neighbouring paragraphs in the same document (how many is a setting), plus
   the heading trail for Markdown; the model reads it only to understand `passage`, and the stance
   is about `passage` alone. Results appear as each request finishes.
3. The results show the original document: a PDF as drawn by pdf.js (canvas plus its text layer),
   Markdown rendered as HTML (raw HTML is shown as source, not run; images as their alt text), and
   plain text as written. Each paragraph's characters are wrapped in spans and tinted by stance;
   unrelated paragraphs stay untinted. Hovering over a tinted paragraph shows its scores.

To keep a finished (or cancelled / failed) analysis, click **Export results** to download it as JSON, and later
**Open results…** to load that file back into the UI — claim, documents, and results are restored
without re-reading or re-running anything. The file embeds the original files (base64), so it is
about a third larger than the papers themselves.
