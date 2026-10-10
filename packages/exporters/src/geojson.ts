import { isLineLayer, type MapProject } from "@mapscribe/core";

export interface GeoFeature {
  type: "Feature";
  id: string;
  properties: Record<string, string | number | boolean | null>;
  geometry:
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "MultiLineString"; coordinates: [number, number][][] }
    | { type: "Point"; coordinates: [number, number] };
}

export interface FeatureCollection {
  type: "FeatureCollection";
  features: GeoFeature[];
}

/** 导出道路、手绘和标签的 GeoJSON。标签使用 Point。 */
export function projectToFeatureCollection(project: MapProject): FeatureCollection {
  const features: GeoFeature[] = [];
  for (const layer of project.layers) {
    if (!layer.visible) continue;
    if (isLineLayer(layer)) {
      features.push({
        type: "Feature",
        id: layer.id,
        properties: {
          name: layer.name,
          layerType: layer.type,
          color: layer.style.color,
          width: layer.style.width,
        },
        geometry: layer.geometry,
      });
    } else {
      features.push({
        type: "Feature",
        id: layer.id,
        properties: {
          name: layer.name,
          layerType: layer.type,
          text: layer.text,
        },
        geometry: { type: "Point", coordinates: layer.position },
      });
    }
  }
  return { type: "FeatureCollection", features };
}
