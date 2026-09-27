# ref-a-claim

Enter a claim, pick a folder of `.pdf`, `.md` / `.markdown` and `.txt` files, and read each paper as it
is, with the paragraphs that support or refute the claim tinted in place. Each paragraph is classified by TypeSafe's
[Jev](https://docs.typesafe.ai/introduction) model.

Everything runs in the browser; each user brings their own TypeSafe API key.

## Setup

```sh
pnpm install
```

## Settings

The gear button opens Settings: the TypeSafe API key, the model, the maximum paragraph length,
and how much surrounding context is sent with each paragraph. The key is kept in the tab's
`sessionStorage`, so it is cleared when the tab closes; the other settings are kept in
`localStorage`.

## Run

```sh
pnpm dev               # http://localhost:5173
```

Or build and serve the production bundle locally:

```sh
pnpm build && pnpm preview
```

## Deploy

The site is static apart from one path: TypeSafe's API only allows CORS from its own console, so the
browser calls it through `/typesafe/*` on the site's own origin, which is relayed to
`https://api.typesafe.ai/*`. `vite.config.ts` does this for `pnpm dev` / `pnpm preview`, and
`vercel.json` does it on Vercel with an external rewrite (response caching off). To deploy, import
the repo into Vercel with the Root Directory left at the repo root; `vercel.json` sets the build.

A host without rewrites (such as GitHub Pages) would need a separate relay, or TypeSafe to allow
the site's origin.

## How it works

1. Picked files are read in the browser and split into paragraphs: PDFs by extracting their text
   with pdf.js and splitting it on blank lines, Markdown by parsing it (GFM) and taking its prose
   blocks (paragraphs, lists, block quotes, tables, footnotes; headings, code and HTML are left out),
   and plain text by splitting it on blank lines. Any paragraph longer than the maximum paragraph
   length is split on sentence boundaries. Each paragraph remembers which text items (and which
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
   unrelated paragraphs stay untinted. Clicking a tinted paragraph shows its scores.

Nothing is stored anywhere; reloading the page clears everything. To keep a finished (or
cancelled / failed) analysis, click **Export results** to download it as JSON, and later
**Open results…** to load that file back into the UI — claim, documents, and results are restored
without re-reading or re-running anything. The file embeds the original files (base64), so it is
about a third larger than the papers themselves.
