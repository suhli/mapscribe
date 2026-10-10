import {
  createEmptyProject,
  createId,
  isLineLayer,
  touchProject,
  type LabelLayer,
  type Layer,
  type LineGeometry,
  type LineStyle,
  type LngLat,
  type MapProject,
  type MapStyle,
  type OutputOptions,
} from "@mapscribe/core";

export type Tool = "select" | "road" | "route" | "draw" | "label";

/** 项目数据都是 JSON，用序列化复制可避开界面状态代理导致的 structuredClone 失败。 */
function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface RoadChoice {
  id: string;
  name: string;
  detail: string;
  geometry: LineGeometry;
  provider: string;
  featureId?: string;
}

export interface RouteChoice {
  geometry: Extract<LineGeometry, { type: "LineString" }>;
  summary: string;
}

export interface RouteDraft {
  start: LngLat;
  end: LngLat;
  alternatives: RouteChoice[];
  selectedIndex: number;
}

interface HistoryState {
  layers: Layer[];
  style: MapStyle;
  output: OutputOptions;
  selection: string | null;
}

export interface EditorSnapshot {
  project: MapProject;
  selection: string | null;
  tool: Tool;
  canUndo: boolean;
  canRedo: boolean;
  route: RouteDraft | null;
  roadChoices: RoadChoice[] | null;
  notice: string | null;
  busy: boolean;
  saved: boolean;
  pointer: LngLat | null;
}

function reindex(layers: Layer[]): Layer[] {
  return layers.map((layer, index) => ({ ...layer, zIndex: index }));
}

/**
 * 编辑器状态。撤销只记录图层、样式和导出参数，平移地图不会写入历史。
 */
export class EditorStore {
  private project: MapProject;
  private past: HistoryState[] = [];
  private future: HistoryState[] = [];
  private listeners = new Set<() => void>();
  private selection: string | null = null;
  private tool: Tool = "select";
  private route: RouteDraft | null = null;
  private roadChoices: RoadChoice[] | null = null;
  private notice: string | null = null;
  private busy = false;
  private saved = true;
  private pointer: LngLat | null = null;

  constructor(project = createEmptyProject()) {
    this.project = project;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): EditorSnapshot {
    return {
      project: this.project,
      selection: this.selection,
      tool: this.tool,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      route: this.route,
      roadChoices: this.roadChoices,
      notice: this.notice,
      busy: this.busy,
      saved: this.saved,
      pointer: this.pointer,
    };
  }

