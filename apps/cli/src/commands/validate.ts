import { readFileSync } from "node:fs";
import { parseProject, ProjectError } from "@mapscribe/core";
import type { Logger } from "../logger.js";
import { printResult } from "../output.js";

export function validateFile(file: string, json: boolean, logger: Logger): number {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法读取文件";
    printResult({ ok: false, command: "validate", message }, json);
    return 1;
  }
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    printResult({ ok: false, command: "validate", message: "项目文件不是合法 JSON" }, json);
    return 1;
  }
  try {
    const parsed = parseProject(data);
    logger.info(`校验通过，共 ${parsed.project.layers.length} 个图层`);
    printResult(
      {
        ok: true,
        command: "validate",
        message: `校验通过，共 ${parsed.project.layers.length} 个图层`,
        warnings: parsed.warnings,
        layers: parsed.project.layers.length,
      },
      json,
    );
    return 0;
  } catch (error) {
    const message = error instanceof ProjectError ? error.message : error instanceof Error ? error.message : "校验失败";
    printResult({ ok: false, command: "validate", message }, json);
    return 1;
  }
}
