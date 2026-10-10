# 配置

项目 JSON 由 `@mapscribe/core` 的 Zod schema 校验。当前版本是 `1.0`。缺省字段会补上默认值；未知字段和越界数值会报出路径，例如 `map.center.0: 经度必须在 -180 到 180 之间`。

坐标顺序是 GeoJSON 的 `[longitude, latitude]`。

## 地图

- `map.center`、`zoom`、`bearing`、`pitch`
- `map.style`：`light`、`bright`、`liberty`、`dark`、`fiord`、`blank`，或 `{ "type": "url", "url": "https://..." }`，或 `{ "type": "inline", "style": { ...MapLibre style } }`
- `map.attribution`：额外署名，会画进导出图片

`blank` 不请求瓦片，适合离线手绘和测试。编辑器也可以用 `/?basemap=blank&fresh=1` 打开。

## 图层

- `road-highlight`：点选或路线得到的道路，几何保存在 `geometry`
- `freehand`：手绘折线
- `label`：文字、图标、背景、引导线和手动偏移

`style.widthMode` 为 `zoom` 时，线宽以 `referenceZoom` 为基准随缩放变化；`screen` 保持屏幕像素宽度。

道路和标签也可以先写可选的 `sourceQuery`，不立即提供几何。解析完成后，真实几何写入原有的 `geometry` 或 `position`，并保留 `sourceQuery` 与 `resolution`。内部坐标始终是 WGS84 的 `[经度, 纬度]`。只有坐标锚点明确声明 `GCJ02` 或 `BD09` 时才会转换；OpenStreetMap、Nominatim、Overpass 和 OSRM 的结果本身就是 WGS84，不会再转换。

`sourceQuery.type` 区分不同意图：

- `place`：地点。`precision` 可以是 `point`、`area` 或 `entrance`。
- `intersection`：两条道路的平面交叉口，结果是标签。
- `road`：按名称取得道路几何。
- `road-segment`：沿指定道路，从 `from` 到 `to` 提取路段。端点可以是交叉口、地点或坐标。
- `nearby-roads`：`mode` 为 `radius` 或 `along-road`。未写 `radiusMeters` 时使用 100 米，并记入警告。
- `route`：起终点驾车导航，不是某一条道路的实体几何。

`location` 至少要有 `city` 或 `bounds`（西、南、东、北）才能查询道路。多个合理结果保持 `ambiguous`，用 `candidateId` 指定候选。`resolution.status` 为 `resolved` 且几何仍在时，再次渲染直接使用已保存几何。`mapscribe resolve --force` 或编辑器里的「重新解析」才会重新请求。

```json
{
  "id": "highlight-1",
  "type": "road-highlight",
  "sourceQuery": {
    "type": "road-segment",
    "location": { "city": "成都市" },
    "road": "人民南路",
    "from": { "type": "intersection", "road": "道路A" },
    "to": { "type": "intersection", "road": "道路B" }
  }
}
```

## 导出

`output.width` 和 `output.height` 是图片像素。`pixelRatio` 是清晰度倍率，文件尺寸仍是宽乘高。`fit` 为 `view` 时使用保存的中心和缩放，为 `content` 时适配全部可见对象。

访问密钥可以写在 `providers.*.apiKey`，但网页导出的项目 JSON 默认会去掉它。网页里的 Key 存在浏览器本地设置，不进项目文件。
