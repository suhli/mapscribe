import { Command, CommanderError } from "commander";
import { MAPSCRIBE_VERSION } from "@mapscribe/core";
import { doctor } from "./commands/doctor.js";
import { installBrowsers } from "./commands/install-browsers.js";
import { renderCommand } from "./commands/render.js";
import { validateFile } from "./commands/validate.js";
import { Logger, parseLogLevel } from "./logger.js";

export async function main(argv: string[]): Promise<number> {
  let code = 0;
  const program = new Command();
  program.name("mapscribe").description("MapScribe 地图渲染命令行").version(MAPSCRIBE_VERSION);
  program.exitOverride();

  program
    .command("render")
    .argument("<file>", "地图项目 JSON")
    .option("-o, --output <file>", "输出图片路径")
    .option("--artifact-dir <dir>", "写入图片、项目、元数据和报告")
    .option("--error-dir <dir>", "失败时写入错误报告")
    .option("--cache-dir <dir>", "Chromium 地图缓存目录")
    .option("--no-cache", "不使用磁盘缓存")
    .option("--json", "输出机器可读 JSON")
    .option("--log-level <level>", "silent、error、info 或 debug", "info")
    .action(async (file: string, opts: Record<string, string | boolean | undefined>) => {
      const json = Boolean(opts.json);
      code = await renderCommand({
        file,
        output: typeof opts.output === "string" ? opts.output : undefined,
        artifactDir: typeof opts.artifactDir === "string" ? opts.artifactDir : undefined,
        errorDir: typeof opts.errorDir === "string" ? opts.errorDir : undefined,
        cacheDir: typeof opts.cacheDir === "string" ? opts.cacheDir : undefined,
        noCache: opts.cache === false,
        json,
        logger: new Logger(parseLogLevel(typeof opts.logLevel === "string" ? opts.logLevel : "info"), json),
      });
    });

  program
    .command("validate")
    .argument("<file>", "地图项目 JSON")
    .option("--json", "输出机器可读 JSON")
    .option("--log-level <level>", "日志级别", "info")
    .action((file: string, opts: { json?: boolean; logLevel?: string }) => {
      const json = Boolean(opts.json);
      code = validateFile(file, json, new Logger(parseLogLevel(opts.logLevel), json));
    });

  program
    .command("doctor")
    .option("--json", "输出机器可读 JSON")
    .action(async (opts: { json?: boolean }) => {
      code = await doctor(Boolean(opts.json));
    });

  program.command("install").description("安装 Playwright Chromium 到项目缓存").action(async () => {
    code = await installBrowsers(false);
  });

  program.command("version").action(() => {
    process.stdout.write(`${MAPSCRIBE_VERSION}\n`);
    code = 0;
  });

  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.code === "commander.helpDisplayed" || error.code === "commander.version" ? 0 : (error.exitCode ?? 2);
    }
    const message = error instanceof Error ? error.message : "命令执行失败";
    process.stderr.write(`${message}\n`);
    return error instanceof Error && message.includes("日志级别") ? 2 : 1;
  }
  return code;
}
