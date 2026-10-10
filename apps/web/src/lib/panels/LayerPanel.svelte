<script lang="ts">
  import { isLineLayer } from "@mapscribe/core";
  import Button from "$lib/components/ui/button.svelte";
  import { t } from "$lib/preferences.svelte";
  import { editor, session } from "$lib/session.svelte";
  import type { MapController } from "$lib/map/map-controller";

  let { controller }: { controller: MapController | null } = $props();
  const layers = $derived([...session.snapshot.project.layers].reverse());
</script>

<aside class="flex h-full w-full flex-col bg-card" data-testid="layer-list">
  <div class="flex items-center justify-between border-b border-border px-3 py-2">
    <h2 class="text-sm font-semibold">{t("layers")}</h2>
    <span class="text-xs text-muted-foreground">{layers.length}</span>
  </div>
  <div class="min-h-0 flex-1 overflow-auto p-2">
    {#if layers.length === 0}
      <p class="px-2 py-6 text-sm text-muted-foreground">{t("noLayers")}</p>
    {/if}
    {#each layers as layer (layer.id)}
      <div
        class="mb-1 rounded-md border px-2 py-2 {session.snapshot.selection === layer.id ? 'border-primary bg-accent' : 'border-transparent hover:bg-muted'}"
      >
        <button type="button" class="w-full text-left" onclick={() => editor.select(layer.id)}>
          <div class="truncate text-sm font-medium">{layer.type === "label" ? layer.text : layer.name}</div>
          <div class="text-xs text-muted-foreground">
            {layer.type === "road-highlight" ? t("road") : layer.type === "freehand" ? t("draw") : t("label")}
          </div>
        </button>
        <div class="mt-2 flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onclick={() => editor.setVisibility(layer.id, !layer.visible)}>
            {layer.visible ? t("visible") : t("hidden")}
          </Button>
          <Button size="sm" variant="ghost" onclick={() => controller?.fitLayer(layer)}>{t("zoomTo")}</Button>
          <Button size="sm" variant="ghost" onclick={() => editor.duplicateLayer(layer.id)}>{t("duplicate")}</Button>
          <Button size="sm" variant="ghost" onclick={() => editor.moveLayer(layer.id, 1)}>{t("moveUp")}</Button>
          <Button size="sm" variant="ghost" onclick={() => editor.moveLayer(layer.id, -1)}>{t("moveDown")}</Button>
          <Button size="sm" variant="ghost" onclick={() => editor.removeLayer(layer.id)}>{t("delete")}</Button>
        </div>
        {#if isLineLayer(layer)}
          <input
            class="mt-2 h-8 w-full rounded border border-border bg-background px-2 text-xs"
            value={layer.name}
            aria-label={t("rename")}
            onchange={(event) => editor.rename(layer.id, event.currentTarget.value)}
          />
        {/if}
      </div>
    {/each}
  </div>
</aside>
