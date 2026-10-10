import { z } from "zod";

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "颜色必须是 #RRGGBB");

export const builtinStyleNames = [
  "light",
  "positron",
  "bright",
  "liberty",
  "dark",
  "fiord",
  "blank",
] as const;

const lng = z.number().gte(-180, "经度必须在 -180 到 180 之间").lte(180, "经度必须在 -180 到 180 之间");
const lat = z.number().gte(-90, "纬度必须在 -90 到 90 之间").lte(90, "纬度必须在 -90 到 90 之间");

export const lngLatSchema = z.tuple([lng, lat]);

const lineStringSchema = z
  .object({
    type: z.literal("LineString"),
    coordinates: z
      .array(lngLatSchema)
      .min(2, "折线至少需要 2 个点")
      .max(10_000, "单条折线最多 10000 个点"),
  })
  .strict();

const multiLineStringSchema = z
  .object({
    type: z.literal("MultiLineString"),
    coordinates: z
      .array(z.array(lngLatSchema).min(2).max(10_000))
      .min(1, "至少需要一条折线")
      .max(100, "最多 100 条折线"),
  })
  .strict();

export const lineGeometrySchema = z.discriminatedUnion("type", [
  lineStringSchema,
  multiLineStringSchema,
]);

const lineStyleShape = z
  .object({
    color: hexColor,
    width: z.number().gt(0, "线宽必须大于 0").lte(64, "线宽不能超过 64"),
    opacity: z.number().gte(0, "透明度必须在 0 到 1 之间").lte(1, "透明度必须在 0 到 1 之间"),
    dash: z.enum(["solid", "dashed"]),
    lineCap: z.enum(["butt", "round", "square"]),
    lineJoin: z.enum(["miter", "round", "bevel"]),
    outlineColor: hexColor,
    outlineWidth: z.number().gte(0).lte(32, "描边宽度不能超过 32"),
    widthMode: z.enum(["screen", "zoom"]),
    referenceZoom: z.number().gte(0).lte(22).optional(),
  })
  .strict();

export const defaultLineStyle = {
  color: "#ef4444",
  width: 6,
  opacity: 1,
  dash: "solid",
  lineCap: "round",
  lineJoin: "round",
  outlineColor: "#ffffff",
  outlineWidth: 2,
  widthMode: "zoom",
} as const;

export const lineStyleSchema = z.preprocess((value) => {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return { ...defaultLineStyle, ...record };
}, lineStyleShape);

const labelStyleShape = z
  .object({
    fontSize: z.number().gte(8, "字号不能小于 8").lte(96, "字号不能超过 96"),
    color: hexColor,
    background: hexColor,
    borderColor: hexColor,
    borderWidth: z.number().gte(0).lte(12),
    borderRadius: z.number().gte(0).lte(48),
    opacity: z.number().gte(0).lte(1),
    align: z.enum(["left", "center", "right"]),
    anchor: z.enum(["center", "top", "bottom", "left", "right"]),
  })
  .strict();

export const defaultLabelStyle = {
  fontSize: 16,
  color: "#0f172a",
  background: "#ffffff",
  borderColor: "#cbd5e1",
  borderWidth: 1,
  borderRadius: 8,
  opacity: 1,
  align: "center",
  anchor: "bottom",
} as const;

export const labelStyleSchema = z.preprocess((value) => {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return { ...defaultLabelStyle, ...record };
}, labelStyleShape);

const leaderShape = z
  .object({
    enabled: z.boolean(),
    color: hexColor,
    width: z.number().gte(0.5).lte(8),
  })
  .strict();

export const defaultLeader = {
  enabled: false,
  color: "#334155",
  width: 1.5,
} as const;

export const leaderSchema = z.preprocess((value) => {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return { ...defaultLeader, ...record };
}, leaderShape);

const offsetShape = z
  .object({
    x: z.number().gte(-2000).lte(2000),
    y: z.number().gte(-2000).lte(2000),
  })
  .strict();

export const defaultOffset = { x: 0, y: 0 } as const;

export const offsetSchema = z.preprocess((value) => {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return { ...defaultOffset, ...record };
}, offsetShape);

export const sourceInfoSchema = z
  .object({
    kind: z.enum(["road", "route", "freehand", "imported"]),
    provider: z.string().max(120).optional(),
    featureId: z.string().max(160).optional(),
    name: z.string().max(200).optional(),
    fetchedAt: z.string().max(40).optional(),
    query: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.query) return;
    const encoded = JSON.stringify(value.query);
    if (encoded.length > 4000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["query"],
        message: "原始查询条件过长",
      });
    }
  });

const layerIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "图层 id 只能包含字母、数字、下划线和连字符，且不超过 64 个字符");

const lineLayerFields = {
  id: layerIdSchema,
  name: z.string().max(200).default("未命名"),
  visible: z.boolean().default(true),
  zIndex: z.number().int().gte(-1000).lte(1000).default(0),
  style: lineStyleSchema,
  geometry: lineGeometrySchema,
  source: sourceInfoSchema.optional(),
};

export const roadLayerSchema = z
  .object({
    type: z.literal("road-highlight"),
    ...lineLayerFields,
  })
  .strict();

export const freehandLayerSchema = z
  .object({
    type: z.literal("freehand"),
    ...lineLayerFields,
  })
  .strict();

