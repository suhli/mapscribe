import type { LabelLayer } from "@mapscribe/core";
import { leaderTarget, type LabelBox, type PlacedLabel } from "./labels.js";

export function labelFont(fontSize: number): string {
  return `600 ${fontSize}px "Noto Sans SC", "Noto Sans CJK SC", sans-serif`;
}

export function measureLabel(
  context: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  icon: LabelLayer["icon"],
): { width: number; height: number } {
  context.font = labelFont(fontSize);
  const textWidth = context.measureText(text).width;
  const iconWidth = icon === "none" ? 0 : fontSize + 6;
  return { width: textWidth + iconWidth, height: fontSize * 1.25 };
}

/** 把标签、引导线和署名画到与地图画布相同的位图上。 */
export function paintAnnotations(
  context: CanvasRenderingContext2D,
  labels: PlacedLabel[],
  attribution: string[],
  pixelRatio: number,
): { labelInkPixels: number } {
  context.save();
  context.scale(pixelRatio, pixelRatio);
  for (const label of labels) {
    paintLeader(context, label);
    paintLabel(context, label);
  }
  paintAttribution(context, attribution, context.canvas.width / pixelRatio, context.canvas.height / pixelRatio);
  context.restore();
  const labelInkPixels = labels.reduce((sum, label) => sum + countInk(context, label.box, pixelRatio), 0);
  return { labelInkPixels };
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function paintLeader(context: CanvasRenderingContext2D, label: PlacedLabel): void {
  if (!label.layer.leader.enabled) return;
  const target = leaderTarget(label.anchor, label.box);
  context.save();
  context.strokeStyle = label.layer.leader.color;
  context.lineWidth = label.layer.leader.width;
  context.beginPath();
  context.moveTo(label.anchor.x, label.anchor.y);
  context.lineTo(target.x, target.y);
  context.stroke();
  context.restore();
}

function paintLabel(context: CanvasRenderingContext2D, label: PlacedLabel): void {
  const { box, layer } = label;
  context.save();
  context.globalAlpha = layer.style.opacity;
  roundRect(context, box.x, box.y, box.width, box.height, layer.style.borderRadius);
  context.fillStyle = layer.style.background;
  context.fill();
  if (layer.style.borderWidth > 0) {
    context.lineWidth = layer.style.borderWidth;
    context.strokeStyle = layer.style.borderColor;
    context.stroke();
  }
  context.fillStyle = layer.style.color;
  context.font = labelFont(layer.style.fontSize);
  context.textBaseline = "middle";
  context.textAlign = layer.style.align === "left" ? "left" : layer.style.align === "right" ? "right" : "center";
  const iconGap = layer.icon === "none" ? 0 : layer.style.fontSize + 6;
  const textX =
    layer.style.align === "left"
      ? box.x + 10 + iconGap
      : layer.style.align === "right"
        ? box.x + box.width - 10
        : box.x + box.width / 2 + iconGap / 2;
  context.fillText(label.text, textX, box.y + box.height / 2);
  if (layer.icon !== "none") {
    paintIcon(context, layer.icon, box.x + 12, box.y + box.height / 2, layer.style.fontSize * 0.72, layer.style.color);
  }
  context.restore();
}

function paintIcon(
  context: CanvasRenderingContext2D,
  icon: LabelLayer["icon"],
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  context.save();
  context.translate(x, y);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1.5;
  if (icon === "pin") {
    context.beginPath();
    context.arc(0, -size * 0.15, size * 0.38, Math.PI * 0.15, Math.PI * 0.85, true);
    context.lineTo(0, size * 0.55);
    context.closePath();
    context.stroke();
  } else if (icon === "star") {
    context.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const px = Math.cos(angle) * size * 0.45;
      const py = Math.sin(angle) * size * 0.45;
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.stroke();
  } else if (icon === "flag") {
    context.beginPath();
    context.moveTo(-size * 0.15, size * 0.5);
    context.lineTo(-size * 0.15, -size * 0.5);
    context.lineTo(size * 0.45, -size * 0.2);
    context.lineTo(-size * 0.15, 0);
    context.stroke();
  } else if (icon === "info") {
    context.beginPath();
    context.arc(0, 0, size * 0.42, 0, Math.PI * 2);
    context.stroke();
    context.fillRect(-0.7, -size * 0.05, 1.4, size * 0.28);
    context.beginPath();
    context.arc(0, -size * 0.18, 1.1, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function countInk(context: CanvasRenderingContext2D, box: LabelBox, pixelRatio: number): number {
  const x = Math.max(0, Math.floor(box.x * pixelRatio));
  const y = Math.max(0, Math.floor(box.y * pixelRatio));
  const width = Math.max(1, Math.floor(box.width * pixelRatio));
  const height = Math.max(1, Math.floor(box.height * pixelRatio));
  const canvas = context.canvas;
  if (x >= canvas.width || y >= canvas.height) return 0;
  const image = context.getImageData(
    x,
    y,
    Math.min(width, canvas.width - x),
    Math.min(height, canvas.height - y),
  );
  let ink = 0;
  for (let index = 0; index < image.data.length; index += 16) {
    const red = image.data[index] ?? 0;
    const green = image.data[index + 1] ?? 0;
    const blue = image.data[index + 2] ?? 0;
    if (red < 80 && green < 80 && blue < 80) ink += 1;
  }
  return ink;
}

export function paintAttribution(
  context: CanvasRenderingContext2D,
  lines: string[],
  width: number,
  height: number,
): void {
  if (lines.length === 0) return;
  context.save();
  context.font = '12px "Noto Sans SC", sans-serif';
  context.textAlign = "left";
  context.textBaseline = "middle";
  const text = lines.join("  ·  ");
  const textWidth = context.measureText(text).width;
  const boxWidth = textWidth + 16;
  const boxHeight = 22;
  const x = 8;
  const y = height - boxHeight - 8;
  roundRect(context, x, y, boxWidth, boxHeight, 6);
  context.fillStyle = "rgba(255,255,255,0.88)";
  context.fill();
  context.fillStyle = "#334155";
  context.fillText(text, x + 8, y + boxHeight / 2);
  context.restore();
}
