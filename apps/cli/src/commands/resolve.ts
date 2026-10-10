import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseProject, ProjectError, projectToJson, stripSecrets } from "@mapscribe/core";
import { createDefaultResolver, resolveProject } from "@mapscribe/geo";
import type { Logger } from "../logger.js";
import { printResult } from "../output.js";

export async function resolveCommand(options: {
  file: string;
  output?: string;
  force: boolean;
  selections: Record<string, string>;
  json: boolean;
  logger: Logger;
}): Promise<number> {
  try {
    const data = JSON.parse(readFileSync(options.file, "utf8")) as unknown;
    const parsed = parseProject(data);
    for (const warning of parsed.warnings) options.logger.info(warning);
    const resolved = await resolveProject(parsed.project, createDefaultResolver(parsed.project), {
      force: options.force,
      selections: options.selections,
    });
    const output = options.output ?? path.resolve("resolved.json");
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, projectToJson(stripSecrets(resolved.project)));
    const reportPath = output.replace(/\.json$/i, "") + ".resolve-report.json";
    writeFileSync(reportPath, JSON.stringify({ ok: resolved.ok, layers: resolved.reports }, null, 2));
    if (!resolved.ok) {
      const message = resolved.reports
        .filter((item) => item.status !== "resolved" && item.status !== "skipped")
        .map((item) => `${item.id}: ${item.status} ${item.message}`)
        .join("\n");
      printResult({ ok: false, command: "resolve", message, output, report: reportPath, layers: resolved.reports }, options.json);
      return 1;
    }
    printResult({ ok: true, command: "resolve", message: `已写入 ${output}`, output, report: reportPath, layers: resolved.reports }, options.json);
    return 0;
  } catch (error) {
    const message = error instanceof ProjectError || error instanceof Error ? error.message : "解析失败";
    options.logger.error(message);
    printResult({ ok: false, command: "resolve", message }, options.json);
    return 1;
  }
}

export function parseSelections(pairs: string[]): Record<string, string> {
  const selections: Record<string, string> = {};
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index <= 0 || index === pair.length - 1) {
      throw new ProjectError(`候选参数格式应为 图层id=候选id：${pair}`);
    }
    selections[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return selections;
}
