import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { parseProject } from "@mapscribe/core";
import { renderProjectInBrowser } from "../apps/cli/src/render/run.js";

const root = path.resolve(import.meta.dirname, "..");

describe("headless map render", () => {
  it("renders the fixture with the expected size, road color, and Chinese glyphs", async () => {
    const project = parseProject(JSON.parse(readFileSync(path.join(root, "tests/fixtures/render-project.json"), "utf8"))).project;
    const rendered = await renderProjectInBrowser(project);
    const png = PNG.sync.read(Buffer.from(rendered.bytes));
    expect(png.width).toBe(800);
    expect(png.height).toBe(450);
    let red = 0;
    let ink = 0;
    for (let index = 0; index < png.data.length; index += 16) {
      const redChannel = png.data[index] ?? 0;
      const green = png.data[index + 1] ?? 0;
      const blue = png.data[index + 2] ?? 0;
      if (redChannel > 180 && green < 130 && blue < 130) red += 1;
      const distance = Math.abs(redChannel - 231) + Math.abs(green - 238) + Math.abs(blue - 243);
      if (distance > 40) ink += 1;
    }
    expect(red).toBeGreaterThan(8);
    expect(ink).toBeGreaterThan(30);
    expect(rendered.state.fontLoaded).toBe(true);
    expect(rendered.state.labelInkPixels).toBeGreaterThan(4);
    expect(rendered.state.objects.map((item) => item.id)).toEqual(expect.arrayContaining(["road-1", "label-1"]));
  });

  it("returns a failure exit code for an invalid project", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "apps/cli/src/index.ts", "validate", "tests/fixtures/invalid.json", "--json"],
      { cwd: root, encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/经度|ok":false/);
  });
});
