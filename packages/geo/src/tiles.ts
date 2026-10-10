import type { TileStyleOption } from "./types.js";

const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
const OPENFREEMAP_ATTRIBUTION = "© OpenFreeMap © OpenMapTiles";

const openFreeMap = (id: TileStyleOption["id"], styleName: string, title: TileStyleOption["title"]): TileStyleOption => ({
  id,
  title,
  style: `https://tiles.openfreemap.org/styles/${styleName}`,
  attribution: [OSM_ATTRIBUTION, OPENFREEMAP_ATTRIBUTION],
  requiresKey: false,
});

/** 不需要 API Key 的内置底图。blank 不请求任何瓦片，供离线编辑和测试使用。 */
export const TILE_STYLES: TileStyleOption[] = [
  openFreeMap("light", "positron", { zh: "浅色", en: "Light" }),
  openFreeMap("positron", "positron", { zh: "Positron", en: "Positron" }),
  openFreeMap("bright", "bright", { zh: "明亮", en: "Bright" }),
  openFreeMap("liberty", "liberty", { zh: "街道", en: "Liberty" }),
  openFreeMap("dark", "dark", { zh: "深色", en: "Dark" }),
  openFreeMap("fiord", "fiord", { zh: "峡湾", en: "Fiord" }),
  {
    id: "blank",
    title: { zh: "空白", en: "Blank" },
    style: {
      version: 8,
      name: "MapScribe Blank",
      sources: {},
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "#e7eef3" },
        },
      ],
    },
    attribution: ["MapScribe"],
    requiresKey: false,
  },
];

export function findTileStyle(id: string): TileStyleOption | undefined {
  return TILE_STYLES.find((style) => style.id === id);
}
