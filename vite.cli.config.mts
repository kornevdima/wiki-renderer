// Bundles the `wiki-renderer` CLI (src/cli/main.ts) into one `build-cli/cli.mjs` (US-278). The CLI reuses the app's config
// reader/writer and `checkNewFolder`, which use the `@/` alias and extensionless imports Node cannot load unbundled.
// Run with `npm run build:cli`; `scripts/package.mjs` puts the result in the archive beside `server.js`.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  publicDir: false,
  resolve: { alias: { "@": resolve(root, "src") } },
  ssr: { noExternal: true },
  build: {
    ssr: resolve(root, "src/cli/main.ts"),
    outDir: resolve(root, "build-cli"),
    emptyOutDir: true,
    target: "node24",
    minify: false,
    rollupOptions: { output: { format: "es", entryFileNames: "cli.mjs" } },
  },
});
