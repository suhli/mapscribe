import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const here = path.dirname(fileURLToPath(import.meta.url));

function repoRoot() {
  let current = here;
  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error("没有找到 MapScribe 仓库根目录");
    current = parent;
  }
}

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const mode = arg("mode", "auto");
const input = arg("input");
const output = arg("output", "map.png");
if (!input) {
  console.error("用法: node integrations/skill/scripts/render.mjs --mode local|github|auto --input map.json --output map.png");
  process.exit(2);
}

const root = repoRoot();
const project = JSON.parse(readFileSync(input, "utf8"));

function localRender() {
  const cli = path.join(root, "apps/cli/dist/index.js");
  const command = existsSync(cli)
    ? [process.execPath, [cli, "render", input, "--output", output, "--json"]]
    : [process.execPath, ["--import", "tsx", path.join(root, "apps/cli/src/index.ts"), "render", input, "--output", output, "--json"]];
  const result = spawnSync(command[0], command[1], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "本地渲染失败\n");
    process.exit(result.status || 1);
  }
  process.stdout.write(result.stdout);
}

function doctorOk() {
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(root, "apps/cli/src/index.ts"), "doctor", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  return result.status === 0;
}

async function githubRender() {
  const token = process.env.MAPSCRIBE_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const repository = process.env.MAPSCRIBE_GITHUB_REPOSITORY;
  const ref = process.env.MAPSCRIBE_GITHUB_REF || "main";
  if (!token || !repository) {
    throw new Error("GitHub 模式需要 MAPSCRIBE_GITHUB_TOKEN 和 MAPSCRIBE_GITHUB_REPOSITORY");
  }
  const correlationId = crypto.randomUUID();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
  const dispatch = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/render-map.yml/dispatches`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ref,
      inputs: {
        project_json: JSON.stringify(project),
        correlation_id: correlationId,
        artifact_name: "rendered-map",
      },
    }),
  });
  if (!dispatch.ok) throw new Error(`触发 workflow 失败：${dispatch.status}`);
  const run = await waitForRun(repository, token, correlationId);
  if (run.conclusion !== "success") throw new Error(`渲染运行 ${run.id} 的结果是 ${run.conclusion}`);
  const artifactResponse = await fetch(`https://api.github.com/repos/${repository}/actions/runs/${run.id}/artifacts`, { headers });
  if (!artifactResponse.ok) throw new Error("无法列出 artifact");
  const artifactJson = await artifactResponse.json();
  const artifact = artifactJson.artifacts?.find((item) => item.name === "rendered-map");
  if (!artifact) throw new Error("没有找到 rendered-map artifact");
  const zipResponse = await fetch(`https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}/zip`, { headers });
  if (!zipResponse.ok) throw new Error("下载 artifact 失败");
  const files = unzipSync(new Uint8Array(await zipResponse.arrayBuffer()));
  const imageName = Object.keys(files).find((name) => name.endsWith(".png") || name.endsWith(".webp") || name.endsWith(".jpg"));
  if (!imageName) throw new Error("artifact 中没有图片");
  mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  writeFileSync(output, files[imageName]);
  const metaName = Object.keys(files).find((name) => name.endsWith("map.meta.json"));
  process.stdout.write(
    `${JSON.stringify({ ok: true, mode: "github", output: path.resolve(output), runId: run.id, correlationId, meta: metaName ? JSON.parse(new TextDecoder().decode(files[metaName])) : null })}\n`,
  );
}

async function waitForRun(repository, token, correlationId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const expected = `render ${correlationId}`;
  const started = Date.now();
  while (Date.now() - started < 15 * 60 * 1000) {
    const url = `https://api.github.com/repos/${repository}/actions/workflows/render-map.yml/runs?event=workflow_dispatch&per_page=20`;
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`查询 workflow 失败：${response.status}`);
    const payload = await response.json();
    const match = payload.workflow_runs?.find((run) => run.name === expected || run.display_title === expected);
    if (match && match.status === "completed") return match;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`没有等到名称为 ${expected} 的运行`);
}

if (mode === "local") localRender();
else if (mode === "github") await githubRender();
else if (mode === "auto") {
  if (doctorOk()) localRender();
  else await githubRender();
} else {
  console.error("mode 必须是 local、github 或 auto");
  process.exit(2);
}
