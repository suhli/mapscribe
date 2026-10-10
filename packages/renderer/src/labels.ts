import type { LabelLayer } from "@mapscribe/core";

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedLabel {
  id: string;
  text: string;
  anchor: ScreenPoint;
  box: LabelBox;
  layer: LabelLayer;
}

export interface MeasureText {
  (text: string, fontSize: number, icon: LabelLayer["icon"]): { width: number; height: number };
}

const SHIFTS: Array<[number, number]> = [
  [0, 0],
  [0, 22],
  [0, -22],
  [28, 0],
  [-28, 0],
  [24, 24],
  [-24, 24],
  [24, -24],
  [-24, -24],
  [0, 46],
  [0, -46],
];

function intersects(a: LabelBox, b: LabelBox, gap = 4): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

function placeBox(anchor: ScreenPoint, size: { width: number; height: number }, layer: LabelLayer, shift: [number, number]): LabelBox {
  const padX = 10;
  const padY = 6;
  const width = size.width + padX * 2;
  const height = size.height + padY * 2;
  let x = anchor.x + layer.offset.x + shift[0];
  let y = anchor.y + layer.offset.y + shift[1];
  if (layer.style.anchor === "center" || layer.style.anchor === "top" || layer.style.anchor === "bottom") {
    x -= width / 2;
  } else if (layer.style.anchor === "right") {
    x -= width;
  }
  if (layer.style.anchor === "center" || layer.style.anchor === "left" || layer.style.anchor === "right") {
    y -= height / 2;
  } else if (layer.style.anchor === "bottom") {
    y -= height;
  }
  if (layer.style.anchor === "bottom") y -= 8;
  if (layer.style.anchor === "top") y += 8;
  return { x, y, width, height };
}

/**
 * 放置标签并做简单避让。
 * placement 为 manual 时保留用户偏移，不再自动挪动。
 */
export function placeLabels(
  labels: LabelLayer[],
  project: (position: LabelLayer["position"]) => ScreenPoint,
  measure: MeasureText,
): PlacedLabel[] {
  const visible = labels.filter((label) => label.visible).slice().sort((a, b) => a.zIndex - b.zIndex);
  const placed: PlacedLabel[] = [];
  for (const layer of visible) {
    const anchor = project(layer.position);
    const size = measure(layer.text, layer.style.fontSize, layer.icon);
    const shifts = layer.placement === "manual" ? ([[0, 0]] as Array<[number, number]>) : SHIFTS;
    let box = placeBox(anchor, size, layer, shifts[0] ?? [0, 0]);
    if (layer.placement !== "manual") {
      for (const shift of shifts) {
        const candidate = placeBox(anchor, size, layer, shift);
        if (!placed.some((item) => intersects(item.box, candidate))) {
          box = candidate;
          break;
        }
      }
    }
    placed.push({ id: layer.id, text: layer.text, anchor, box, layer });
  }
  return placed;
}

export function leaderTarget(anchor: ScreenPoint, box: LabelBox): ScreenPoint {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = anchor.x - cx;
  const dy = anchor.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = Math.max(Math.abs(dx) / (box.width / 2), Math.abs(dy) / (box.height / 2));
  return { x: cx + dx / scale, y: cy + dy / scale };
}
