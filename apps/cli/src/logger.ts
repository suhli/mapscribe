export type LogLevel = "silent" | "error" | "info" | "debug";

const rank: Record<LogLevel, number> = { silent: 0, error: 1, info: 2, debug: 3 };

export class Logger {
  constructor(
    private readonly level: LogLevel,
    private readonly json: boolean,
  ) {}

  debug(message: string): void {
    this.write("debug", message);
  }

  info(message: string): void {
    this.write("info", message);
  }

  error(message: string): void {
    this.write("error", message);
  }

  private write(level: LogLevel, message: string): void {
    if (rank[level] > rank[this.level]) return;
    const line = this.json ? JSON.stringify({ level, message }) : message;
    if (level === "error") console.error(line);
    else console.error(line);
  }
}

export function parseLogLevel(value: string | undefined): LogLevel {
  if (value === "silent" || value === "error" || value === "info" || value === "debug") return value;
  throw new Error("日志级别必须是 silent、error、info 或 debug");
}
