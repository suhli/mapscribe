import type { ZodError } from "zod";

/** 项目 JSON 无法通过校验或迁移时抛出。 */
export class ProjectError extends Error {
  readonly issues: string[];

  constructor(message: string, issues?: string[]) {
    super(message);
    this.name = "ProjectError";
    this.issues = issues ?? message.split("\n").filter(Boolean);
  }
}

/** 把 Zod 问题格式化成「字段路径: 原因」。 */
export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("\n");
}
