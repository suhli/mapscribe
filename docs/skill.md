# AI Skill

说明在 [`integrations/skill/SKILL.md`](../integrations/skill/SKILL.md)。

Skill 不包含地图引擎，也不计算道路几何。它只负责选择本地 CLI 或 GitHub Actions，并取回图片。Web、CLI 和 workflow 都不导入这个目录。

地理描述应写成项目 JSON 里的 `sourceQuery`。本地用 `mapscribe resolve`，远程则由渲染 workflow 在出图前解析。解析结果为 `ambiguous`、`not_found` 或 `provider_error` 时停止，不要自行填写经纬度或道路折线。
