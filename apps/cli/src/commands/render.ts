import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MAPSCRIBE_VERSION, parseProject, ProjectError, projectToJson, stripSecrets, type MapProject } from "@mapscribe/core";
import { assertImageSize } from "@mapscribe/exporters";
import { boundsOfProject, createDefaultResolver, projectNeedsResolution, resolveProject, type LayerResolutionReport } from "@mapscribe/geo";
import { resolveStyle } from "@mapscribe/renderer";
import type { Logger } from "../logger.js";
import { printResult } from "../output.js";
import { defaultCacheDir, renderProjectInBrowser } from "../render/run.js";

export interface RenderOptions {
  file: string;
  output?: string;
  artifactDir?: string;
  errorDir?: string;
  json: boolean;
  cacheDir?: string;
  noCache: boolean;
  logger: Logger;
}

export async function renderCommand(options: RenderOptions): Promise<number> {
  const started = Date.now();
  let project: MapProject | undefined;
  try {
    const text = readFileSync(options.file, "utf8");
    let data: unknown;
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      throw new ProjectError("项目文件不是合法 JSON");
    }
    const parsed = parseProject(data);
    const original = parsed.project;
    project = original;
    for (const warning of parsed.warnings) options.logger.info(warning);
    let reports: LayerResolutionReport[] = [];
    if (projectNeedsResolution(original)) {
      options.logger.info("项目包含未解析的 sourceQuery，开始地理解析");
      const resolved = await resolveProject(original, createDefaultResolver(original));
      reports = resolved.reports;
      if (!resolved.ok) {
        const error = new Error(reports.map((item) => `${item.id}: ${item.status} ${item.message}`).join("\n"));
        (error as { reports?: LayerResolutionReport[] }).reports = reports;
        throw error;
      }
      project = resolved.project;
    }
    options.logger.info(`开始渲染 ${project.output.width}×${project.output.height} ${project.output.format}`);
    const rendered = await renderProjectInBrowser(project, {
      ...(options.noCache ? {} : { cacheDir: options.cacheDir ?? defaultCacheDir() }),
    });
    assertImageSize(rendered.bytes, project.output.width, project.output.height);
    const outputPath = resolveOutputPath(options, project);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, rendered.bytes);
    const warnings = [...parsed.warnings, ...rendered.state.warnings];
    const elapsedMs = Date.now() - started;
    if (options.artifactDir) {
      writeArtifact(options.artifactDir, original, project, reports, outputPath, rendered.state, warnings, elapsedMs, true);
    }
    printResult(
      {
        ok: true,
        command: "render",
        message: `已写入 ${outputPath}`,
        output: outputPath,
        width: project.output.width,
        height: project.output.height,
        warnings,
        elapsedMs,
        objects: rendered.state.objects.length,
      },
      options.json,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "渲染失败";
    options.logger.error(message);
    if (options.errorDir) {
      mkdirSync(options.errorDir, { recursive: true });
      const screenshot = (error as { screenshot?: Buffer }).screenshot;
      if (screenshot) writeFileSync(path.join(options.errorDir, "debug.png"), screenshot);
      writeFileSync(
        path.join(options.errorDir, "error-report.json"),
        JSON.stringify({ ok: false, message, elapsedMs: Date.now() - started }, null, 2),
      );
      writeFileSync(path.join(options.errorDir, "console.log"), message);
      if (project) writeFileSync(path.join(options.errorDir, "map.json"), projectToJson(stripSecrets(project)));
      const reports = (error as { reports?: LayerResolutionReport[] }).reports;
      if (reports) {
        writeFileSync(path.join(options.errorDir, "resolve-report.json"), JSON.stringify({ ok: false, layers: reports }, null, 2));
      }
    }
    printResult({ ok: false, command: "render", message }, options.json);
    return 1;
  }
}

function resolveOutputPath(options: RenderOptions, project: MapProject): string {
  if (options.artifactDir) {
    return path.join(options.artifactDir, `map.${extension(project.output.format)}`);
  }
  if (options.output) return options.output;
  return path.resolve(`map.${extension(project.output.format)}`);
}

function extension(format: MapProject["output"]["format"]): string {
  if (format === "jpeg") return "jpg";
  return format;
}

function writeArtifact(
  directory: string,
  original: MapProject,
  project: MapProject,
  reports: LayerResolutionReport[],
  outputPath: string,
  state: { attribution: string[]; objects: Array<{ id: string; type: string }>; warnings: string[]; labelInkPixels: number; fontLoaded: boolean },
  warnings: string[],
  elapsedMs: number,
  ok: boolean,
): void {
  mkdirSync(directory, { recursive: true });
  const safeProject = stripSecrets(project);
  writeFileSync(path.join(directory, "map.source.json"), projectToJson(stripSecrets(original), { includeSecrets: false }));
  writeFileSync(path.join(directory, "map.json"), projectToJson(safeProject, { includeSecrets: false }));
  writeFileSync(path.join(directory, "resolve-report.json"), JSON.stringify({ ok: true, layers: reports }, null, 2));
  const style = resolveStyle(project.map.style, project.map.attribution ?? []);
  const meta = {
    renderedAt: new Date().toISOString(),
    rendererVersion: MAPSCRIBE_VERSION,
    bounds: boundsOfProject(project),
    width: project.output.width,
    height: project.output.height,
    pixelRatio: project.output.pixelRatio,
    format: project.output.format,
    sources: style.attribution,
    objectCount: state.objects.length,
    objects: state.objects,
    fontLoaded: state.fontLoaded,
    labelInkPixels: state.labelInkPixels,
    warnings,
  };
  writeFileSync(path.join(directory, "map.meta.json"), JSON.stringify(meta, null, 2));
  writeFileSync(
    path.join(directory, "render-report.json"),
    JSON.stringify({ ok, output: outputPath, elapsedMs, warnings }, null, 2),
  );
  const summary = [
    "## MapScribe 渲染结果",
    "",
    `- 状态：${ok ? "成功" : "失败"}`,
    `- 尺寸：${project.output.width}×${project.output.height}`,
    `- 对象：${state.objects.length}`,
    `- 耗时：${elapsedMs} ms`,
    `- 数据源：${style.attribution.join(" / ") || "无"}`,
    warnings.length ? `- 警告：${warnings.map((item) => item.replace(/[<>]/g, "")).join("；")}` : "- 警告：无",
    "",
    "可在本工作流的 Artifacts 中下载 `rendered-map`。",
  ];
  writeFileSync(path.join(directory, "summary.md"), summary.join("\n"));
}
