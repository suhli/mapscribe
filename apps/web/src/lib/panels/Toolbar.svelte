<script lang="ts">
  import type { BuiltinStyleName } from "@mapscribe/core";
  import { TILE_STYLES } from "@mapscribe/geo";
  import { DropdownMenu } from "bits-ui";
  import Button from "$lib/components/ui/button.svelte";
  import { searchPlace } from "$lib/map/interactions";
  import { t } from "$lib/preferences.svelte";
  import { editor, session } from "$lib/session.svelte";
  import type { MapController } from "$lib/map/map-controller";

  let {
    controller,
    onExportImage,
    onExportJson,
    onExportGeojson,
    onImport,
    onNew,
    onSettings,
    onLocate,
    onShortcuts,
    onSemantic,
  }: {
    controller: MapController | null;
    onExportImage: () => void;
    onExportJson: () => void;
    onExportGeojson: () => void;
    onImport: () => void;
    onNew: () => void;
    onSettings: () => void;
    onLocate: () => void;
    onShortcuts: () => void;
    onSemantic: () => void;
  } = $props();

  let query = $state("");
  let results = $state<Array<{ label: string; position: [number, number]; bounds?: [number, number, number, number] }>>([]);
  const tools = [
    ["select", "select"],
    ["road", "road"],
    ["route", "route"],
    ["draw", "draw"],
    ["label", "label"],
  ] as const;

  const styles = TILE_STYLES.filter((style) => style.id !== "positron");

  async function onSearch(): Promise<void> {
    results = await searchPlace(query);
  }

  function choose(result: (typeof results)[number]): void {
    if (result.bounds && controller) controller.fitBounds(result.bounds);
    else controller?.focus(result.position, 15);
    results = [];
  }

  function currentStyle(): string {
    const style = session.snapshot.project.map.style;
    return typeof style === "string" ? style : style.type === "builtin" ? style.name : "url";
  }

  function setStyle(name: string): void {
    editor.setStyle(name as BuiltinStyleName);
  }
</script>

<header class="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
  <div class="mr-1 hidden text-sm font-semibold tracking-tight sm:block">{t("appName")}</div>
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      class="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-accent"
      data-testid="file-menu"
    >
      {t("file")}
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content class="z-50 min-w-44 rounded-md border border-border bg-card p-1 text-sm shadow-xl">
        <DropdownMenu.Item class="cursor-pointer rounded px-2 py-1.5 outline-none data-highlighted:bg-accent" onSelect={onNew}>
          {t("newProject")}
        </DropdownMenu.Item>
        <DropdownMenu.Item class="cursor-pointer rounded px-2 py-1.5 outline-none data-highlighted:bg-accent" onSelect={onImport}>
          {t("import")}
        </DropdownMenu.Item>
        <DropdownMenu.Item class="cursor-pointer rounded px-2 py-1.5 outline-none data-highlighted:bg-accent" onSelect={onExportJson}>
          {t("exportJson")}
        </DropdownMenu.Item>
        <DropdownMenu.Item
          class="cursor-pointer rounded px-2 py-1.5 outline-none data-highlighted:bg-accent"
          onSelect={onExportGeojson}
        >
          {t("exportGeojson")}
        </DropdownMenu.Item>
        <DropdownMenu.Item class="cursor-pointer rounded px-2 py-1.5 outline-none data-highlighted:bg-accent" onSelect={onExportImage}>
          {t("exportImage")}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
  <div class="flex items-center gap-1 overflow-x-auto">
    {#each tools as [id, key] (id)}
      <Button
        variant={session.snapshot.tool === id ? "default" : "ghost"}
        size="sm"
        aria-pressed={session.snapshot.tool === id}
        data-testid={`tool-${id}`}
        onclick={() => editor.setTool(id)}
      >
        {t(key)}
      </Button>
    {/each}
    <Button size="sm" variant="ghost" data-testid="tool-semantic" onclick={onSemantic}>{t("semantic")}</Button>
  </div>
  <form
    class="relative mx-1 hidden min-w-0 flex-1 md:block"
    onsubmit={(event) => {
      event.preventDefault();
      void onSearch();
    }}
  >
    <input
      class="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      placeholder={t("search")}
      bind:value={query}
      data-testid="search-input"
    />
    {#if results.length > 0}
      <ul class="absolute top-10 z-40 max-h-64 w-full overflow-auto rounded-md border border-border bg-card shadow-xl">
        {#each results as result (result.label)}
          <li>
            <button type="button" class="block w-full px-3 py-2 text-left text-sm hover:bg-accent" onclick={() => choose(result)}>
              {result.label}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </form>
  <label class="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
    {t("style")}
    <select
      class="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
      value={currentStyle()}
      onchange={(event) => setStyle(event.currentTarget.value)}
      data-testid="style-select"
    >
      {#each styles as style (style.id)}
        <option value={style.id}>{t(style.id as "light")}</option>
      {/each}
    </select>
  </label>
  <Button size="icon" variant="ghost" title={t("undo")} disabled={!session.snapshot.canUndo} onclick={() => editor.undo()}>↩</Button>
  <Button size="icon" variant="ghost" title={t("redo")} disabled={!session.snapshot.canRedo} onclick={() => editor.redo()}>↪</Button>
  <Button size="sm" variant="ghost" onclick={onLocate}>{t("locate")}</Button>
  <Button
    size="sm"
    variant="ghost"
    onclick={() => controller?.fitProject(session.snapshot.project)}
  >
    {t("fit")}
  </Button>
  <Button size="sm" variant="ghost" onclick={onSettings}>{t("settings")}</Button>
  <Button size="sm" variant="ghost" onclick={onShortcuts}>?</Button>
</header>
