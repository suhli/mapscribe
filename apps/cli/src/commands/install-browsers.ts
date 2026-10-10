import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { printResult } from "../output.js";

/** 只安装项目使用的 Playwright Chromium，不调用系统包管理器。 */
export async function installBrowsers(json: boolean): Promise<number> {
  const require = createRequire(import.meta.url);
  const pkg = require.resolve("playwright/package.json");
  const cli = path.join(path.dirname(pkg), "cli.js");
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "install", "chromium"], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (status) => resolve(status ?? 1));
  });
  if (!json) return code;
  printResult(
    {
      ok: code === 0,
      command: "install",
      message: code === 0 ? "Chromium 已安装到 Playwright 缓存" : "Chromium 安装失败",
    },
    true,
  );
  return code;
}
