import { DOMAIN, cellAreaKm2 } from "./grid";
import { headerToProj, latLonToColumnLine, type GeoProj, type HsdHeader } from "./hsd";

export type SensorCell = {
  line: number;
  column: number;
  lat: number;
  lon: number;
  south: number;
  north: number;
  west: number;
  east: number;
};

export type SensorGrid = {
  rows: number;
  cols: number;
  cells: SensorCell[];
};

type Hit = { line: number; column: number; lats: number[]; lons: number[] };

export function buildSensorGrid(header: HsdHeader): SensorGrid {
  const proj: GeoProj = headerToProj(header);
  const hits = new Map<string, Hit>();
  for (let lat = DOMAIN.south; lat <= DOMAIN.north; lat += 0.25) {
    for (let lon = DOMAIN.west; lon <= DOMAIN.east; lon += 0.25) {
      const xy = latLonToColumnLine(lat, lon, proj);
      if (!xy) continue;
      const line = Math.round(xy.line);
      const column = Math.round(xy.col);
      const key = `${line}:${column}`;
      const hit = hits.get(key) ?? { line, column, lats: [], lons: [] };
      hit.lats.push(lat);
      hit.lons.push(lon);
      hits.set(key, hit);
    }
  }
  const lines = [...new Set([...hits.values()].map((hit) => hit.line))].sort((a, b) => a - b);
  const columns = [...new Set([...hits.values()].map((hit) => hit.column))].sort((a, b) => a - b);
  const lineLat = new Map<number, number>();
  const columnLon = new Map<number, number>();
  for (const hit of hits.values()) {
    const lat = hit.lats.reduce((sum, value) => sum + value, 0) / hit.lats.length;
    const lon = hit.lons.reduce((sum, value) => sum + value, 0) / hit.lons.length;
    lineLat.set(hit.line, lat);
    columnLon.set(hit.column, lon);
  }
  const cells: SensorCell[] = [];
  for (const line of lines) {
    for (const column of columns) {
      const hit = hits.get(`${line}:${column}`);
      const lat = hit ? hit.lats.reduce((sum, value) => sum + value, 0) / hit.lats.length : (lineLat.get(line) ?? DOMAIN.south);
      const lon = hit ? hit.lons.reduce((sum, value) => sum + value, 0) / hit.lons.length : (columnLon.get(column) ?? DOMAIN.west);
      const south = hit ? Math.min(...hit.lats) : lat - 0.25;
      const north = hit ? Math.max(...hit.lats) : lat + 0.25;
      const west = hit ? Math.min(...hit.lons) : lon - 0.25;
      const east = hit ? Math.max(...hit.lons) : lon + 0.25;
      cells.push({ line, column, lat, lon, south, north, west, east });
    }
  }
  if (cells.length < 4) throw new Error("Sensor grid is empty. The projection did not hit the domain.");
  return expandCellBounds({ rows: lines.length, cols: columns.length, cells });
}

/** Each unique satellite pixel gets the box halfway to its neighbours, out to the domain edge. */
export function expandCellBounds(grid: SensorGrid): SensorGrid {
  const { rows, cols, cells } = grid;
  const rowCenters = Array.from({ length: rows }, (_, row) => cells[row * cols].lat);
  const colCenters = Array.from({ length: cols }, (_, col) => cells[col].lon);
  const latBounds = bounds1D(rowCenters, DOMAIN.south, DOMAIN.north);
  const lonBounds = bounds1D(colCenters, DOMAIN.west, DOMAIN.east);
  return {
    rows,
    cols,
    cells: cells.map((cell, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      return {
        ...cell,
        south: latBounds[row].low,
        north: latBounds[row].high,
        west: lonBounds[col].low,
        east: lonBounds[col].high,
      };
    }),
  };
}

function bounds1D(centers: number[], outerLow: number, outerHigh: number): { low: number; high: number }[] {
  return centers.map((center, index) => {
    const prev = index > 0 ? (centers[index - 1] + center) / 2 : null;
    const next = index < centers.length - 1 ? (center + centers[index + 1]) / 2 : null;
    if (prev === null && next === null) return { low: outerLow, high: outerHigh };
    if (prev === null) {
      const edge = next as number;
      return center >= edge ? { low: edge, high: outerHigh } : { low: outerLow, high: edge };
    }
    if (next === null) return center >= prev ? { low: prev, high: outerHigh } : { low: outerLow, high: prev };
    return { low: Math.min(prev, next), high: Math.max(prev, next) };
  });
}

export function cellIndex(grid: SensorGrid, row: number, col: number): number {
  return row * grid.cols + col;
}

export function areaOf(cell: SensorCell): number {
  return cellAreaKm2(cell.south, cell.north, cell.west, cell.east);
}
