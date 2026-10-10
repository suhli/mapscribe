import { describe, expect, it } from "vitest";
import { ProjectError } from "./errors.js";
import { createEmptyProject, parseProject, stripSecrets } from "./project.js";

const specSample = {
  schemaVersion: "1.0",
  map: {
    center: [104.0809, 30.657],
    zoom: 13,
    style: "light",
  },
  layers: [
    {
      id: "road-1",
      type: "road-highlight",
      name: "Highlighted Road",
      visible: true,
      style: {
        color: "#ef4444",
        width: 8,
        opacity: 1,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [104.08, 30.65],
          [104.09, 30.66],
        ],
      },
    },
    {
      id: "label-1",
      type: "label",
      text: "示例地点",
      position: [104.085, 30.655],
      style: {
        fontSize: 18,
        color: "#111827",
      },
    },
  ],
  output: {
    format: "png",
    width: 2560,
    height: 1440,
    pixelRatio: 1,
  },
};

describe("parseProject", () => {
  it("解析规范中的示例结构并补齐默认值", () => {
    const { project, warnings } = parseProject(specSample);
    expect(warnings.some((item) => item.includes("meta"))).toBe(true);
    expect(project.schemaVersion).toBe("1.0");
    expect(project.layers).toHaveLength(2);
    const road = project.layers[0];
    const label = project.layers[1];
    if (!road || road.type !== "road-highlight" || !label || label.type !== "label") {
      throw new Error("图层类型不符合预期");
    }
    expect(road.style.dash).toBe("solid");
    expect(road.style.width).toBe(8);
    expect(road.geometry.coordinates).toEqual([
      [104.08, 30.65],
      [104.09, 30.66],
    ]);
    expect(label.text).toBe("示例地点");
    expect(label.style.fontSize).toBe(18);
    expect(label.style.background).toBe("#ffffff");
    expect(project.output.height).toBe(1440);
    expect(project.output.fit).toBe("view");
  });

  it("拒绝纬度超出范围的坐标", () => {
    const project = createEmptyProject();
    expect(() =>
      parseProject({
        ...project,
        map: { ...project.map, center: [104, 120] },
      }),
    ).toThrow(ProjectError);
    try {
      parseProject({
        ...project,
        map: { ...project.map, center: [104, 120] },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectError);
      expect((error as ProjectError).message).toMatch(/纬度/);
    }
  });

  it("拒绝未知架构版本", () => {
    expect(() => parseProject({ schemaVersion: "9.0", layers: [] })).toThrow(/不支持的 schemaVersion/);
  });

  it("拒绝重复图层 id", () => {
    const project = createEmptyProject();
    expect(() =>
      parseProject({
        ...project,
        layers: [
          {
            id: "road-1",
            type: "freehand",
            geometry: {
              type: "LineString",
              coordinates: [
                [104, 30],
                [104.1, 30.1],
              ],
            },
          },
          {
            id: "road-1",
            type: "label",
            text: "甲",
            position: [104, 30],
          },
        ],
      }),
    ).toThrow(/重复的图层 id/);
  });

  it("拒绝把纬经度顺序写成超出纬度范围的值", () => {
    expect(() =>
      parseProject({
        schemaVersion: "1.0",
        map: { center: [30.65, 104.08], zoom: 12, style: "light" },
        layers: [],
      }),
    ).toThrow(/纬度/);
  });

  it("导出时移除访问密钥", () => {
    const project = createEmptyProject();
    project.providers = {
      tiles: { endpoint: "https://example.com/style.json", apiKey: "secret-key" },
    };
    const stripped = stripSecrets(project);
    expect(stripped.providers?.tiles?.apiKey).toBeUndefined();
    expect(stripped.providers?.tiles?.endpoint).toBe("https://example.com/style.json");
    expect(project.providers.tiles?.apiKey).toBe("secret-key");
  });
});
