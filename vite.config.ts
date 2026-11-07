import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Preload the two Latin font files that the first screen uses, so text is painted in its final font and the layout does not shift. */
function preloadFonts(): Plugin {
  return {
    name: "preload-fonts",
    apply: "build",
    transformIndexHtml(html, ctx) {
      const files = Object.keys(ctx.bundle ?? {}).filter((f) => /(fraunces-latin-opsz-normal|figtree-latin-wght-normal)-.*\.woff2$/.test(f));
      const tags = files.map((href) => ({ tag: "link", attrs: { rel: "preload", as: "font", type: "font/woff2", href: `/${href}`, crossorigin: "" }, injectTo: "head" as const }));
      return { html, tags };
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadFonts()],
  server: {
    // Run `npm run pages:dev` (wrangler) for the full stack; this proxies /api to it during `npm run dev`.
    proxy: { "/api": "http://localhost:8788" },
  },
  test: { environment: "node", include: ["src/**/*.test.ts", "functions/**/*.test.ts"] },
});