  selectedLayer(): Layer | null {
    return this.project.layers.find((layer) => layer.id === this.selection) ?? null;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private capture(): HistoryState {
    return {
      layers: jsonClone(this.project.layers),
      style: jsonClone(this.project.map.style),
      output: jsonClone(this.project.output),
      selection: this.selection,
    };
  }

  private pushHistory(): void {
    this.past.push(this.capture());
    if (this.past.length > 100) this.past.shift();
    this.future = [];
  }

  private apply(state: HistoryState): void {
    this.project = touchProject({
      ...this.project,
      layers: state.layers,
      map: { ...this.project.map, style: state.style },
      output: state.output,
    });
    this.selection = state.selection;
  }

  private commit(mutator: (project: MapProject) => MapProject): void {
    this.pushHistory();
    this.project = touchProject(mutator(this.project));
    this.saved = false;
    this.emit();
  }

  markSaved(): void {
    this.saved = true;
    this.emit();
  }

  setNotice(notice: string | null): void {
    this.notice = notice;
    this.emit();
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.emit();
  }

  setPointer(pointer: LngLat | null): void {
    this.pointer = pointer;
    this.emit();
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    if (tool !== "route") this.route = null;
    if (tool !== "road") this.roadChoices = null;
    this.emit();
  }

  setView(partial: Partial<Pick<MapProject["map"], "center" | "zoom" | "bearing" | "pitch">>): void {
    this.project = { ...this.project, map: { ...this.project.map, ...partial } };
    this.saved = false;
    this.emit();
  }

  setStyle(style: MapStyle): void {
    this.commit((project) => ({ ...project, map: { ...project.map, style } }));
  }

  setOutput(output: OutputOptions): void {
    this.commit((project) => ({ ...project, output }));
  }

  setProjectName(name: string): void {
    this.commit((project) => ({ ...project, meta: { ...project.meta, name } }));
  }

  replace(project: MapProject, options?: { record?: boolean }): void {
    if (options?.record) this.pushHistory();
    else {
      this.past = [];
      this.future = [];
    }
    this.project = project;
    this.selection = null;
    this.route = null;
    this.roadChoices = null;
    this.saved = !options?.record;
    this.emit();
  }

  undo(): void {
    if (this.past.length === 0) return;
    const current = this.capture();
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(current);
    this.apply(previous);
    this.saved = false;
    this.emit();
  }

  redo(): void {
    if (this.future.length === 0) return;
    const current = this.capture();
    const next = this.future.pop();
    if (!next) return;
    this.past.push(current);
    this.apply(next);
    this.saved = false;
    this.emit();
  }

  addLayer(layer: Layer): void {
    this.commit((project) => ({ ...project, layers: reindex([...project.layers, layer]) }));
    this.selection = layer.id;
    this.emit();
  }

  updateLayer(id: string, updater: (layer: Layer) => Layer): void {
    this.commit((project) => ({
      ...project,
      layers: project.layers.map((layer) => (layer.id === id ? updater(layer) : layer)),
    }));
  }

  updateLineStyle(id: string, patch: Partial<LineStyle>): void {
    this.updateLayer(id, (layer) => {
      if (!isLineLayer(layer)) return layer;
      return { ...layer, style: { ...layer.style, ...patch } };
    });
  }

  updateLineGeometry(id: string, geometry: LineGeometry, record = true): void {
    const apply = (project: MapProject): MapProject => ({
      ...project,
      layers: project.layers.map((layer) => (layer.id === id && isLineLayer(layer) ? { ...layer, geometry } : layer)),
    });
    if (record) this.commit(apply);
    else {
      this.project = touchProject(apply(this.project));
      this.saved = false;
      this.emit();
    }
  }

  updateLabel(id: string, patch: Partial<LabelLayer>): void {
    this.updateLayer(id, (layer) => (layer.type === "label" ? { ...layer, ...patch, id: layer.id, type: "label" } : layer));
  }

  updateLabelOffset(id: string, offset: { x: number; y: number }, record: boolean): void {
    const apply = (project: MapProject): MapProject => ({
      ...project,
      layers: project.layers.map((layer) =>
        layer.id === id && layer.type === "label" ? { ...layer, offset, placement: "manual" as const } : layer,
      ),
    });
    if (record) this.commit(apply);
    else {
      this.project = touchProject(apply(this.project));
      this.saved = false;
      this.emit();
    }
  }

  removeLayer(id: string): void {
    this.commit((project) => ({ ...project, layers: reindex(project.layers.filter((layer) => layer.id !== id)) }));
    if (this.selection === id) this.selection = null;
    this.emit();
  }

  duplicateLayer(id: string): void {
    const source = this.project.layers.find((layer) => layer.id === id);
    if (!source) return;
    const copy = jsonClone(source);
    copy.id = createId(source.type === "label" ? "label" : source.type === "freehand" ? "draw" : "road");
    copy.name = `${source.name} 副本`;
    copy.zIndex = source.zIndex + 1;
    if (copy.type === "label") {
      copy.position = [copy.position[0] + 0.0008, copy.position[1] + 0.0008];
      copy.placement = "manual";
    }
    const index = this.project.layers.findIndex((layer) => layer.id === id);
    this.commit((project) => {
      const layers = project.layers.slice();
      layers.splice(index + 1, 0, copy);
      return { ...project, layers: reindex(layers) };
    });
    this.selection = copy.id;
    this.emit();
  }

  moveLayer(id: string, direction: -1 | 1): void {
    const index = this.project.layers.findIndex((layer) => layer.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= this.project.layers.length) return;
    this.commit((project) => {
      const layers = project.layers.slice();
      const current = layers[index];
      const neighbor = layers[target];
      if (!current || !neighbor) return project;
      layers[index] = neighbor;
      layers[target] = current;
      return { ...project, layers: reindex(layers) };
    });
  }

  setVisibility(id: string, visible: boolean): void {
    this.updateLayer(id, (layer) => ({ ...layer, visible }));
  }

  rename(id: string, name: string): void {
    this.updateLayer(id, (layer) => ({ ...layer, name }));
  }

  select(id: string | null): void {
    this.selection = id;
    this.emit();
  }

  setRoadChoices(choices: RoadChoice[] | null): void {
    this.roadChoices = choices;
    this.emit();
  }

  setRouteDraft(route: RouteDraft | null): void {
    this.route = route;
    this.emit();
  }

  selectRoute(index: number): void {
    if (!this.route) return;
    this.route = { ...this.route, selectedIndex: index };
    this.emit();
  }
}
