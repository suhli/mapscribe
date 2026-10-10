import { createId } from "./ids.js";
import { formatZodError, ProjectError } from "./errors.js";
import {
  defaultLabelStyle,
  defaultLeader,
  defaultLineStyle,
  defaultOffset,
  defaultOutput,
  mapProjectSchema,
  type BuiltinStyleName,
  type FreehandLayer,
  type LabelLayer,
  type Layer,
  type LineGeometry,
  type LineLayer,
  type LngLat,
  type MapProject,
  type RoadLayer,
  type SourceInfo,
} from "./schema.js";
import { SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from "./version.js";

export interface ParseResult {
  project: MapProject;
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 解析并迁移项目 JSON。
 * 已保存的几何会原样保留，调用方不应在重新打开时丢弃它去重新请求接口。
 */
export function parseProject(input: unknown): ParseResult {
  const warnings: string[] = [];
  if (!isRecord(input)) {
    throw new ProjectError("项目文件必须是 JSON 对象");
  }

  const record: Record<string, unknown> = { ...input };
  if (record.schemaVersion === undefined) {
    record.schemaVersion = SCHEMA_VERSION;
    warnings.push("缺少 schemaVersion，已按 1.0 解析");
  } else if (
    typeof record.schemaVersion !== "string" ||
    !SUPPORTED_SCHEMA_VERSIONS.includes(record.schemaVersion as (typeof SUPPORTED_SCHEMA_VERSIONS)[number])
  ) {
    throw new ProjectError(
      `不支持的 schemaVersion：${String(record.schemaVersion)}。当前支持：${SUPPORTED_SCHEMA_VERSIONS.join("、")}`,
    );
  }

  if (!isRecord(record.meta)) {
    const now = new Date().toISOString();
    record.meta = {
      id: createId("map"),
      name: "未命名地图",
      createdAt: now,
      updatedAt: now,
    };
    warnings.push("缺少 meta，已补充默认项目信息");
  }

  const parsed = mapProjectSchema.safeParse(record);
  if (!parsed.success) {
    const message = formatZodError(parsed.error);
    throw new ProjectError(message);
  }

  return { project: touchProject(parsed.data, parsed.data.meta.updatedAt), warnings };
}

export function touchProject(project: MapProject, updatedAt = new Date().toISOString()): MapProject {
  return {
    ...project,
    meta: { ...project.meta, updatedAt },
  };
}

/** 成都天府广场附近的真实视点，不包含虚构道路。 */
export const DEFAULT_CENTER: LngLat = [104.0658, 30.6574];

export function createEmptyProject(name = "未命名地图"): MapProject {
  const now = new Date().toISOString();
  return parseProject({
    schemaVersion: SCHEMA_VERSION,
    meta: {
      id: createId("map"),
      name,
      createdAt: now,
      updatedAt: now,
    },
    map: {
      center: DEFAULT_CENTER,
      zoom: 13,
      style: "light",
    },
    layers: [],
    output: defaultOutput,
  }).project;
}

export function isLineLayer(layer: Layer): layer is LineLayer {
  return layer.type === "road-highlight" || layer.type === "freehand";
}

export function createRoadLayer(input: {
  name: string;
  geometry: LineGeometry;
  source?: SourceInfo;
  color?: string;
  referenceZoom?: number;
}): RoadLayer {
  return {
    id: createId("road"),
    type: "road-highlight",
    name: input.name,
    visible: true,
    zIndex: 0,
    style: {
      ...defaultLineStyle,
      ...(input.color ? { color: input.color } : {}),
      ...(input.referenceZoom !== undefined ? { referenceZoom: input.referenceZoom } : {}),
    },
    geometry: input.geometry,
    ...(input.source ? { source: input.source } : {}),
  };
}

export function createFreehandLayer(input: {
  name?: string;
  geometry: LineGeometry;
  referenceZoom?: number;
}): FreehandLayer {
  return {
    id: createId("draw"),
    type: "freehand",
    name: input.name ?? "手绘路段",
    visible: true,
    zIndex: 0,
    style: {
      ...defaultLineStyle,
      color: "#2563eb",
      outlineWidth: 0,
      ...(input.referenceZoom !== undefined ? { referenceZoom: input.referenceZoom } : {}),
    },
    geometry: input.geometry,
    source: { kind: "freehand" },
  };
}

export function createLabelLayer(input: {
  text: string;
  position: LngLat;
  name?: string;
}): LabelLayer {
  return {
    id: createId("label"),
    type: "label",
    name: input.name ?? input.text.slice(0, 40),
    text: input.text,
    position: input.position,
    visible: true,
    zIndex: 0,
    icon: "pin",
    style: { ...defaultLabelStyle },
    leader: { ...defaultLeader },
    offset: { ...defaultOffset },
    placement: "auto",
  };
}

export function styleName(style: MapProject["map"]["style"]): BuiltinStyleName | "url" | "inline" {
  if (typeof style === "string") return style;
  if (style.type === "builtin") return style.name;
  return style.type;
}

/** 导出时默认去掉访问密钥，避免把密钥写进分享文件。 */
export function stripSecrets(project: MapProject): MapProject {
  if (!project.providers) return project;
  const providers: NonNullable<MapProject["providers"]> = {};
  for (const key of ["geocoding", "roads", "routing", "tiles"] as const) {
    const entry = project.providers[key];
    if (!entry) continue;
    const { apiKey: _apiKey, ...rest } = entry;
    if (Object.keys(rest).length > 0) providers[key] = rest;
  }
  return {
    ...project,
    ...(Object.keys(providers).length > 0 ? { providers } : {}),
  };
}

export function projectToJson(project: MapProject, options?: { includeSecrets?: boolean }): string {
  const value = options?.includeSecrets ? project : stripSecrets(project);
  return JSON.stringify(value, null, 2);
}
