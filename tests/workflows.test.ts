import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");

describe("github workflows", () => {
  it("render workflow accepts dispatch and call, uploads artifacts, and does not deploy pages", () => {
    const text = read("render-map.yml");
    expect(text).toContain("workflow_dispatch:");
    expect(text).toContain("workflow_call:");
    expect(text).toContain("correlation_id");
    expect(text).toContain("actions/upload-artifact@v4");
    expect(text).toContain("pnpm install");
    expect(text).not.toContain("deploy-pages");
    expect(text).toContain("cancel-in-progress: false");
    const render = readFileSync(new URL("../apps/cli/src/commands/render.ts", import.meta.url), "utf8");
    expect(render).toContain("resolve-report.json");
    expect(render).toContain("map.source.json");
    expect(render).toContain("resolveProject");
  });

  it("ci covers lint, types, tests, and builds", () => {
    const text = read("ci.yml");
    expect(text).toContain("pnpm lint");
    expect(text).toContain("pnpm typecheck");
    expect(text).toContain("pnpm test");
    expect(text).toContain("pnpm build");
    expect(text).toContain("pnpm test:e2e");
  });
});
