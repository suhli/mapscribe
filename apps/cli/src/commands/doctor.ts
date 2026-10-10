import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { resolveRenderPageDir } from "../render/paths.js";
import { printResult } from "../output.js";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export async function doctor(json: boolean): Promise<number> {
  const checks: Check[] = [];
  const major = Number(process.versions.node.split(".")[0]);
  checks.push({
    name: "node",
    ok: major >= 20,
    detail: `当前 Node.js ${process.versions.node}，需要 20 或更高版本`,
  });

  try {
    const dir = resolveRenderPageDir();
    checks.push({ name: "render-page", ok: existsSync(dir), detail: dir });
  } catch (error) {
    checks.push({
      name: "render-page",
      ok: false,
      detail: error instanceof Error ? error.message : "渲染页面不存在",
    });
  }

  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    checks.push({ name: "chromium", ok: true, detail: "Playwright Chromium 可以启动" });
  } catch (error) {
    checks.push({
      name: "chromium",
      ok: false,
      detail: `${error instanceof Error ? error.message : "无法启动 Chromium"}。可运行 mapscribe install，它只会把浏览器安装到 Playwright 缓存，不会修改系统环境。`,
    });
  }

  const ok = checks.every((check) => check.ok);
  const message = checks.map((check) => `${check.ok ? "OK" : "FAIL"}  ${check.name}: ${check.detail}`).join("\n");
  printResult({ ok, command: "doctor", message, checks }, json);
  return ok ? 0 : 1;
}
