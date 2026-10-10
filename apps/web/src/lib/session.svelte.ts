import { createEmptyProject, type BuiltinStyleName, type MapStyle } from "@mapscribe/core";
import { EditorStore } from "@mapscribe/editor";

function initialProject() {
  const project = createEmptyProject();
  if (typeof location === "undefined") return project;
  const basemap = new URLSearchParams(location.search).get("basemap");
  const allowed: BuiltinStyleName[] = ["light", "positron", "bright", "liberty", "dark", "fiord", "blank"];
  if (basemap && allowed.includes(basemap as BuiltinStyleName)) {
    project.map.style = basemap as MapStyle;
  }
  return project;
}

export const editor = new EditorStore(initialProject());

class SessionBridge {
  snapshot = $state(editor.getSnapshot());

  constructor() {
    editor.subscribe(() => {
      const snapshot = editor.getSnapshot();
      this.snapshot = {
        ...snapshot,
        project: JSON.parse(JSON.stringify(snapshot.project)),
        route: snapshot.route ? JSON.parse(JSON.stringify(snapshot.route)) : null,
        roadChoices: snapshot.roadChoices ? JSON.parse(JSON.stringify(snapshot.roadChoices)) : null,
        linePreview: snapshot.linePreview ? JSON.parse(JSON.stringify(snapshot.linePreview)) : null,
      };
    });
  }
}

export const session = new SessionBridge();

export function freshStartRequested(): boolean {
  if (typeof location === "undefined") return false;
  return new URLSearchParams(location.search).get("fresh") === "1";
}
