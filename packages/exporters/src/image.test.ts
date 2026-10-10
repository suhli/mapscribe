import { describe, expect, it } from "vitest";
import { readImageInfo } from "./image.js";
import { projectToFeatureCollection } from "./geojson.js";
import { createLabelLayer, createRoadLayer, parseProject } from "@mapscribe/core";

describe("readImageInfo", () => {
  it("读取 PNG 尺寸", () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 3, 32, 0, 0, 1, 194,
    ]);
    expect(readImageInfo(png)).toEqual({ format: "png", width: 800, height: 450 });
  });
});

describe("projectToFeatureCollection", () => {
  it("同时导出线和点", () => {
    const project = parseProject({
      schemaVersion: "1.0",
      map: { center: [104, 30], zoom: 12, style: "blank" },
      layers: [
        createRoadLayer({
          name: "路",
          geometry: {
            type: "LineString",
            coordinates: [
              [104, 30],
              [104.1, 30.1],
            ],
          },
        }),
        createLabelLayer({ text: "点", position: [104.05, 30.05] }),
      ],
    }).project;
    const collection = projectToFeatureCollection(project);
    expect(collection.features).toHaveLength(2);
    expect(collection.features[1]?.geometry.type).toBe("Point");
  });
});
