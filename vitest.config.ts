// Unit suite: src/**/*.test.ts, no network. `server-only` is aliased to a no-op stub so server modules import in node.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "src");

export default defineConfig({
  resolve: {
    alias: {
      "@": srcDir,
      "server-only": resolve(srcDir, "lib/__test-stubs__/server-only.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "tests/e2e/**"],
    environment: "node",
    reporters: ["default"],
  },
});
