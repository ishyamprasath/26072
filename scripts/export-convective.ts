import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ANALYSIS_HHMM, datesFor } from "../lib/catalog";
import { DISTRICTS } from "../lib/districts";
import { advect, hornSchunck } from "../lib/flow";
import { LEADS, STORM_BT_K, cellAreaKm2 } from "../lib/grid";
import { deserializeMlp, forward, type Mlp } from "../lib/model";
import { buildSensorGrid, type SensorGrid } from "../lib/sensor-grid";
import type { CaseMeta } from "../lib/pipeline";

const DATA = path.join(process.cwd(), "data");

function cellIndexAt(grid: SensorGrid, row: number, col: number): number {
  return row * grid.cols + col;
}

function advectedMasks(sequence: { ir: Float32Array[]; masks: Uint8Array[] }, grid: SensorGrid): Float32Array[] {
  const previous = sequence.ir[4];
  const current = sequence.ir[5];
  const { u, v } = hornSchunck(previous, current, grid.rows, grid.cols, 2);
  const now = new Float32Array(grid.cells.length);
  for (let cell = 0; cell < now.length; cell += 1) now[cell] = sequence.masks[5][cell];
  const steps: Float32Array[] = [];
  for (let lead = 0; lead < LEADS.length; lead += 1) {
    steps.push(advect(now, u, v, lead + 1, grid.rows, grid.cols));
  }
  return steps;
}

function featuresFor(
  sequence: { ir: Float32Array[]; wv: Float32Array[] },
  grid: SensorGrid,
  norm: { irMean: number; irStd: number; wvMean: number; wvStd: number; coolMean: number; coolStd: number; elevMean: number; elevStd: number },
  elevation: Float32Array,
  advected: Float32Array[],
  cell: number,
): number[] | null {
  const ir0 = sequence.ir[5][cell];
  const ir30 = sequence.ir[2][cell];
  const wv0 = sequence.wv[5][cell];
  if (!Number.isFinite(ir0) || !Number.isFinite(ir30) || !Number.isFinite(wv0)) return null;
  const cool = ir30 - ir0;
  const elev = elevation[cell] ?? 0;
  const row = Math.floor(cell / grid.cols);
  const col = cell % grid.cols;
  const nRow = (row / (grid.rows - 1)) * 2 - 1;
  const nCol = (col / (grid.cols - 1)) * 2 - 1;
  const nIr = (ir0 - norm.irMean) / norm.irStd;
  const nWv = (wv0 - norm.wvMean) / norm.wvStd;
  const nCool = (cool - norm.coolMean) / norm.coolStd;
  const nElev = (elev - norm.elevMean) / norm.elevStd;
  const hour = 8.5;
  const sinH = Math.sin((hour / 24) * 2 * Math.PI);
  const cosH = Math.cos((hour / 24) * 2 * Math.PI);
  const flowFeatures = LEADS.map((_, index) => advected[index][cell]);
  return [nIr, nWv, nCool, nElev, nRow, nCol, sinH, cosH, ...flowFeatures];
}

function predictGrid(
  model: Mlp,
  sequence: { ir: Float32Array[]; wv: Float32Array[]; masks: Uint8Array[] },
  grid: SensorGrid,
  norm: { irMean: number; irStd: number; wvMean: number; wvStd: number; coolMean: number; coolStd: number; elevMean: number; elevStd: number },
  elevation: Float32Array,
): Float32Array[] {
  const advected = advectedMasks(sequence, grid);
  const leads = LEADS.map(() => new Float32Array(grid.cells.length));
  for (let cell = 0; cell < grid.cells.length; cell += 1) {
    const input = featuresFor(sequence, grid, norm, elevation, advected, cell);
    if (!input) continue;
    const { probs } = forward(model, new Float64Array(input));
    for (let lead = 0; lead < LEADS.length; lead += 1) leads[lead][cell] = probs[lead];
  }
  return leads;
}

function overlapBox(
  cell: SensorGrid["cells"][number],
  district: (typeof DISTRICTS)[number],
): { south: number; north: number; west: number; east: number } | null {
  const south = Math.max(cell.south, district.south);
  const north = Math.min(cell.north, district.north);
  const west = Math.max(cell.west, district.west);
  const east = Math.min(cell.east, district.east);
  if (south >= north || west >= east) return null;
  return { south, north, west, east };
}

