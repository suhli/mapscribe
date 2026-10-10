import { describe, expect, it } from "vitest";
import { createLabelLayer, createRoadLayer } from "@mapscribe/core";
import { EditorStore } from "./store.js";
import { createMemoryStore, loadDraft, saveDraft } from "./persistence.js";

describe("EditorStore", () => {
  it("支持撤销、重做、复制和删除", () => {
    const store = new EditorStore();
    const road = createRoadLayer({
      name: "人民路",
      geometry: {
        type: "LineString",
        coordinates: [
          [104, 30],
          [104.01, 30.01],
          [104.02, 30.02],
        ],
      },
    });
    store.addLayer(road);
    store.updateLineStyle(road.id, { color: "#22c55e", width: 10 });
    expect(store.selectedLayer()?.type === "road-highlight" && store.getSnapshot().project.layers[0]).toBeTruthy();
    const styled = store.getSnapshot().project.layers[0];
    if (!styled || styled.type !== "road-highlight") throw new Error("missing road");
    expect(styled.style.color).toBe("#22c55e");
    store.undo();
    const undone = store.getSnapshot().project.layers[0];
    if (!undone || undone.type !== "road-highlight") throw new Error("missing road");
    expect(undone.style.color).toBe("#ef4444");
    store.redo();
    store.duplicateLayer(road.id);
    expect(store.getSnapshot().project.layers).toHaveLength(2);
    store.removeLayer(road.id);
    expect(store.getSnapshot().project.layers).toHaveLength(1);
    expect(store.getSnapshot().selection).not.toBe(road.id);
  });

  it("可以把草稿存入并读回", async () => {
    const store = new EditorStore();
    store.addLayer(createLabelLayer({ text: "示例地点", position: [104.08, 30.65] }));
    const memory = createMemoryStore();
    await saveDraft(memory, store.getSnapshot().project);
    const loaded = await loadDraft(memory);
    expect(loaded?.layers[0]?.type).toBe("label");
    if (loaded?.layers[0]?.type === "label") {
      expect(loaded.layers[0].text).toBe("示例地点");
    }
  });
});
