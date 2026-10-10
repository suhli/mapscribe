# GitHub Actions

## 渲染

`.github/workflows/render-map.yml` 同时支持 `workflow_dispatch` 和 `workflow_call`。

在 Actions 页面选择 Render map，可以粘贴 JSON，或填写仓库内路径 `project_path`。路径优先于内联 JSON，用来避开输入长度限制。JSON 通过环境变量交给 Node 脚本写入文件，不会拼进 shell 命令。

成功后的 artifact 名称默认是 `rendered-map`：

```text
rendered-map/
├── map.png
├── map.json
├── map.meta.json
├── render-report.json
└── summary.md
```

失败时上传 `rendered-map-error`，里面有 `error-report.json`、`console.log` 和可能的 `debug.png`。页面底部的 Step Summary 会给出结果。每次运行使用自己的 concurrency group，不会取消别人的渲染。

从 API 触发时请带上 `correlation_id`。workflow 的运行名是 `render <correlation_id>`。调用方应按这个名称查找 run id，而不是取最新一次运行。`integrations/skill/scripts/render.mjs` 已经这样做。

```bash
curl -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/OWNER/REPO/actions/workflows/render-map.yml/dispatches \
  -d '{"ref":"main","inputs":{"project_path":"examples/chengdu.json","correlation_id":"demo-001"}}'
```

Token 需要分发 workflow 的权限。不要把 token 放进地图 JSON。

## Pages

`deploy-pages.yml` 在推送到 `main` 或 `master` 时构建编辑器。`base` 来自仓库名：普通项目仓库是 `/仓库名/`，用户站点 `owner.github.io` 是 `/`。仓库需要在 Settings → Pages 里选择 GitHub Actions 作为来源。

渲染 workflow 不会部署 Pages。

## Release

推送 `v*` tag 后，`release.yml` 会附上 Web 静态包和 CLI 包。CLI 包不是各平台单文件可执行程序。解压后用 Node 运行 `node dist/index.js`，再执行 `node dist/index.js install`。
