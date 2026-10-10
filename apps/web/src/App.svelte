<script lang="ts">
  import { onMount } from "svelte";
  import { createEmptyProject, parseProject, projectToJson, type OutputOptions } from "@mapscribe/core";
  import { clearDraft, createBrowserStore, loadDraft, saveDraft } from "@mapscribe/editor";
  import { projectToFeatureCollection } from "@mapscribe/exporters";
  import Button from "$lib/components/ui/button.svelte";
  import Dialog from "$lib/components/ui/dialog.svelte";
  import { acceptRoad, cancelRoute, confirmRoute, resetProviders } from "$lib/map/interactions";
  import type { MapController } from "$lib/map/map-controller";
  import Inspector from "$lib/panels/Inspector.svelte";
  import LayerPanel from "$lib/panels/LayerPanel.svelte";
  import MapStage from "$lib/panels/MapStage.svelte";
  import SemanticLocate from "$lib/panels/SemanticLocate.svelte";
  import StatusBar from "$lib/panels/StatusBar.svelte";
  import Toolbar from "$lib/panels/Toolbar.svelte";
  import { applyTheme, preferences, setLocale, setTheme, t } from "$lib/preferences.svelte";
  import { defaultSettings, loadSettings, saveSettings, type LocalSettings } from "$lib/settings";
  import { editor, freshStartRequested, session } from "$lib/session.svelte";
  import { downloadBlob, downloadText } from "$lib/utils";

  let controller = $state<MapController | null>(null);
  let hydrated = $state(false);
  let savedText = "";
  let layersOpen = $state(true);
  let inspectorOpen = $state(true);
  let exportOpen = $state(false);
  let settingsOpen = $state(false);
  let locateOpen = $state(false);
  let shortcutsOpen = $state(false);
  let confirmOpen = $state(false);
  let semanticOpen = $state(false);
  let settingsForm = $state<LocalSettings>(defaultSettings());
  let locateForm = $state({ longitude: "104.0658", latitude: "30.6574", zoom: "15" });
  let fileInput = $state<HTMLInputElement | null>(null);

  const output = $derived(session.snapshot.project.output);

  onMount(() => {
    applyTheme();
    document.documentElement.lang = preferences.locale === "zh" ? "zh-CN" : "en";
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => applyTheme();
    media.addEventListener("change", onTheme);
    if (window.innerWidth < 1024) {
      layersOpen = false;
      inspectorOpen = false;
    }
    void (async () => {
      if (!freshStartRequested()) {
        try {
          const draft = await loadDraft(createBrowserStore());
          if (draft) editor.replace(draft);
        } catch {
          editor.setNotice(t("importFailed"));
        }
      }
      savedText = JSON.stringify(editor.getSnapshot().project);
      hydrated = true;
    })();
    window.addEventListener("keydown", onKey);
    return () => {
      media.removeEventListener("change", onTheme);
      window.removeEventListener("keydown", onKey);
    };
  });

  $effect(() => {
    if (!hydrated) return;
    const project = session.snapshot.project;
    const text = JSON.stringify(project);
    if (text === savedText) return;
    const timer = window.setTimeout(() => {
      saveDraft(createBrowserStore(), project)
        .then(() => {
          savedText = text;
          editor.markSaved();
        })
        .catch(() => editor.setNotice(t("unsaved")));
    }, 500);
    return () => window.clearTimeout(timer);
  });

  $effect(() => {
    const notice = session.snapshot.notice;
    if (!notice) return;
    const timer = window.setTimeout(() => editor.setNotice(null), 7000);
    return () => window.clearTimeout(timer);
  });

  function onKey(event: KeyboardEvent): void {
    const target = event.target;
    if (target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
    } else if ((event.ctrlKey || event.metaKey) && key === "y") {
      event.preventDefault();
      editor.redo();
    } else if ((event.ctrlKey || event.metaKey) && key === "d") {
      event.preventDefault();
      const id = editor.getSnapshot().selection;
      if (id) editor.duplicateLayer(id);
    } else if ((event.ctrlKey || event.metaKey) && key === "s") {
      event.preventDefault();
      exportJson();
    } else if (key === "delete" || key === "backspace") {
      const id = editor.getSnapshot().selection;
      if (id) editor.removeLayer(id);
    } else if (key === "escape") {
      controller?.cancelDraw();
      editor.setTool("select");
      cancelRoute();
    } else if (key === "v") editor.setTool("select");
    else if (key === "h") editor.setTool("road");
    else if (key === "p") editor.setTool("route");
    else if (key === "d") editor.setTool("draw");
    else if (key === "l") editor.setTool("label");
    else if (key === "f") controller?.fitProject(session.snapshot.project);
  }

  function exportJson(): void {
    const project = editor.getSnapshot().project;
    downloadText(projectToJson(project), `${project.meta.name}.json`);
  }

  function exportGeojson(): void {
    const project = editor.getSnapshot().project;
    downloadText(JSON.stringify(projectToFeatureCollection(project), null, 2), `${project.meta.name}.geojson`);
  }

  async function exportImage(): Promise<void> {
    if (!controller) return;
    try {
      const project = editor.getSnapshot().project;
      const blob = await controller.exportImage(project, editor.getSnapshot().selection);
      const extension = project.output.format === "jpeg" ? "jpg" : project.output.format;
      downloadBlob(blob, `${project.meta.name}.${extension}`);
      exportOpen = false;
    } catch (error) {
      editor.setNotice(error instanceof Error ? error.message : t("importFailed"));
    }
  }

  async function onImportFile(event: Event): Promise<void> {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const parsed = parseProject(JSON.parse(await file.text()) as unknown);
      editor.replace(parsed.project, { record: true });
      if (parsed.warnings.length > 0) editor.setNotice(parsed.warnings.join(" "));
    } catch (error) {
      editor.setNotice(error instanceof Error ? error.message : t("importFailed"));
    }
  }

  function createNew(): void {
    const project = createEmptyProject();
    editor.replace(project);
    void clearDraft(createBrowserStore());
    savedText = JSON.stringify(project);
    confirmOpen = false;
  }

  function patchOutput(patch: Partial<OutputOptions>): void {
    editor.setOutput({ ...editor.getSnapshot().project.output, ...patch });
  }

  function openSettings(): void {
    settingsForm = loadSettings();
    settingsOpen = true;
  }

  function persistSettings(): void {
    saveSettings(settingsForm);
    resetProviders();
    if (settingsForm.customStyleUrl) editor.setStyle({ type: "url", url: settingsForm.customStyleUrl });
    settingsOpen = false;
  }
