import path from "node:path";
import { defineConfig } from "vitest/config";

const root = path.resolve(import.meta.dirname);

export default defineConfig({
  resolve: {
    alias: {
      "@mapscribe/core": path.join(root, "packages/core/src/index.ts"),
      "@mapscribe/geo": path.join(root, "packages/geo/src/index.ts"),
      "@mapscribe/renderer": path.join(root, "packages/renderer/src/index.ts"),
      "@mapscribe/editor": path.join(root, "packages/editor/src/index.ts"),
      "@mapscribe/exporters": path.join(root, "packages/exporters/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    server: {
      deps: {
        external: ["playwright"],
      },
    },
  },
});
