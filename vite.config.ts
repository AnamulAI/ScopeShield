import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Run `npm run pages:dev` (wrangler) for the full stack; this proxies /api to it during `npm run dev`.
    proxy: { "/api": "http://localhost:8788" },
  },
  test: { environment: "node", include: ["src/**/*.test.ts", "functions/**/*.test.ts"] },
});
