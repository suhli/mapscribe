<script lang="ts">
  import { onMount } from "svelte";
  import { geometryLines, insertVertex, moveVertex } from "@mapscribe/geo";
  import { isDrawnLine, type LngLat } from "@mapscribe/core";
  import { labelFont, measureLabel, placeLabels, type PlacedLabel } from "@mapscribe/renderer";
  import { editor, session } from "$lib/session.svelte";
  import { handleDrawFinish, handleMapClick } from "$lib/map/interactions";
  import { MapController } from "$lib/map/map-controller";

  let { onReady }: { onReady: (controller: MapController | null) => void } = $props();
  let container = $state<HTMLDivElement | null>(null);
  let controller = $state<MapController | null>(null);
  let placed = $state<PlacedLabel[]>([]);
  let handles = $state<Array<{ line: number; index: number; x: number; y: number; last: boolean }>>([]);
  let dragging: { id: string; origin: { x: number; y: number }; offset: { x: number; y: number } } | null = null;
  let overlayFrame = 0;

  const measureCanvas = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");

  onMount(() => {
    if (!container) return;
    const map = new MapController(container, editor.getSnapshot().project, {
      getTool: () => editor.getSnapshot().tool,
      onView: (view) => editor.setView(view),
      onClick: (position) => {
        if (controller) void handleMapClick(controller, position);
      },
      onDrawFinish: handleDrawFinish,
      onError: (message) => editor.setNotice(message),
    });
    controller = map;
    onReady(map);
    const refresh = () => scheduleOverlay();
    map.map.on("move", refresh);
    map.map.on("resize", refresh);
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
    return () => {
      if (overlayFrame) cancelAnimationFrame(overlayFrame);
      observer.disconnect();
      map.destroy();
      controller = null;
      onReady(null);
    };
  });

  $effect(() => {
    const project = session.snapshot.project;
    const selection = session.snapshot.selection;
    const preview =
      session.snapshot.route?.alternatives[session.snapshot.route.selectedIndex]?.geometry ??
      session.snapshot.linePreview ??
      session.snapshot.roadChoices?.[0]?.geometry ??
      null;
    controller?.sync(project, selection, preview);
    controller?.setDrawActive(session.snapshot.tool === "draw");
    layoutOverlay();
  });

  $effect(() => {
    const style = session.snapshot.project.map.style;
    const attribution = session.snapshot.project.map.attribution ?? [];
    void controller?.setBasemap(style, attribution).then(() => {
      const current = editor.getSnapshot();
      controller?.sync(
        current.project,
        current.selection,
        current.route?.alternatives[current.route.selectedIndex]?.geometry ?? current.linePreview ?? null,
      );
    });
  });

  function scheduleOverlay(): void {
    if (overlayFrame) return;
    overlayFrame = requestAnimationFrame(() => {
      overlayFrame = 0;
      layoutOverlay();
    });
  }

  function inView(point: { x: number; y: number }, width: number, height: number): boolean {
    return point.x >= -48 && point.y >= -48 && point.x <= width + 48 && point.y <= height + 48;
  }

  function layoutOverlay(): void {
    layoutLabels();
    const layer = selectedLine();
    if (!layer || !controller || !container) {
      handles = [];
      return;
    }
    const width = container.clientWidth;
    const height = container.clientHeight;
    const next: Array<{ line: number; index: number; x: number; y: number; last: boolean }> = [];
    for (const [lineIndex, line] of geometryLines(layer.geometry).entries()) {
      const projected = line.map((position) => controller?.project(position) ?? { x: 0, y: 0 });
      projected.forEach((point, index) => {
        const previous = projected[index - 1];
        const following = projected[index + 1];
        const nearSegment =
          (previous && inView({ x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 }, width, height)) ||
          (following && inView({ x: (point.x + following.x) / 2, y: (point.y + following.y) / 2 }, width, height));
        if (!inView(point, width, height) && !nearSegment) return;
        next.push({ line: lineIndex, index, x: point.x, y: point.y, last: index >= line.length - 1 });
      });
    }
    handles = next;
  }

  function layoutLabels(): void {
    if (!controller || !measureCanvas) return;
    const labels = session.snapshot.project.layers.flatMap((layer) => (layer.type === "label" ? [layer] : []));
    placed = placeLabels(
      labels,
      (position) => controller?.project(position) ?? { x: 0, y: 0 },
      (text, fontSize, icon) => measureLabel(measureCanvas, text, fontSize, icon),
    );
  }

  function startLabelDrag(event: PointerEvent, label: PlacedLabel): void {
    event.stopPropagation();
    event.preventDefault();
    editor.select(label.id);
    dragging = {
      id: label.id,
      origin: { x: event.clientX, y: event.clientY },
      offset: { ...label.layer.offset },
    };
    editor.updateLabelOffset(label.id, label.layer.offset, true);
    window.addEventListener("pointermove", moveLabel);
    window.addEventListener("pointerup", endLabelDrag);
  }

  function moveLabel(event: PointerEvent): void {
    if (!dragging) return;
    editor.updateLabelOffset(
      dragging.id,
      {
        x: dragging.offset.x + (event.clientX - dragging.origin.x),
        y: dragging.offset.y + (event.clientY - dragging.origin.y),
      },
      false,
    );
    layoutLabels();
  }

  function endLabelDrag(): void {
    dragging = null;
    window.removeEventListener("pointermove", moveLabel);
    window.removeEventListener("pointerup", endLabelDrag);
  }

  function selectedLine() {
    const layer = session.snapshot.project.layers.find((item) => item.id === session.snapshot.selection);
    if (!layer || !isDrawnLine(layer) || session.snapshot.tool !== "select") return null;
    return layer;
  }

  function startVertex(event: PointerEvent, line: number, index: number): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const layer = selectedLine();
    if (!layer || !controller) return;
    controller.setDragPan(false);
    editor.updateLineGeometry(layer.id, layer.geometry, true);
    const move = (pointer: PointerEvent) => {
      const current = selectedLine();
      if (!current || !container) return;
      const rect = container.getBoundingClientRect();
      const position = controller?.unproject({ x: pointer.clientX - rect.left, y: pointer.clientY - rect.top });
      if (!position) return;
      editor.updateLineGeometry(current.id, moveVertex(current.geometry, line, index, position), false);
    };
    const up = () => {
      controller?.setDragPan(true);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function removeVertex(event: MouseEvent, line: number, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    const layer = selectedLine();
    if (!layer) return;
    const lines = geometryLines(layer.geometry);
    const target = lines[line];
    if (!target || target.length <= 2) return;
    const next = {
      ...layer.geometry,
      coordinates:
        layer.geometry.type === "LineString"
          ? target.filter((_, vertex) => vertex !== index)
          : lines.map((item, itemIndex) => (itemIndex === line ? item.filter((_, vertex) => vertex !== index) : item)),
    } as typeof layer.geometry;
    editor.updateLineGeometry(layer.id, next, true);
  }

  function addMidpoint(line: number, index: number): void {
    const layer = selectedLine();
    if (!layer) return;
    const points = geometryLines(layer.geometry)[line];
    const start = points?.[index];
    const end = points?.[index + 1];
    if (!start || !end) return;
    const middle: LngLat = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    editor.updateLineGeometry(layer.id, insertVertex(layer.geometry, line, index, middle), true);
  }
</script>

<div class="absolute inset-0">
<div class="h-full w-full" bind:this={container} data-testid="map-canvas"></div>
<svg class="pointer-events-none absolute inset-0 z-10 overflow-visible">
  {#each placed as label (label.id)}
    {#if label.layer.leader.enabled}
      <line
        x1={label.anchor.x}
        y1={label.anchor.y}
        x2={label.box.x + label.box.width / 2}
        y2={label.box.y + label.box.height}
        stroke={label.layer.leader.color}
        stroke-width={label.layer.leader.width}
      />
    {/if}
  {/each}
</svg>
{#each placed as label (label.id)}
  <button
    type="button"
    class="absolute z-20 truncate border px-2 text-left shadow-sm"
    style:left="{label.box.x}px"
    style:top="{label.box.y}px"
    style:width="{label.box.width}px"
    style:height="{label.box.height}px"
    style:color={label.layer.style.color}
    style:background={label.layer.style.background}
    style:border-color={label.layer.style.borderColor}
    style:border-width="{label.layer.style.borderWidth}px"
    style:border-radius="{label.layer.style.borderRadius}px"
    style:opacity={label.layer.style.opacity}
    style:font={labelFont(label.layer.style.fontSize)}
    style:text-align={label.layer.style.align}
    class:ring-2={session.snapshot.selection === label.id}
    class:ring-primary={session.snapshot.selection === label.id}
    data-testid="map-label"
    onpointerdown={(event) => startLabelDrag(event, label)}
  >
    {label.text}
  </button>
{/each}
{#each handles as vertex (`${vertex.line}-${vertex.index}`)}
  <button
    type="button"
    class="absolute z-30 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow"
    style:left="{vertex.x}px"
    style:top="{vertex.y}px"
    aria-label="顶点"
    data-testid="vertex-handle"
    onpointerdown={(event) => startVertex(event, vertex.line, vertex.index)}
    oncontextmenu={(event) => removeVertex(event, vertex.line, vertex.index)}
  ></button>
{/each}
{#each handles as vertex (`mid-${vertex.line}-${vertex.index}`)}
  {#if !vertex.last}
    {@const next = handles.find((item) => item.line === vertex.line && item.index === vertex.index + 1)}
    {#if next}
      <button
        type="button"
        class="absolute z-30 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-1 ring-primary"
        style:left="{(vertex.x + next.x) / 2}px"
        style:top="{(vertex.y + next.y) / 2}px"
        aria-label="添加节点"
        onclick={() => addMidpoint(vertex.line, vertex.index)}
      ></button>
    {/if}
  {/if}
{/each}
</div>
