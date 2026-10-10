import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { MapProject } from "@mapscribe/core";
import { resolveRenderPageDir } from "./paths.js";
import { startStaticServer } from "./server.js";

export interface RenderState {
  status: "idle" | "pending" | "ready" | "error";
  message?: string;
  warnings: string[];
  width?: number;
  height?: number;
  objects: Array<{ id: string; type: string }>;
  fontLoaded: boolean;
  labelInkPixels: number;
  attribution: string[];
}

export interface BrowserRenderResult {
  bytes: Uint8Array;
  state: RenderState;
  logs: string[];
}

const GL_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];

declare global {
  interface Window {
    __mapscribeState: RenderState;
    __mapscribe: {
      render(project: unknown): Promise<void>;
      exportDataUrl(): string;
    };
  }
}

/**
 * 用 Playwright 打开共享渲染页，等待 render-ready 后读取画布。
 */
export async function renderProjectInBrowser(
  project: MapProject,
  options: { cacheDir?: string; timeoutMs?: number } = {},
): Promise<BrowserRenderResult> {
  const logs: string[] = [];
  const directory = resolveRenderPageDir();
  const server = await startStaticServer(directory);
  let context: BrowserContext | undefined;
  let closeBrowser = async (): Promise<void> => undefined;
  try {
    const cssWidth = Math.ceil(project.output.width / project.output.pixelRatio);
    const cssHeight = Math.ceil(project.output.height / project.output.pixelRatio);
    const viewport = {
      width: Math.min(4096, Math.max(640, cssWidth)),
      height: Math.min(4096, Math.max(480, cssHeight)),
    };
    let page: Page;
    if (options.cacheDir) {
      mkdirSync(options.cacheDir, { recursive: true });
      context = await chromium.launchPersistentContext(options.cacheDir, {
        headless: true,
        viewport,
        args: GL_ARGS,
        userAgent: "MapScribe/0.1 (map rendering)",
      });
      closeBrowser = () => context?.close() ?? Promise.resolve();
      page = context.pages()[0] ?? (await context.newPage());
    } else {
      const browser = await chromium.launch({ headless: true, args: GL_ARGS });
      closeBrowser = () => browser.close();
      page = await browser.newPage({ viewport, userAgent: "MapScribe/0.1 (map rendering)" });
      context = page.context();
    }
    collectLogs(page, logs);
    await page.goto(server.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.evaluate(async (input) => {
      await window.__mapscribe.render(input);
    }, project);
    await page.waitForFunction(
      () => window.__mapscribeState.status === "ready" || window.__mapscribeState.status === "error",
      undefined,
      { timeout: options.timeoutMs ?? 60_000 },
    );
    const state = await page.evaluate(() => window.__mapscribeState);
    if (state.status === "error") {
      throw new Error(state.message ?? "渲染失败");
    }
    const dataUrl = await page.evaluate(() => window.__mapscribe.exportDataUrl());
    const encoded = dataUrl.split(",")[1];
    if (!encoded) throw new Error("渲染页没有返回图片数据");
    return { bytes: Uint8Array.from(Buffer.from(encoded, "base64")), state, logs };
  } catch (error) {
    if (context) {
      const page = context.pages()[0];
      if (page) {
        try {
          const shot = await page.screenshot();
          (error as { screenshot?: Buffer }).screenshot = shot;
        } catch {
          logs.push("调试截图失败");
        }
      }
    }
    if (error instanceof Error) {
      error.message = `${error.message}${logs.length ? `\n${logs.slice(-20).join("\n")}` : ""}`;
    }
    throw error;
  } finally {
    await closeBrowser();
    await server.close();
  }
}

function collectLogs(page: Page, logs: string[]): void {
  page.on("console", (message) => {
    logs.push(`[${message.type()}] ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    logs.push(`[pageerror] ${error.message}`);
  });
}

export function defaultCacheDir(): string {
  return path.resolve(process.cwd(), ".mapscribe", "cache");
}