export const labelLayerSchema = z
  .object({
    id: layerIdSchema,
    type: z.literal("label"),
    name: z.string().max(200).default("标签"),
    text: z.string().min(1, "标签文字不能为空").max(500, "标签文字不能超过 500 个字符"),
    position: lngLatSchema,
    visible: z.boolean().default(true),
    zIndex: z.number().int().gte(-1000).lte(1000).default(0),
    icon: z.enum(["none", "pin", "star", "flag", "info"]).default("pin"),
    style: labelStyleSchema,
    leader: leaderSchema,
    offset: offsetSchema,
    placement: z.enum(["auto", "manual"]).default("auto"),
  })
  .strict();

export const layerSchema = z.discriminatedUnion("type", [
  roadLayerSchema,
  freehandLayerSchema,
  labelLayerSchema,
]);

const inlineStyleSchema = z
  .object({
    type: z.literal("inline"),
    style: z.record(z.string(), z.unknown()),
  })
  .strict();

const urlStyleSchema = z
  .object({
    type: z.literal("url"),
    url: z.string().url("样式地址必须是 URL").max(2000),
  })
  .strict();

const namedStyleSchema = z
  .object({
    type: z.literal("builtin"),
    name: z.enum(builtinStyleNames),
  })
  .strict();

export const mapStyleSchema = z.union([
  z.enum(builtinStyleNames),
  namedStyleSchema,
  urlStyleSchema,
  inlineStyleSchema,
]);

export const mapViewSchema = z
  .object({
    center: lngLatSchema,
    zoom: z.number().gte(0, "缩放级别必须在 0 到 22 之间").lte(22, "缩放级别必须在 0 到 22 之间"),
    bearing: z.number().gte(-180).lte(180).default(0),
    pitch: z.number().gte(0).lte(60).default(0),
    style: mapStyleSchema,
    attribution: z.array(z.string().max(240)).max(8).optional(),
  })
  .strict();

const endpointSchema = z
  .object({
    endpoint: z.string().url("服务地址必须是 URL").max(2000).optional(),
    apiKey: z.string().max(500).optional(),
    timeoutMs: z.number().int().gte(1000).lte(60_000).optional(),
    minIntervalMs: z.number().int().gte(0).lte(10_000).optional(),
  })
  .strict();

export const providersSchema = z
  .object({
    geocoding: endpointSchema.optional(),
    roads: endpointSchema.optional(),
    routing: endpointSchema.optional(),
    tiles: endpointSchema.optional(),
  })
  .strict();

const outputShape = z
  .object({
    format: z.enum(["png", "webp", "jpeg"]),
    width: z.number().int().gte(64, "宽度不能小于 64").lte(8192, "宽度不能超过 8192"),
    height: z.number().int().gte(64, "高度不能小于 64").lte(8192, "高度不能超过 8192"),
    pixelRatio: z.number().gte(1, "像素倍率不能小于 1").lte(4, "像素倍率不能超过 4"),
    background: z.union([hexColor, z.literal("transparent")]),
    fit: z.enum(["view", "content"]),
    padding: z.number().int().gte(0).lte(400),
    quality: z.number().gte(0.4).lte(1),
  })
  .strict();

export const defaultOutput = {
  format: "png",
  width: 1600,
  height: 900,
  pixelRatio: 1,
  background: "#ffffff",
  fit: "view",
  padding: 32,
  quality: 0.92,
} as const;

export const outputSchema = z.preprocess((value) => {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return { ...defaultOutput, ...record };
}, outputShape);

export const metaSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().min(1, "项目名称不能为空").max(120, "项目名称不能超过 120 个字符"),
    createdAt: z.string().max(40),
    updatedAt: z.string().max(40),
  })
  .strict();

export const mapProjectSchema = z
  .object({
    schemaVersion: z.literal("1.0", {
      errorMap: () => ({ message: "schemaVersion 目前只支持 1.0" }),
    }),
    meta: metaSchema,
    map: mapViewSchema,
    providers: providersSchema.optional(),
    layers: z.array(layerSchema).max(500, "图层数量不能超过 500"),
    output: outputSchema,
  })
  .strict()
  .superRefine((project, ctx) => {
    const seen = new Set<string>();
    project.layers.forEach((layer, index) => {
      if (seen.has(layer.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["layers", index, "id"],
          message: `重复的图层 id：${layer.id}`,
        });
      }
      seen.add(layer.id);
    });
  });

export type LngLat = z.infer<typeof lngLatSchema>;
export type LineGeometry = z.infer<typeof lineGeometrySchema>;
export type LineStyle = z.infer<typeof lineStyleShape>;
export type LabelStyle = z.infer<typeof labelStyleShape>;
export type LeaderStyle = z.infer<typeof leaderShape>;
export type PixelOffset = z.infer<typeof offsetShape>;
export type SourceInfo = z.infer<typeof sourceInfoSchema>;
export type RoadLayer = z.infer<typeof roadLayerSchema>;
export type FreehandLayer = z.infer<typeof freehandLayerSchema>;
export type LabelLayer = z.infer<typeof labelLayerSchema>;
export type LineLayer = RoadLayer | FreehandLayer;
export type Layer = z.infer<typeof layerSchema>;
export type MapStyle = z.infer<typeof mapStyleSchema>;
export type BuiltinStyleName = (typeof builtinStyleNames)[number];
export type MapView = z.infer<typeof mapViewSchema>;
export type OutputOptions = z.infer<typeof outputShape>;
export type ProjectMeta = z.infer<typeof metaSchema>;
export type ProviderSettings = z.infer<typeof providersSchema>;
export type MapProject = z.infer<typeof mapProjectSchema>;
