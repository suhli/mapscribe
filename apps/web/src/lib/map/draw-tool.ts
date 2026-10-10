import type { Map as MapLibreMap } from "maplibre-gl";
import { TerraDraw, TerraDrawLineStringMode } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";

type Coordinate = [number, number];

/** 用 Terra Draw 创建折线。编辑已有节点由编辑器自己的顶点控制完成。 */
export class DrawTool {
  private draw: TerraDraw | null = null;
  private modeName = "linestring";

  constructor(
    private readonly map: MapLibreMap,
    private readonly onFinish: (coordinates: Coordinate[]) => void,
  ) {}

  start(): void {
    if (this.draw?.enabled) return;
    const lineMode = new TerraDrawLineStringMode({
      editable: true,
      showCoordinatePoints: true,
      keyEvents: { cancel: "Escape", finish: "Enter" },
      styles: {
        lineStringColor: "#2563eb",
        lineStringWidth: 4,
        lineStringOpacity: 1,
        closingPointColor: "#2563eb",
        closingPointWidth: 7,
        closingPointOpacity: 1,
        closingPointOutlineColor: "#ffffff",
        closingPointOutlineWidth: 2,
        coordinatePointColor: "#2563eb",
        coordinatePointWidth: 5,
        coordinatePointOpacity: 1,
        coordinatePointOutlineColor: "#ffffff",
        coordinatePointOutlineWidth: 2,
      },
    });
    this.modeName = lineMode.mode;
    this.draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map: this.map }),
      modes: [lineMode],
    });
    this.draw.on("finish", (id) => {
      const feature = this.draw?.getSnapshotFeature(id);
      const geometry = feature?.geometry;
      if (geometry?.type === "LineString") {
        const coordinates = geometry.coordinates.flatMap((pair) => {
          if (!Array.isArray(pair) || pair.length < 2) return [];
          const longitude = Number(pair[0]);
          const latitude = Number(pair[1]);
          if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
          return [[longitude, latitude] as Coordinate];
        });
        if (coordinates.length >= 2) this.onFinish(coordinates);
      }
      if (this.draw?.hasFeature(id)) this.draw.removeFeatures([id]);
      if (this.draw?.enabled) this.draw.setMode("static");
    });
    this.draw.start();
    this.draw.setMode("static");
  }

  setActive(active: boolean): void {
    if (!this.draw?.enabled) this.start();
    this.draw?.setMode(active ? this.modeName : "static");
    if (active) this.map.doubleClickZoom.disable();
    else this.map.doubleClickZoom.enable();
  }

  cancel(): void {
    this.draw?.clear();
    if (this.draw?.enabled) this.draw.setMode("static");
  }

  stop(): void {
    this.draw?.stop();
    this.draw = null;
  }
}
