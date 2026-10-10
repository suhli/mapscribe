import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 定位 Vite 构建出的无头渲染页。 */
export function resolveRenderPageDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../render"),
    path.resolve(here, "../../dist/render"),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "index.html"))) return candidate;
  }
  throw new Error("渲染页面未构建。请先运行 pnpm --filter @mapscribe/cli build:page");
}
