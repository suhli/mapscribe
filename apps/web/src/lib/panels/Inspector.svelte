<script lang="ts">
  import { isLineLayer } from "@mapscribe/core";
  import type { ResolutionCandidate } from "@mapscribe/geo";
  import { reresolveLayer } from "$lib/map/semantic";
  import { t } from "$lib/preferences.svelte";
  import { editor, session } from "$lib/session.svelte";
  import Button from "$lib/components/ui/button.svelte";

  const layer = $derived(session.snapshot.project.layers.find((item) => item.id === session.snapshot.selection) ?? null);
  let resolveMessage = $state("");
  let resolveCandidates = $state<ResolutionCandidate[]>([]);

  async function rerun(candidateId?: string): Promise<void> {
    if (!layer || !("sourceQuery" in layer) || !layer.sourceQuery) return;
    editor.setBusy(true);
    try {
      const outcome = await reresolveLayer(session.snapshot.project, layer, candidateId);
      resolveMessage = [outcome.message, ...outcome.warnings].filter(Boolean).join(" ");
      resolveCandidates = outcome.ok ? [] : outcome.candidates;
      if (outcome.ok && outcome.layer) editor.replaceLayer(layer.id, outcome.layer);
    } finally {
      editor.setBusy(false);
    }
  }
</script>

