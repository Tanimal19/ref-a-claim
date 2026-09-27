import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    // pdf.js fetches these by URL at run time: CMaps for CJK text, standard fonts for PDFs that don't embed theirs.
    viteStaticCopy({
      targets: [
        { src: "node_modules/pdfjs-dist/cmaps/*", dest: "pdfjs/cmaps", rename: { stripBase: true } },
        { src: "node_modules/pdfjs-dist/standard_fonts/*", dest: "pdfjs/standard_fonts", rename: { stripBase: true } },
      ],
    }),
  ],
  server: {
    // TypeSafe's API only allows CORS from its own console, so the browser calls it through this same-origin path.
    // In production, vercel.json rewrites the same path.
    proxy: {
      "/typesafe": {
        target: "https://api.typesafe.ai",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/typesafe/, ""),
      },
    },
  },
});
