<script lang="ts">
  import { resolveStyle } from "@mapscribe/renderer";
  import { t } from "$lib/preferences.svelte";
  import { session } from "$lib/session.svelte";

  const view = $derived(session.snapshot.project.map);
  const attribution = $derived(resolveStyle(view.style, view.attribution ?? []).attribution.join(" · "));
  const hint = $derived(
    session.snapshot.tool === "draw"
      ? t("drawHint")
      : session.snapshot.tool === "label"
        ? t("labelHint")
        : session.snapshot.tool === "road"
          ? t("roadHint")
          : session.snapshot.tool === "route"
            ? t("routeHint")
            : t("selectHint"),
  );
</script>

<footer class="flex h-9 shrink-0 items-center gap-3 overflow-hidden border-t border-border bg-card px-3 text-xs text-muted-foreground">
  <span>{hint}</span>
  <span class="ml-auto shrink-0">{t("zoomLevel")} {view.zoom.toFixed(2)}</span>
  <span class="shrink-0">{view.center[0].toFixed(5)}, {view.center[1].toFixed(5)}</span>
  <span class="shrink-0">{t("objects")} {session.snapshot.project.layers.length}</span>
  <span class="shrink-0">{session.snapshot.saved ? t("saved") : t("unsaved")}</span>
  <span class="hidden max-w-80 truncate lg:inline">{attribution}</span>
</footer>
