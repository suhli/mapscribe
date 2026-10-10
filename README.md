# MapScribe

MapScribe 是一个开源地图编辑与渲染工具。你可以在浏览器里浏览真实底图、点选或绘制道路、添加地点标签，并把同一份 JSON 交给本地命令或 GitHub Actions 导出图片。

英文说明：[README.en.md](README.en.md)

## 功能

- 平移、缩放、地点搜索、坐标定位、比例尺和数据署名
- 按地名、道路名、交叉口或路段描述定位，也可以点选道路、沿路网连接起终点、自由绘制并编辑节点
- 独立设置颜色、线宽、透明度、虚线、端点和描边
- 地点标签：文字、图标、背景、引导线、拖动和简单避让
- 图层显示、重命名、排序、复制、删除，以及撤销重做
- 导入导出项目 JSON、GeoJSON 和 PNG / WebP / JPEG
- 浏览器本地草稿
- 浅色 / 深色主题，中英文界面

在线编辑器由 GitHub Pages 托管。仓库启用 Pages 并选择 GitHub Actions 作为来源后，地址是：

`https://<owner>.github.io/<repository>/`

## 本地开发

需要 Node.js 20 或更高版本，以及 pnpm 10。

```bash
pnpm install
pnpm dev
```

编辑器运行在 `http://127.0.0.1:5173`。默认底图是 OpenFreeMap，不需要 API Key。

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm test` 会用 MapLibre 和 Playwright 渲染 `tests/fixtures/render-project.json`，检查图片尺寸、道路颜色和中文字体。测试底图是本地空白样式，不依赖公共瓦片。

## 命令行

```bash
pnpm --filter @mapscribe/cli build
pnpm exec tsx apps/cli/src/index.ts install
pnpm exec tsx apps/cli/src/index.ts doctor
pnpm exec tsx apps/cli/src/index.ts validate examples/chengdu.json
pnpm exec tsx apps/cli/src/index.ts resolve map.json --output resolved.json
pnpm exec tsx apps/cli/src/index.ts render examples/chengdu.json --output map.png --artifact-dir rendered-map
```

`resolve` 把 `sourceQuery` 解析成真实几何。`render` 只在几何还没解析时才会查询地理服务；结果有歧义或失败时退出，不会用猜测坐标出图。已保存的几何要用 `resolve --force` 才会重查。多个候选用重复的 `--select 图层id=候选id`。

`install` 只安装 Playwright Chromium，不修改系统包。`examples/chengdu.json` 使用 OpenStreetMap way `625875294`（成都「西里」）的真实几何。渲染它会请求 OpenFreeMap 瓦片，请遵守其使用政策；批量出图应换成自己的样式地址。

机器可读输出加上 `--json`。日志级别用 `--log-level silent|error|info|debug`。校验失败的退出码是 1。

## 项目 JSON

Web、CLI 和 Actions 使用同一 schema。最小例子：

```json
{
  "schemaVersion": "1.0",
  "map": { "center": [104.0809, 30.657], "zoom": 17, "style": "light" },
  "layers": [],
  "output": { "format": "png", "width": 1600, "height": 900, "pixelRatio": 1 }
}
```

坐标是 `[经度, 纬度]`。完整字段见 [docs/configuration.md](docs/configuration.md)。

## GitHub Actions

在 Actions 里手动运行 **Render map**，粘贴 JSON 或填写仓库内的 `project_path`。成功后从 Artifacts 下载 `rendered-map`。说明见 [docs/github-actions.md](docs/github-actions.md)。

## 地图数据

默认使用 OpenFreeMap、Nominatim、Overpass 和 OSRM 演示服。这些服务只适合交互编辑和少量出图。配置方式见 [docs/providers.md](docs/providers.md)。

## 常见问题

- 底图空白：检查网络，或临时使用「空白」样式继续手绘。自定义样式 URL 可在设置里填写。
- 点选不到道路：公共 Overpass 可能限流。界面会提示，并允许改用手绘。底图退回的几何可能在瓦片边缘被截断。
- 起终点没有结果：不会画一条直线冒充道路。可以手绘这段路。
- 中文成方框：确认 Playwright 渲染页已经构建，并且页面加载了 Noto Sans SC。`doctor` 不负责系统字体，渲染页自带字体文件。
- CLI 找不到浏览器：运行 `mapscribe install`。

## 许可与署名

项目代码使用 [MIT](LICENSE)。地图数据遵循其各自许可。使用 OpenStreetMap 数据时必须保留贡献者署名。OpenFreeMap 与 OpenMapTiles 的署名会画在导出图片上，请不要裁掉。
