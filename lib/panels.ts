import { DOMAIN } from "./grid";
import { encodeRgbaPng } from "./png";
import type { SensorGrid } from "./sensor-grid";

export const PANEL_WIDTH = 640;
export const PANEL_HEIGHT = 428;

export type PanelName = "obs" | "model" | "flow" | "persist";

type Rgba = [number, number, number, number];

const IR_BINS: { max: number; rgb: [number, number, number] }[] = [
  { max: 220, rgb: [59, 29, 74] },
  { max: 230, rgb: [107, 42, 107] },
  { max: 240, rgb: [159, 45, 45] },
  { max: 250, rgb: [196, 107, 47] },
  { max: 260, rgb: [210, 162, 74] },
  { max: 280, rgb: [138, 160, 180] },
];

function xy(lon: number, lat: number): { x: number; y: number } {
  return {
    x: ((lon - DOMAIN.west) / (DOMAIN.east - DOMAIN.west)) * (PANEL_WIDTH - 1),
    y: ((DOMAIN.north - lat) / (DOMAIN.north - DOMAIN.south)) * (PANEL_HEIGHT - 1),
  };
}

function blend(rgba: Uint8Array, x: number, y: number, color: Rgba): void {
  const offset = (y * PANEL_WIDTH + x) * 4;
  const alpha = color[3] / 255;
  const keep = 1 - alpha;
  rgba[offset] = Math.round(color[0] * alpha + rgba[offset] * keep);
  rgba[offset + 1] = Math.round(color[1] * alpha + rgba[offset + 1] * keep);
  rgba[offset + 2] = Math.round(color[2] * alpha + rgba[offset + 2] * keep);
  rgba[offset + 3] = Math.round(color[3] + rgba[offset + 3] * keep);
}

function fillCell(rgba: Uint8Array, west: number, south: number, east: number, north: number, color: Rgba): void {
  const topLeft = xy(west, north);
  const bottomRight = xy(east, south);
  const x0 = Math.max(0, Math.floor(Math.min(topLeft.x, bottomRight.x)));
  const x1 = Math.min(PANEL_WIDTH - 1, Math.ceil(Math.max(topLeft.x, bottomRight.x)));
  const y0 = Math.max(0, Math.floor(Math.min(topLeft.y, bottomRight.y)));
  const y1 = Math.min(PANEL_HEIGHT - 1, Math.ceil(Math.max(topLeft.y, bottomRight.y)));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) blend(rgba, x, y, color);
  }
}

function irColor(value: number): Rgba {
  if (!Number.isFinite(value)) return [213, 219, 227, 255];
  for (const bin of IR_BINS) {
    if (value <= bin.max) return [bin.rgb[0], bin.rgb[1], bin.rgb[2], 255];
  }
  return [231, 238, 243, 255];
}

function modelColor(probability: number): Rgba | null {
  if (!Number.isFinite(probability) || probability < 0.2) return null;
  if (probability < 0.4) return [183, 215, 204, 220];
  if (probability < 0.6) return [94, 174, 150, 230];
  if (probability < 0.8) return [31, 138, 110, 235];
  return [15, 110, 86, 245];
}

export function renderPanel(options: {
  name: PanelName;
  grid: SensorGrid;
  showIr: boolean;
  ir?: Float32Array;
  model?: Float32Array;
  mask?: Uint8Array;
}): Buffer {
  const rgba = new Uint8Array(PANEL_WIDTH * PANEL_HEIGHT * 4);
  if (options.name === "obs" && options.showIr && options.ir) {
    options.grid.cells.forEach((cell, index) => {
      fillCell(rgba, cell.west, cell.south, cell.east, cell.north, irColor(options.ir?.[index] ?? Number.NaN));
    });
  }
  const storm: Rgba =
    options.name === "flow" ? [29, 78, 137, 215] : options.name === "persist" ? [138, 90, 0, 215] : [159, 45, 45, 215];
  options.grid.cells.forEach((cell, index) => {
    if (options.name === "model") {
      const color = modelColor(options.model?.[index] ?? Number.NaN);
      if (color) fillCell(rgba, cell.west, cell.south, cell.east, cell.north, color);
      return;
    }
    if (options.mask?.[index]) fillCell(rgba, cell.west, cell.south, cell.east, cell.north, storm);
  });
  return encodeRgbaPng(PANEL_WIDTH, PANEL_HEIGHT, rgba);
}
