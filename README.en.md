# MapScribe

MapScribe is an open-source map editor and renderer. Edit roads and labels in the browser, then render the same JSON locally or with GitHub Actions.

中文文档：[README.md](README.md)

## Develop

Node.js 20+ and pnpm 10:

```bash
pnpm install
pnpm dev
```

The editor is at `http://127.0.0.1:5173`. The default basemap is OpenFreeMap and does not need an API key.

```bash
pnpm test
pnpm build
```

## CLI

```bash
pnpm --filter @mapscribe/cli build
pnpm exec tsx apps/cli/src/index.ts install
pnpm exec tsx apps/cli/src/index.ts render examples/chengdu.json --output map.png
```

`install` only downloads Playwright Chromium. `examples/chengdu.json` contains real OpenStreetMap geometry for way `625875294`.

## Actions and Pages

Run the **Render map** workflow and download the `rendered-map` artifact. Pushing to `main` deploys the editor with GitHub Pages. See [docs/github-actions.md](docs/github-actions.md).

The optional agent adapter lives in [integrations/skill/SKILL.md](integrations/skill/SKILL.md). Deleting that directory does not affect the editor, CLI, or workflows.

## License

MIT. Keep the OpenStreetMap, OpenFreeMap, and OpenMapTiles attribution on exported images.
