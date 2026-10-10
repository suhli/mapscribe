# MapScribe Skill

这个 Skill 只是调用本仓库 CLI 或 GitHub Actions 的适配层。删除 `integrations/skill/` 后，Web 编辑器、CLI 和渲染 workflow 仍然可以独立工作。

## 功能

根据一份地图项目 JSON：

1. 校验配置。
2. 选择 `local`、`github` 或 `auto`。
3. 取得渲染出的图片和元数据。

`auto` 会先运行 `mapscribe doctor`。本地 Chromium 可用时走本地渲染。本地依赖缺失且 `MAPSCRIBE_GITHUB_TOKEN` 与 `MAPSCRIBE_GITHUB_REPOSITORY` 都存在时，才改走 GitHub Actions。本地渲染已经开始后如果失败，不会自动改跑远程。

## 调用

在仓库根目录执行：

```bash
node integrations/skill/scripts/render.mjs --mode auto --input examples/chengdu.json --output map.png
```

参数：

| 参数 | 说明 |
| --- | --- |
| `--mode` | `local`、`github` 或 `auto`，默认 `auto` |
| `--input` | 项目 JSON 路径 |
| `--output` | 图片输出路径，默认 `map.png` |

## 依赖

本地模式需要 Node.js 20+、项目依赖和 Playwright Chromium：

```bash
pnpm install
pnpm --filter @mapscribe/cli build:page
pnpm exec tsx apps/cli/src/index.ts install
pnpm exec tsx apps/cli/src/index.ts doctor
```

`install` 只把 Chromium 装进 Playwright 缓存。

GitHub 模式读取环境变量，不把 token 写进地图 JSON：

- `MAPSCRIBE_GITHUB_TOKEN` 或 `GITHUB_TOKEN`
- `MAPSCRIBE_GITHUB_REPOSITORY`，例如 `owner/mapscribe`
- `MAPSCRIBE_GITHUB_REF`，可选，默认 `main`

脚本用 `correlation_id` 触发 `render-map.yml`，再按运行名称 `render <correlation_id>` 查找 run id，不会拿最新一次运行猜测结果。

## 常见错误

- doctor 失败：先运行上面的 `install`。
- workflow 返回 404：检查仓库名和 workflow 文件是否在默认分支。
- 403：token 需要 `actions:write` 才能分发 workflow，下载 artifact 还需要对应的读取权限。
- 校验失败：先运行 `mapscribe validate`。错误会指出字段路径。
