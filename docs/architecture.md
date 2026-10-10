# 架构

MapScribe 把地图项目和渲染执行分开。Web 编辑器、本地 CLI 和 GitHub Actions 使用同一份 JSON。

```text
apps/web        Svelte 编辑器
apps/cli        命令行与 Playwright 渲染页
packages/core   MapProject schema 与迁移
packages/geo    地理编码、道路、路线、底图目录
packages/renderer  样式、GeoJSON 覆盖层、标签布局、render-ready、位图合成
packages/editor 撤销、图层操作、本地草稿
packages/exporters  GeoJSON 与图片尺寸校验
integrations/skill  可选的 Agent 适配层
```

## 渲染

道路和手绘折线进入 MapLibre GeoJSON 线图层。标签用同一套 `placeLabels` 计算位置：编辑器里是 DOM，导出时画到画布上。这样浏览器导出和 CLI 截图使用同一套样式与避让。

渲染完成不以固定睡眠为准。`whenMapReady` 等待样式加载、当前视图瓦片加载以及地图 `idle`。

## 数据

重新打开项目时直接使用 JSON 里的几何。`source` 只保留当初的查询来源，例如 Overpass way id 或 OSRM 起终点，不在渲染时重算道路。

道路点选和起终点路线是两个 Provider。路线失败时不会把两点连成直线。

## 部署

GitHub Pages 只托管 `apps/web` 的静态构建，没有自建后端。Actions 渲染任务使用独立 workflow，不会触发 Pages 部署。
