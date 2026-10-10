<script lang="ts">
  import type { LineGeometry } from "@mapscribe/core";
  import { AMBIGUOUS_SCOPE_REASON, type ResolutionCandidate } from "@mapscribe/geo";
  import Button from "$lib/components/ui/button.svelte";
  import Dialog from "$lib/components/ui/dialog.svelte";
  import type { MapController } from "$lib/map/map-controller";
  import { resolveSemantic, type SemanticMode, type SemanticOutcome } from "$lib/map/semantic";
  import { t } from "$lib/preferences.svelte";
  import { editor } from "$lib/session.svelte";

  let { open = $bindable(false), controller }: { open: boolean; controller: MapController | null } = $props();

  let mode = $state<SemanticMode>("place");
  let city = $state("");
  let primary = $state("");
  let secondary = $state("");
  let fromRoad = $state("");
  let toRoad = $state("");
  let radius = $state("");
  let nearbyMode = $state<"radius" | "along-road">("radius");
  let entrance = $state(false);
  let outcome = $state<SemanticOutcome | null>(null);
  let busy = $state(false);

  const modes: SemanticMode[] = ["place", "road", "intersection", "segment", "nearby", "route"];

  $effect(() => {
    if (!open) editor.setLinePreview(null);
  });

  function show(result: SemanticOutcome): void {
    outcome = result;
    const preview: LineGeometry | null = result.preview;
    editor.setLinePreview(preview);
    if (result.bounds && controller) controller.fitBounds(result.bounds);
    else if (result.focus) controller?.focus(result.focus, 16);
  }

  async function search(selection?: { candidateId?: string; bounds?: [number, number, number, number] }): Promise<void> {
    busy = true;
    editor.setBusy(true);
    try {
      const radiusMeters = Number(radius);
      const result = await resolveSemantic({
        mode,
        city,
        primary,
        secondary,
        fromRoad,
        toRoad,
        nearbyMode,
        entrance,
        ...(Number.isFinite(radiusMeters) && radiusMeters > 0 ? { radiusMeters } : {}),
        ...(selection?.candidateId ? { candidateId: selection.candidateId } : {}),
        ...(selection?.bounds ? { bounds: selection.bounds } : {}),
      });
      show(result);
    } finally {
      busy = false;
      editor.setBusy(false);
    }
  }

  function chooseCandidate(candidate: ResolutionCandidate): void {
    if (candidate.bounds && candidate.reason === AMBIGUOUS_SCOPE_REASON) {
      void search({ bounds: candidate.bounds });
      return;
    }
    void search({ candidateId: candidate.id });
  }

  function apply(): void {
    if (!outcome?.layer) return;
    editor.addLayer(outcome.layer);
    editor.setLinePreview(null);
    outcome = null;
    open = false;
  }
</script>

<Dialog bind:open title={t("semanticTitle")}>
  <p class="mb-3 text-xs text-muted-foreground">{t("semanticHint")}</p>
  <div class="grid gap-3 text-sm">
    <label class="grid gap-1 text-xs text-muted-foreground">
      {t("semanticKind")}
      <select class="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" bind:value={mode}>
        {#each modes as item (item)}
          <option value={item}>{t(item === "place" ? "semanticPlace" : item === "road" ? "semanticRoad" : item === "intersection" ? "semanticIntersection" : item === "segment" ? "semanticSegment" : item === "nearby" ? "semanticNearby" : "semanticRoute")}</option>
        {/each}
      </select>
    </label>
    <label class="grid gap-1 text-xs text-muted-foreground">
      {t("semanticCity")}
      <input class="h-9 rounded-md border border-border bg-background px-2 text-sm" bind:value={city} data-testid="semantic-city" />
    </label>
    {#if mode === "place" || mode === "road" || mode === "intersection" || mode === "segment" || mode === "nearby"}
      <label class="grid gap-1 text-xs text-muted-foreground">
        {mode === "place" || (mode === "nearby" && !secondary) ? t("semanticName") : t("semanticRoadA")}
        <input class="h-9 rounded-md border border-border bg-background px-2 text-sm" bind:value={primary} data-testid="semantic-primary" />
      </label>
    {/if}
    {#if mode === "intersection" || mode === "nearby"}
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("semanticRoadB")}
        <input class="h-9 rounded-md border border-border bg-background px-2 text-sm" bind:value={secondary} />
      </label>
    {/if}
    {#if mode === "segment"}
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("semanticFrom")}
        <input class="h-9 rounded-md border border-border bg-background px-2 text-sm" bind:value={fromRoad} />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("semanticTo")}
        <input class="h-9 rounded-md border border-border bg-background px-2 text-sm" bind:value={toRoad} />
      </label>
    {/if}
    {#if mode === "route"}
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("semanticStart")}
        <input class="h-9 rounded-md border border-border bg-background px-2 text-sm" bind:value={fromRoad} />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("semanticEnd")}
        <input class="h-9 rounded-md border border-border bg-background px-2 text-sm" bind:value={toRoad} />
      </label>
    {/if}
    {#if mode === "nearby"}
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("semanticRadius")}
        <input class="h-9 rounded-md border border-border bg-background px-2 text-sm" bind:value={radius} inputmode="decimal" />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("semanticRange")}
        <select class="h-9 rounded-md border border-border bg-background px-2 text-sm" bind:value={nearbyMode}>
          <option value="radius">{t("semanticModeRadius")}</option>
          <option value="along-road">{t("semanticModeAlong")}</option>
        </select>
      </label>
    {/if}
    {#if mode === "place"}
      <label class="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" bind:checked={entrance} />
        {t("semanticEntrance")}
      </label>
    {/if}
    {#if outcome}
      <p class="text-xs text-muted-foreground" data-testid="semantic-message">{outcome.message}</p>
      {#if outcome.warnings.length > 0}
        <p class="text-xs text-amber-700">{outcome.warnings.join(" ")}</p>
      {/if}
      {#if outcome.candidates.length > 1}
        <div class="space-y-1">
          <p class="text-xs font-medium">{t("semanticCandidates")}</p>
          {#each outcome.candidates as candidate (candidate.id)}
            <button
              type="button"
              class="block w-full cursor-pointer rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
              data-testid="semantic-candidate"
              disabled={busy}
              onclick={() => chooseCandidate(candidate)}
            >
              {candidate.name}{candidate.area ? ` · ${candidate.area}` : ""} · {candidate.reason}
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
  {#snippet footer()}
    <Button size="sm" variant="ghost" onclick={() => (open = false)}>{t("cancel")}</Button>
    <Button size="sm" variant="outline" disabled={busy} data-testid="semantic-resolve" onclick={() => void search()}>
      {t("semanticSearch")}
    </Button>
    <Button size="sm" disabled={!outcome?.ok || busy} data-testid="semantic-apply" onclick={apply}>{t("semanticApply")}</Button>
  {/snippet}
</Dialog>