<aside class="flex h-full flex-col bg-card">
  <div class="border-b border-border px-3 py-2">
    <h2 class="text-sm font-semibold">{t("properties")}</h2>
  </div>
  <div class="min-h-0 flex-1 space-y-3 overflow-auto p-3 text-sm">
    <label class="grid gap-1 text-xs text-muted-foreground">
      {t("projectName")}
      <input
        class="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
        value={session.snapshot.project.meta.name}
        onchange={(event) => editor.setProjectName(event.currentTarget.value)}
      />
    </label>
    {#if layer && "sourceQuery" in layer && layer.sourceQuery}
      <div class="space-y-2 rounded-md border border-border p-2 text-xs text-muted-foreground">
        <p>{t("semanticStatus")}: {layer.resolution?.status ?? layer.sourceQuery.type}</p>
        {#if layer.resolution?.provider}
          <p>{t("source")}: {layer.resolution.provider}{layer.resolution.resolvedAt ? ` / ${layer.resolution.resolvedAt}` : ""}</p>
        {/if}
        {#if layer.resolution?.precision}
          <p>{layer.resolution.precision}</p>
        {/if}
        {#if layer.resolution?.warnings?.length}
          <p>{layer.resolution.warnings.join(" ")}</p>
        {/if}
        {#if resolveMessage}
          <p data-testid="resolve-message">{resolveMessage}</p>
        {/if}
        {#each resolveCandidates as candidate (candidate.id)}
          <button type="button" class="block w-full rounded px-1 py-1 text-left hover:bg-accent" onclick={() => void rerun(candidate.id)}>
            {candidate.name} · {candidate.reason}
          </button>
        {/each}
        <Button size="sm" variant="outline" data-testid="reresolve" onclick={() => void rerun()}>{t("semanticReresolve")}</Button>
      </div>
    {/if}
    {#if layer && isLineLayer(layer)}
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("rename")}
        <input
          class="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          value={layer.name}
          onchange={(event) => editor.rename(layer.id, event.currentTarget.value)}
        />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("color")}
        <input
          type="color"
          value={layer.style.color}
          oninput={(event) => editor.updateLineStyle(layer.id, { color: event.currentTarget.value })}
          data-testid="road-color"
        />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("width")} {layer.style.width}
        <input
          type="range"
          min="1"
          max="32"
          step="0.5"
          value={layer.style.width}
          oninput={(event) => editor.updateLineStyle(layer.id, { width: Number(event.currentTarget.value) })}
          data-testid="road-width"
        />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("opacity")} {layer.style.opacity}
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={layer.style.opacity}
          oninput={(event) => editor.updateLineStyle(layer.id, { opacity: Number(event.currentTarget.value) })}
        />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("dash")}
        <select
          class="h-9 rounded-md border border-border bg-background px-2"
          value={layer.style.dash}
          onchange={(event) => editor.updateLineStyle(layer.id, { dash: event.currentTarget.value as "solid" | "dashed" })}
        >
          <option value="solid">{t("solid")}</option>
          <option value="dashed">{t("dashed")}</option>
        </select>
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("cap")}
        <select
          class="h-9 rounded-md border border-border bg-background px-2"
          value={layer.style.lineCap}
          onchange={(event) =>
            editor.updateLineStyle(layer.id, { lineCap: event.currentTarget.value as "butt" | "round" | "square" })}
        >
          <option value="butt">butt</option>
          <option value="round">round</option>
          <option value="square">square</option>
        </select>
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("join")}
        <select
          class="h-9 rounded-md border border-border bg-background px-2"
          value={layer.style.lineJoin}
          onchange={(event) =>
            editor.updateLineStyle(layer.id, { lineJoin: event.currentTarget.value as "miter" | "round" | "bevel" })}
        >
          <option value="miter">miter</option>
          <option value="round">round</option>
          <option value="bevel">bevel</option>
        </select>
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("outline")}
        <input type="color" value={layer.style.outlineColor} oninput={(event) => editor.updateLineStyle(layer.id, { outlineColor: event.currentTarget.value })} />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("outlineWidth")} {layer.style.outlineWidth}
        <input
          type="range"
          min="0"
          max="16"
          step="0.5"
          value={layer.style.outlineWidth}
          oninput={(event) => editor.updateLineStyle(layer.id, { outlineWidth: Number(event.currentTarget.value) })}
        />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("widthMode")}
        <select
          class="h-9 rounded-md border border-border bg-background px-2"
          value={layer.style.widthMode}
          onchange={(event) => editor.updateLineStyle(layer.id, { widthMode: event.currentTarget.value as "screen" | "zoom" })}
        >
          <option value="zoom">{t("zoom")}</option>
          <option value="screen">{t("screen")}</option>
        </select>
      </label>
      {#if layer.source}
        <p class="text-xs text-muted-foreground">{t("source")}: {layer.source.kind}{layer.source.provider ? ` / ${layer.source.provider}` : ""}{layer.source.featureId ? ` / ${layer.source.featureId}` : ""}</p>
      {/if}
    {:else if layer && layer.type === "label"}
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("text")}
        <textarea
          class="min-h-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
          value={layer.text}
          data-testid="label-text"
          onchange={(event) => editor.updateLabel(layer.id, { text: event.currentTarget.value, name: event.currentTarget.value.slice(0, 40) })}
        ></textarea>
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("fontSize")} {layer.style.fontSize}
        <input type="range" min="10" max="64" value={layer.style.fontSize} oninput={(event) => editor.updateLabel(layer.id, { style: { ...layer.style, fontSize: Number(event.currentTarget.value) } })} />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("color")}
        <input type="color" value={layer.style.color} oninput={(event) => editor.updateLabel(layer.id, { style: { ...layer.style, color: event.currentTarget.value } })} />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("background")}
        <input type="color" value={layer.style.background} oninput={(event) => editor.updateLabel(layer.id, { style: { ...layer.style, background: event.currentTarget.value } })} />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("border")}
        <input type="color" value={layer.style.borderColor} oninput={(event) => editor.updateLabel(layer.id, { style: { ...layer.style, borderColor: event.currentTarget.value } })} />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("radius")} {layer.style.borderRadius}
        <input type="range" min="0" max="28" value={layer.style.borderRadius} oninput={(event) => editor.updateLabel(layer.id, { style: { ...layer.style, borderRadius: Number(event.currentTarget.value) } })} />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("opacity")} {layer.style.opacity}
        <input type="range" min="0.2" max="1" step="0.05" value={layer.style.opacity} oninput={(event) => editor.updateLabel(layer.id, { style: { ...layer.style, opacity: Number(event.currentTarget.value) } })} />
      </label>
      <label class="flex items-center justify-between text-xs text-muted-foreground">
        {t("leader")}
        <input type="checkbox" checked={layer.leader.enabled} onchange={(event) => editor.updateLabel(layer.id, { leader: { ...layer.leader, enabled: event.currentTarget.checked } })} />
      </label>
      <label class="grid gap-1 text-xs text-muted-foreground">
        {t("icon")}
        <select class="h-9 rounded-md border border-border bg-background px-2" value={layer.icon} onchange={(event) => editor.updateLabel(layer.id, { icon: event.currentTarget.value as typeof layer.icon })}>
          <option value="pin">{t("pin")}</option>
          <option value="star">{t("star")}</option>
          <option value="flag">{t("flag")}</option>
          <option value="info">{t("info")}</option>
          <option value="none">{t("none")}</option>
        </select>
      </label>
      <p class="text-xs text-muted-foreground">{layer.placement === "manual" ? "manual" : "auto"}</p>
    {:else}
      <p class="text-sm text-muted-foreground">{t("selectHint")}</p>
    {/if}
  </div>
</aside>
