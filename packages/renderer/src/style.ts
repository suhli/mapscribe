import { styleName, type MapProject, type MapStyle } from "@mapscribe/core";
import { findTileStyle } from "@mapscribe/geo";

export interface ResolvedStyle {
  style: string | Record<string, unknown>;
  attribution: string[];
  warnings: string[];
}

/** 把项目里的样式配置解析成 MapLibre 能加载的样式。 */
export function resolveStyle(style: MapStyle, extraAttribution: string[] = []): ResolvedStyle {
  const warnings: string[] = [];
  const name = styleName(style as MapProject["map"]["style"]);
  if (name === "url" && typeof style !== "string" && style.type === "url") {
    return {
      style: style.url,
      attribution: [...extraAttribution],
      warnings: ["自定义样式的署名需要由样式本身或项目 attribution 提供"],
    };
  }
  if (name === "inline" && typeof style !== "string" && style.type === "inline") {
    return {
      style: style.style,
      attribution: extraAttribution.length > 0 ? extraAttribution : ["MapScribe"],
      warnings,
    };
  }
  const builtin = findTileStyle(name);
  if (!builtin) {
    throw new Error(`未知地图样式：${name}`);
  }
  return {
    style: structuredClone(builtin.style) as string | Record<string, unknown>,
    attribution: [...builtin.attribution, ...extraAttribution.filter((line) => !builtin.attribution.includes(line))],
    warnings,
  };
}

/** 在技术允许时把空白或内联样式的背景改成透明。远程样式保持原样并给出警告。 */
export function applyOutputBackground(
  resolved: ResolvedStyle,
  background: string,
): ResolvedStyle {
  if (background !== "transparent") return resolved;
  if (typeof resolved.style === "string") {
    return {
      ...resolved,
      warnings: [...resolved.warnings, "远程底图样式无法保证透明背景"],
    };
  }
  const style = structuredClone(resolved.style);
  const layers = Array.isArray(style.layers) ? style.layers : [];
  const nextLayers = layers.map((layer) => {
    if (!layer || typeof layer !== "object") return layer;
    const record = layer as Record<string, unknown>;
    if (record.type !== "background") return layer;
    const paint = { ...(record.paint as Record<string, unknown> | undefined) };
    paint["background-color"] = "rgba(0,0,0,0)";
    paint["background-opacity"] = 0;
    return { ...record, paint };
  });
  style.layers = nextLayers;
  return { ...resolved, style };
}
