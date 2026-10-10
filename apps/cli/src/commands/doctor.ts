import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
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
    const assets = path.join(dir, "assets");
    const fontReady = existsSync(assets) && readdirSync(assets).some((name) => name.includes("noto-sans-sc-chinese-simplified"));
    checks.push({
      name: "font",
      ok: fontReady,
      detail: fontReady ? "渲染页包含 Noto Sans SC 简体字体" : "渲染页缺少中文字体，标签可能变成方框",
    });
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
