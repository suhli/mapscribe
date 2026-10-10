import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const inline = process.env.PROJECT_JSON ?? "";
const projectPath = process.env.PROJECT_PATH ?? "";
mkdirSync("tmp", { recursive: true });

let text = "";
if (projectPath.trim()) {
  text = readFileSync(projectPath, "utf8");
} else if (inline.trim()) {
  text = inline;
} else {
  console.error("需要 project_json 或 project_path 之一。");
  process.exit(1);
}

if (text.length > 2_000_000) {
  console.error("项目 JSON 超过 2MB。请把文件放进仓库并用 project_path 传入。");
  process.exit(1);
}

try {
  JSON.parse(text);
} catch {
  console.error("输入不是合法 JSON。");
  process.exit(1);
}

writeFileSync("tmp/project.json", text);
