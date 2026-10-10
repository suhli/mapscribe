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

## 导出

`output.width` 和 `output.height` 是图片像素。`pixelRatio` 是清晰度倍率，文件尺寸仍是宽乘高。`fit` 为 `view` 时使用保存的中心和缩放，为 `content` 时适配全部可见对象。

访问密钥可以写在 `providers.*.apiKey`，但网页导出的项目 JSON 默认会去掉它。网页里的 Key 存在浏览器本地设置，不进项目文件。