async function main() {
  const date = "2024-06-11";
  const hhmm = "0830";
  const baseMeta: CaseMeta = JSON.parse(await readFile(path.join(DATA, "case", "meta.json"), "utf8"));
  const grid = baseMeta.grid;
  const norm = baseMeta.norm;
  const model = deserializeMlp(await readFile(path.join(DATA, "model.json"), "utf8"));
  const cells = grid.cells.length;

  const cubeJson = JSON.parse(await readFile(path.join(DATA, "cubes", `${date}.json`), "utf8")) as { times: string[] };
  const cubeBuf = await readFile(path.join(DATA, "cubes", `${date}.bin`));
  const timeIndex = cubeJson.times.indexOf(hhmm);
  if (timeIndex < 5 || timeIndex + 12 >= cubeJson.times.length) {
    throw new Error(`Time ${hhmm} invalid in cube`);
  }

  const ir: Float32Array[] = [];
  const wv: Float32Array[] = [];
  const masks: Uint8Array[] = [];

  for (let t = timeIndex - 5; t <= timeIndex + 12; t += 1) {
    const irSlice = new Float32Array(cubeBuf.buffer, cubeBuf.byteOffset + (t * 2) * cells * 4, cells);
    const wvSlice = new Float32Array(cubeBuf.buffer, cubeBuf.byteOffset + (t * 2 + 1) * cells * 4, cells);
    const mask = new Uint8Array(cells);
    for (let c = 0; c < cells; c += 1) {
      if (irSlice[c] <= STORM_BT_K) mask[c] = 1;
    }
    ir.push(irSlice);
    wv.push(wvSlice);
    masks.push(mask);
  }

  const sequence = { ir, wv, masks };
  const elevation = new Float32Array(cells); // norm has elev stats

  const probabilities = predictGrid(model, sequence, grid, norm, elevation);
  const advected = advectedMasks(sequence, grid);

  const modelBin = Buffer.alloc(LEADS.length * cells * 4);
  const flowBin = Buffer.alloc(LEADS.length * cells);
  const persistBin = Buffer.alloc(LEADS.length * cells);
  const obsBin = Buffer.alloc(LEADS.length * cells);
  const irBin = Buffer.alloc(LEADS.length * cells * 4);
  const districtsByLead: CaseMeta["districtsByLead"] = {};

  LEADS.forEach((lead, index) => {
    Buffer.from(probabilities[index].buffer, probabilities[index].byteOffset, cells * 4).copy(modelBin, index * cells * 4);
    Buffer.from(sequence.ir[6 + index].buffer, sequence.ir[6 + index].byteOffset, cells * 4).copy(irBin, index * cells * 4);
    for (let cell = 0; cell < cells; cell += 1) {
      flowBin[index * cells + cell] = advected[index][cell] >= 0.5 ? 1 : 0;
      persistBin[index * cells + cell] = sequence.masks[5][cell];
      obsBin[index * cells + cell] = sequence.masks[6 + index][cell];
    }
    districtsByLead[String(lead)] = DISTRICTS.flatMap((district) => {
      let max = 0;
      let sum = 0;
      let count = 0;
      let area = 0;
      grid.cells.forEach((cell, cellIndex) => {
        const box = overlapBox(cell, district);
        if (!box) return;
        const probability = probabilities[index][cellIndex];
        max = Math.max(max, probability);
        sum += probability;
        count += 1;
        if (probability >= baseMeta.threshold) area += cellAreaKm2(box.south, box.north, box.west, box.east);
      });
      if (!count) return [];
      return [{ id: district.id, name: district.name, nameHi: district.nameHi, max, mean: sum / count, areaKm2: area }];
    });
  });

  const convectiveMeta: CaseMeta = {
    ...baseMeta,
    demoDate: date,
    analysisHhmm: hhmm,
    analysisUtc: `${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}:00Z`,
    districtsByLead,
  };

  const targetDir = path.join(DATA, "case", "convective");
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, "meta.json"), JSON.stringify(convectiveMeta));
  await writeFile(path.join(targetDir, "model.f32"), modelBin);
  await writeFile(path.join(targetDir, "flow.u8"), flowBin);
  await writeFile(path.join(targetDir, "persist.u8"), persistBin);
  await writeFile(path.join(targetDir, "obs.u8"), obsBin);
  await writeFile(path.join(targetDir, "ir.f32"), irBin);

  console.log("Convective case generated successfully at", targetDir);
}

main().catch(console.error);