</script>

<div class="flex h-dvh flex-col bg-background text-foreground">
  <Toolbar
    {controller}
    onExportImage={() => (exportOpen = true)}
    onExportJson={exportJson}
    onExportGeojson={exportGeojson}
    onImport={() => fileInput?.click()}
    onNew={() => (confirmOpen = true)}
    onSettings={openSettings}
    onLocate={() => (locateOpen = true)}
    onShortcuts={() => (shortcutsOpen = true)}
    onSemantic={() => (semanticOpen = true)}
  />
  <div class="flex min-h-0 flex-1">
    {#if layersOpen}
      <div class="absolute inset-y-14 z-30 h-auto w-72 border-r border-border bg-card md:static md:h-full">
        <LayerPanel {controller} />
      </div>
    {/if}
    <main class="relative min-w-0 flex-1">
      <MapStage onReady={(value) => (controller = value)} />
      {#if session.snapshot.notice}
        <div class="absolute top-3 left-1/2 z-40 max-w-lg -translate-x-1/2 rounded-md bg-slate-950/90 px-3 py-2 text-sm text-white shadow-lg">
          {session.snapshot.notice}
        </div>
      {/if}
      {#if session.snapshot.roadChoices}
        <div class="absolute bottom-3 left-3 z-40 flex max-w-xl flex-wrap gap-2 rounded-lg border border-border bg-card p-2 shadow-lg">
          <span class="px-1 text-xs text-muted-foreground">{t("chooseRoad")}</span>
          {#each session.snapshot.roadChoices as choice (choice.id)}
            <Button size="sm" onclick={() => acceptRoad(choice.id)}>{choice.name}</Button>
          {/each}
          <Button size="sm" variant="ghost" onclick={() => editor.setRoadChoices(null)}>{t("cancel")}</Button>
        </div>
      {/if}
      {#if session.snapshot.route}
        <div class="absolute right-3 bottom-3 z-40 max-w-sm rounded-lg border border-border bg-card p-3 shadow-lg">
          <div class="mb-2 text-sm font-medium">{t("chooseRoute")}</div>
          <div class="space-y-1">
            {#each session.snapshot.route.alternatives as alternative, index (alternative.summary)}
              <button
                type="button"
                class="block w-full rounded px-2 py-1 text-left text-sm {index === session.snapshot.route.selectedIndex ? 'bg-accent' : 'hover:bg-muted'}"
                onclick={() => editor.selectRoute(index)}
              >
                {alternative.summary}
              </button>
            {/each}
          </div>
          <div class="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onclick={cancelRoute}>{t("routeCancel")}</Button>
            <Button size="sm" variant="default" onclick={confirmRoute}>{t("routeConfirm")}</Button>
          </div>
        </div>
      {/if}
    </main>
    {#if inspectorOpen}
      <div class="absolute inset-y-14 right-0 z-30 w-80 border-l border-border bg-card md:static md:h-full">
        <Inspector />
      </div>
    {/if}
  </div>
  <div class="flex items-center gap-2 border-t border-border px-3 py-1 md:hidden">
    <Button size="sm" onclick={() => (layersOpen = !layersOpen)}>{t("layers")}</Button>
    <Button size="sm" onclick={() => (inspectorOpen = !inspectorOpen)}>{t("properties")}</Button>
  </div>
  <StatusBar />
</div>

<input bind:this={fileInput} class="hidden" type="file" accept="application/json,.json" onchange={onImportFile} />

<SemanticLocate bind:open={semanticOpen} {controller} />

<Dialog bind:open={exportOpen} title={t("exportTitle")}>
  <div class="grid gap-3 text-sm">
    <label class="grid gap-1 text-xs text-muted-foreground">
      {t("format")}
      <select class="h-9 rounded-md border border-border bg-background px-2" value={output.format} onchange={(event) => patchOutput({ format: event.currentTarget.value as OutputOptions["format"] })}>
        <option value="png">PNG</option>
        <option value="webp">WebP</option>
        <option value="jpeg">JPEG</option>
      </select>
    </label>
    <label class="grid gap-1 text-xs text-muted-foreground">
      {t("imageWidth")}
      <input class="h-9 rounded-md border border-border px-2" type="number" min="64" max="8192" value={output.width} onchange={(event) => patchOutput({ width: Number(event.currentTarget.value) })} />
    </label>
    <label class="grid gap-1 text-xs text-muted-foreground">
      {t("imageHeight")}
      <input class="h-9 rounded-md border border-border px-2" type="number" min="64" max="8192" value={output.height} onchange={(event) => patchOutput({ height: Number(event.currentTarget.value) })} />
    </label>
    <label class="grid gap-1 text-xs text-muted-foreground">
      {t("pixelRatio")}
      <input class="h-9 rounded-md border border-border px-2" type="number" min="1" max="4" step="0.5" value={output.pixelRatio} onchange={(event) => patchOutput({ pixelRatio: Number(event.currentTarget.value) })} />
    </label>
    <label class="grid gap-1 text-xs text-muted-foreground">
      {t("fit")}
      <select class="h-9 rounded-md border border-border bg-background px-2" value={output.fit} onchange={(event) => patchOutput({ fit: event.currentTarget.value as OutputOptions["fit"] })}>
        <option value="view">{t("fitView")}</option>
        <option value="content">{t("fitContent")}</option>
      </select>
    </label>
  </div>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (exportOpen = false)}>{t("cancel")}</Button>
    <Button variant="default" data-testid="download-image" onclick={() => void exportImage()}>{t("download")}</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={settingsOpen} title={t("settingsTitle")}>
  <div class="grid gap-3 text-sm">
    <p class="text-xs text-muted-foreground">{t("policy")}</p>
    <label class="grid gap-1 text-xs text-muted-foreground">{t("geocoding")}<input class="h-9 rounded-md border border-border px-2" bind:value={settingsForm.geocodingEndpoint} /></label>
    <label class="grid gap-1 text-xs text-muted-foreground">{t("roads")}<input class="h-9 rounded-md border border-border px-2" bind:value={settingsForm.roadsEndpoint} /></label>
    <label class="grid gap-1 text-xs text-muted-foreground">{t("routing")}<input class="h-9 rounded-md border border-border px-2" bind:value={settingsForm.routingEndpoint} /></label>
    <label class="grid gap-1 text-xs text-muted-foreground">{t("customStyle")}<input class="h-9 rounded-md border border-border px-2" bind:value={settingsForm.customStyleUrl} /></label>
    <label class="grid gap-1 text-xs text-muted-foreground">{t("apiKey")}<input class="h-9 rounded-md border border-border px-2" type="password" bind:value={settingsForm.tilesApiKey} autocomplete="off" /></label>
    <label class="grid gap-1 text-xs text-muted-foreground">
      {t("language")}
      <select class="h-9 rounded-md border border-border bg-background px-2" value={preferences.locale} onchange={(event) => setLocale(event.currentTarget.value as "zh" | "en")}>
        <option value="zh">中文</option>
        <option value="en">English</option>
      </select>
    </label>
    <label class="grid gap-1 text-xs text-muted-foreground">
      {t("theme")}
      <select class="h-9 rounded-md border border-border bg-background px-2" value={preferences.theme} onchange={(event) => setTheme(event.currentTarget.value as "light" | "dark" | "system")}>
        <option value="system">{t("themeSystem")}</option>
        <option value="light">{t("themeLight")}</option>
        <option value="dark">{t("themeDark")}</option>
      </select>
    </label>
  </div>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => { void clearDraft(createBrowserStore()); editor.setNotice(t("saved")); }}>{t("clearDraft")}</Button>
    <Button variant="default" onclick={persistSettings}>{t("confirm")}</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={locateOpen} title={t("locateTitle")}>
  <div class="grid gap-3 text-sm">
    <label class="grid gap-1 text-xs text-muted-foreground">{t("longitude")}<input class="h-9 rounded-md border border-border px-2" bind:value={locateForm.longitude} /></label>
    <label class="grid gap-1 text-xs text-muted-foreground">{t("latitude")}<input class="h-9 rounded-md border border-border px-2" bind:value={locateForm.latitude} /></label>
    <label class="grid gap-1 text-xs text-muted-foreground">{t("zoomLevel")}<input class="h-9 rounded-md border border-border px-2" bind:value={locateForm.zoom} /></label>
  </div>
  {#snippet footer()}
    <Button
      variant="default"
      onclick={() => {
        const longitude = Number(locateForm.longitude);
        const latitude = Number(locateForm.latitude);
        const zoom = Number(locateForm.zoom);
        if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
          editor.setNotice(t("importFailed"));
          return;
        }
        controller?.focus([longitude, latitude], zoom);
        editor.setView({ center: [longitude, latitude], zoom });
        locateOpen = false;
      }}
    >
      {t("go")}
    </Button>
  {/snippet}
</Dialog>

<Dialog bind:open={shortcutsOpen} title={t("shortcutsTitle")}>
  <ul class="space-y-1 text-sm text-muted-foreground">
    <li>V {t("select")}</li>
    <li>H {t("road")}</li>
    <li>P {t("route")}</li>
    <li>D {t("draw")}</li>
    <li>L {t("label")}</li>
    <li>F {t("fit")}</li>
    <li>Ctrl/⌘ Z {t("undo")}</li>
    <li>Ctrl/⌘ Shift Z {t("redo")}</li>
    <li>Delete {t("delete")}</li>
    <li>Ctrl/⌘ D {t("duplicate")}</li>
    <li>Ctrl/⌘ S {t("exportJson")}</li>
    <li>Esc {t("cancel")}</li>
  </ul>
</Dialog>

<Dialog bind:open={confirmOpen} title={t("newProject")}>
  <p class="text-sm">{t("confirmNew")}</p>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (confirmOpen = false)}>{t("cancel")}</Button>
    <Button variant="destructive" onclick={createNew}>{t("confirm")}</Button>
  {/snippet}
</Dialog>
