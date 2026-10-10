import {
  createFreehandLayer,
  createLabelLayer,
  createRoadLayer,
  type LngLat,
} from "@mapscribe/core";
import { NominatimGeocoder, OsrmRoutingProvider, OverpassRoadProvider, parseCoordinateQuery, RoutingError, type RoadWay } from "@mapscribe/geo";
import { editor } from "../session.svelte";
import { resetSemanticResolver } from "./semantic";
import { loadSettings } from "../settings";
import { t } from "../preferences.svelte";
import type { MapController, RenderedRoad } from "./map-controller";

let geocoder: NominatimGeocoder | null = null;
let roads: OverpassRoadProvider | null = null;
let routing: OsrmRoutingProvider | null = null;
let routeStart: LngLat | null = null;

export function resetProviders(): void {
  geocoder = null;
  roads = null;
  routing = null;
  resetSemanticResolver();
}

function services() {
  const settings = loadSettings();
  geocoder ??= new NominatimGeocoder({
    endpoint: settings.geocodingEndpoint,
    timeoutMs: settings.geocodingTimeoutMs,
    minIntervalMs: settings.geocodingIntervalMs,
  });
  roads ??= new OverpassRoadProvider({
    endpoint: settings.roadsEndpoint,
    timeoutMs: settings.roadsTimeoutMs,
    minIntervalMs: settings.roadsIntervalMs,
  });
  routing ??= new OsrmRoutingProvider({
    endpoint: settings.routingEndpoint,
    timeoutMs: settings.routingTimeoutMs,
    minIntervalMs: settings.routingIntervalMs,
  });
  return { geocoder, roads, routing };
}

export async function handleMapClick(controller: MapController, position: LngLat): Promise<void> {
  const tool = editor.getSnapshot().tool;
  if (tool === "label") {
    editor.addLayer(createLabelLayer({ text: t("newLabel"), position }));
    editor.setTool("select");
    return;
  }
  if (tool === "select") {
    editor.select(controller.queryOwnLayer(position));
    return;
  }
  if (tool === "road") {
    await pickRoad(controller, position);
    return;
  }
  if (tool === "route") {
    await pickRoute(position);
  }
}

export function handleDrawFinish(coordinates: LngLat[]): void {
  const zoom = editor.getSnapshot().project.map.zoom;
  editor.addLayer(
    createFreehandLayer({
      geometry: { type: "LineString", coordinates },
      referenceZoom: zoom,
    }),
  );
  editor.setTool("select");
}

async function pickRoad(controller: MapController, position: LngLat): Promise<void> {
  editor.setBusy(true);
  editor.setNotice(t("roadLoading"));
  const rendered = controller.queryRenderedRoads(position);
  try {
    const ways = await services().roads.waysNear(position);
    const choices = ways.length > 0 ? ways.map(wayToChoice) : rendered.map(renderedToChoice);
    if (choices.length === 0) {
      editor.setNotice(t("roadMiss"));
      editor.setRoadChoices(null);
      return;
    }
    if (ways.length === 0) editor.setNotice(t("roadFallback"));
    else editor.setNotice(null);
    if (choices.length === 1) {
      const only = choices[0];
      if (only) commitRoad(only.geometry, only.name, only.detail, only.featureId, ways.length > 0);
      return;
    }
    editor.setRoadChoices(
      choices.map((choice) => ({
        id: choice.featureId ?? choice.name,
        name: choice.name,
        detail: choice.detail,
        geometry: choice.geometry,
        provider: ways.length > 0 ? "overpass" : "basemap",
        ...(choice.featureId ? { featureId: choice.featureId } : {}),
      })),
    );
  } catch (error) {
    if (rendered.length > 0) {
      editor.setNotice(t("roadFallback"));
      const first = rendered[0];
      if (first) commitRoad(first.geometry, first.name ?? "未命名道路", first.detail ?? "basemap", undefined, false);
      return;
    }
    editor.setNotice(error instanceof Error ? error.message : t("roadMiss"));
  } finally {
    editor.setBusy(false);
  }
}

function commitRoad(
  geometry: RoadWay["geometry"],
  name: string,
  detail: string,
  featureId: string | undefined,
  fromProvider: boolean,
): void {
  editor.addLayer(
    createRoadLayer({
      name,
      geometry,
      referenceZoom: editor.getSnapshot().project.map.zoom,
      source: {
        kind: "road",
        provider: fromProvider ? "overpass" : "basemap",
        ...(featureId ? { featureId } : {}),
        name,
        fetchedAt: new Date().toISOString(),
        query: { detail },
      },
    }),
  );
  editor.setRoadChoices(null);
  editor.setTool("select");
}

export function acceptRoad(id: string): void {
  const choice = editor.getSnapshot().roadChoices?.find((item) => item.id === id);
  if (!choice) return;
  commitRoad(choice.geometry, choice.name, choice.detail, choice.featureId, choice.provider === "overpass");
}

async function pickRoute(position: LngLat): Promise<void> {
  if (!routeStart) {
    routeStart = position;
    editor.setNotice(t("routeStart"));
    return;
  }
  const start = routeStart;
  routeStart = null;
  editor.setBusy(true);
  editor.setNotice(t("routeLoading"));
  try {
    const alternatives = await services().routing.route(start, position);
    editor.setRouteDraft({
      start,
      end: position,
      selectedIndex: 0,
      alternatives: alternatives.map((item) => ({ geometry: item.geometry, summary: item.summary })),
    });
    editor.setNotice(null);
  } catch (error) {
    editor.setRouteDraft(null);
    editor.setNotice(error instanceof RoutingError ? t("routeFail") : error instanceof Error ? error.message : t("routeFail"));
  } finally {
    editor.setBusy(false);
  }
}

export function confirmRoute(): void {
  const draft = editor.getSnapshot().route;
  const selected = draft?.alternatives[draft.selectedIndex];
  if (!draft || !selected) return;
  editor.addLayer(
    createRoadLayer({
      name: selected.summary,
      geometry: selected.geometry,
      referenceZoom: editor.getSnapshot().project.map.zoom,
      source: {
        kind: "route",
        provider: "osrm",
        fetchedAt: new Date().toISOString(),
        query: { start: draft.start, end: draft.end },
      },
    }),
  );
  editor.setRouteDraft(null);
  editor.setTool("select");
}

export function cancelRoute(): void {
  routeStart = null;
  editor.setRouteDraft(null);
  editor.setNotice(null);
}

export async function searchPlace(query: string): Promise<Array<{ label: string; position: LngLat; bounds?: [number, number, number, number] }>> {
  const coordinate = parseCoordinateQuery(query);
  if (coordinate) return [{ label: query, position: coordinate }];
  return services().geocoder.search(query);
}

interface RoadCandidate {
  name: string;
  detail: string;
  geometry: RoadWay["geometry"];
  featureId?: string;
}

function wayToChoice(way: RoadWay): RoadCandidate {
  return {
    name: way.name ?? way.highway ?? "未命名道路",
    detail: way.highway ?? "highway",
    geometry: way.geometry,
    featureId: way.id,
  };
}

function renderedToChoice(road: RenderedRoad): RoadCandidate {
  return {
    name: road.name ?? road.detail ?? "未命名道路",
    detail: road.detail ?? "basemap",
    geometry: road.geometry,
  };
}
