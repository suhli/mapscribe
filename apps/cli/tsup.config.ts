import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Options } from "tsup";

const jsToTs: NonNullable<Options["esbuildPlugins"]>[number] = {
  name: "js-to-ts",
  setup(build) {
    build.onResolve({ filter: /^\.{1,2}\/.*\.js$/ }, (args) => {
      const candidate = path.resolve(args.resolveDir, args.path.replace(/\.js$/, ".ts"));
      if (existsSync(candidate)) return { path: candidate };
      return null;
    });
  },
};

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  clean: true,
  target: "node20",
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
  external: ["playwright"],
  noExternal: [/^@mapscribe\//],
  esbuildPlugins: [jsToTs],
});
