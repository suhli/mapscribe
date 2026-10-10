import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function isBuiltRenderDir(directory: string): boolean {
  const htmlPath = path.join(directory, "index.html");
  if (!existsSync(htmlPath)) return false;
  return readFileSync(htmlPath, "utf8").includes("./assets/");
}

/** 定位 Vite 构建出的无头渲染页，跳过仍引用 main.ts 的源码目录。 */
export function resolveRenderPageDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "render"),
    path.resolve(here, "../../dist/render"),
    path.resolve(here, "../dist/render"),
  ];
  for (const candidate of candidates) {
    if (isBuiltRenderDir(candidate)) return candidate;
  }
  throw new Error("渲染页面未构建。请先运行 pnpm --filter @mapscribe/cli build:page");
}
