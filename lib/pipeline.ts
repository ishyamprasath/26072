import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ANALYSIS_HHMM, CATALOG, addMinutes, afternoonFrames, datesFor, type SplitName } from "./catalog";
import { DISTRICTS } from "./districts";
import { advect, hornSchunck } from "./flow";
import { LEADS, STORM_BT_K, cellAreaKm2 } from "./grid";
import { createMlp, deserializeMlp, forward, serializeMlp, trainMlp, type Mlp, type Sample } from "./model";
import { contingency, sliceMask, thresholdMask, type SliceName } from "./scores";
import { buildSensorGrid, type SensorGrid } from "./sensor-grid";
import { loadAnchor, readInfraredAndVapour } from "./satellite";

const DATA = path.join(process.cwd(), "data");
const STATUS = path.join(DATA, "status.json");

export type LeadScore = {
  lead: number;
  pod: number;
  far: number;
  csi: number;
  hits: number;
  misses: number;
  falseAlarms: number;
};

export type ScoreBlock = Record<SliceName, LeadScore[]>;
export type MethodName = "model" | "persistence" | "optical_flow";

export type CaseMeta = {
  demoDate: string;
  testDate: string;
  analysisHhmm: string;
  analysisUtc: string;
  leads: number[];
  threshold: number;
  stormBtK: number;
  label: string;
  lightning: false;
  grid: SensorGrid;
  days: Record<SplitName, string[]>;
  activeFraction: Record<string, number>;
  scores: { test: Record<MethodName, ScoreBlock>; demo: Record<MethodName, ScoreBlock> };
  districtsByLead: Record<string, { id: string; name: string; nameHi: string; max: number; mean: number; areaKm2: number }[]>;
  model: { input: number; hidden: number; output: number; epochs: number; finalLoss: number };
  norm: Norm;
  elevationNote: string;
};

type Norm = { irMean: number; irStd: number; wvMean: number; wvStd: number; coolMean: number; coolStd: number; elevMean: number; elevStd: number };

type DayCube = { date: string; times: string[]; ir: Float32Array[]; wv: Float32Array[] };

type Status = { state: "idle" | "running" | "complete" | "error"; step: string; detail: string; updatedAt: string; log: string[] };

const logLines: string[] = [];
let statusChain: Promise<unknown> = Promise.resolve();

async function setStatus(state: Status["state"], step: string, detail: string): Promise<void> {
  const write = async () => {
    logLines.push(`${step}: ${detail}`);
    if (logLines.length > 80) logLines.shift();
    const status: Status = { state, step, detail, updatedAt: new Date().toISOString(), log: logLines };
    await mkdir(DATA, { recursive: true });
    await writeFile(STATUS, JSON.stringify(status, null, 2));
    console.log(`${step}: ${detail}`);
  };
  const done = statusChain.then(write, write);
  statusChain = done;
  await done;
}

export async function markPipelineError(message: string): Promise<void> {
  await setStatus("error", "error", message);
}

export async function readStatus(): Promise<Status> {
  try {
    return JSON.parse(await readFile(STATUS, "utf8")) as Status;
  } catch {
    return { state: "idle", step: "idle", detail: "Pipeline has not been run.", updatedAt: "", log: [] };
  }
}

function cubePath(date: string): string {
  return path.join(DATA, "cubes", `${date}.bin`);
}

async function saveCube(cube: DayCube, cells: number): Promise<void> {
  await mkdir(path.join(DATA, "cubes"), { recursive: true });
  const payload = Buffer.alloc(cube.times.length * cells * 2 * 4);
  cube.times.forEach((time, timeIndex) => {
    const ir = Buffer.from(cube.ir[timeIndex].buffer, cube.ir[timeIndex].byteOffset, cells * 4);
    const wv = Buffer.from(cube.wv[timeIndex].buffer, cube.wv[timeIndex].byteOffset, cells * 4);
    ir.copy(payload, (timeIndex * 2) * cells * 4);
    wv.copy(payload, (timeIndex * 2 + 1) * cells * 4);
    void time;
  });
  await writeFile(cubePath(cube.date), payload);
  await writeFile(path.join(DATA, "cubes", `${cube.date}.json`), JSON.stringify({ times: cube.times }));
}

async function loadCube(date: string, cells: number): Promise<DayCube | null> {
  try {
    const meta = JSON.parse(await readFile(path.join(DATA, "cubes", `${date}.json`), "utf8")) as { times: string[] };
    const payload = await readFile(cubePath(date));
    const ir: Float32Array[] = [];
    const wv: Float32Array[] = [];
    meta.times.forEach((_, timeIndex) => {
      const irStart = timeIndex * 2 * cells * 4;
      const wvStart = irStart + cells * 4;
      ir.push(new Float32Array(payload.buffer.slice(payload.byteOffset + irStart, payload.byteOffset + irStart + cells * 4)));
      wv.push(new Float32Array(payload.buffer.slice(payload.byteOffset + wvStart, payload.byteOffset + wvStart + cells * 4)));
    });
    return { date, times: meta.times, ir, wv };
  } catch {
    return null;
  }
}

function stormMask(ir: Float32Array): Uint8Array {
  const mask = new Uint8Array(ir.length);
  for (let i = 0; i < ir.length; i += 1) {
    if (Number.isFinite(ir[i]) && ir[i] <= STORM_BT_K) mask[i] = 1;
  }
  return mask;
}

function finiteMean(values: Float32Array): number {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (Number.isFinite(value)) {
      sum += value;
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

function fill(values: Float32Array): Float32Array {
  const mean = finiteMean(values);
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) out[i] = Number.isFinite(values[i]) ? values[i] : mean;
  return out;
}

function neighborMean(values: Float32Array, grid: SensorGrid): Float32Array {
  const out = new Float32Array(values.length);
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      let sum = 0;
      let count = 0;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const rr = row + dr;
          const cc = col + dc;
          if (rr < 0 || cc < 0 || rr >= grid.rows || cc >= grid.cols) continue;
          const value = values[rr * grid.cols + cc];
          if (Number.isFinite(value)) {
            sum += value;
            count += 1;
          }
        }
      }
      out[row * grid.cols + col] = count ? sum / count : Number.NaN;
    }
  }
  return out;
}

function z(value: number, mean: number, std: number): number {
  if (!Number.isFinite(value)) return 0;
  return (value - mean) / (std || 1);
}

function hourCycle(hhmm: string): { sin: number; cos: number } {
  const hour = Number(hhmm.slice(0, 2)) + Number(hhmm.slice(2, 4)) / 60 + 5.5;
  const angle = ((hour % 24) / 24) * Math.PI * 2;
  return { sin: Math.sin(angle), cos: Math.cos(angle) };
}

async function elevations(grid: SensorGrid): Promise<{ values: Float32Array; note: string }> {
  const values = new Float32Array(grid.cells.length);
  try {
    for (let start = 0; start < grid.cells.length; start += 40) {
      const slice = grid.cells.slice(start, start + 40);
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${slice.map((cell) => cell.lat.toFixed(3)).join(",")}&longitude=${slice.map((cell) => cell.lon.toFixed(3)).join(",")}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`elevation ${response.status}`);
      const body = (await response.json()) as { elevation?: number[] };
      body.elevation?.forEach((value, index) => {
        values[start + index] = value;
      });
    }
    return { values, note: "Elevation sampled from the Open-Meteo elevation service at each satellite pixel." };
  } catch {
    return { values, note: "Elevation service was unavailable. Elevation inputs are zero for this run." };
  }
}

function activeFraction(mask: Uint8Array, ir: Float32Array): number {
  let cells = 0;
  let active = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!Number.isFinite(ir[i])) continue;
    cells += 1;
    active += mask[i];
  }
  return cells ? active / cells : 0;
}

type Sequence = {
  date: string;
  hhmm: string;
  ir: Float32Array[];
  masks: Uint8Array[];
  flowU: Float32Array;
  flowV: Float32Array;
};

function buildSequence(cube: DayCube, hhmm: string, grid: SensorGrid): Sequence | null {
  const needed = [-50, -40, -30, -20, -10, 0, ...LEADS];
  const frames = needed.map((offset) => cube.times.indexOf(addMinutes(hhmm, offset)));
  if (frames.some((index) => index < 0)) return null;
  const ir = frames.map((index) => cube.ir[index]);
  const masks = ir.map(stormMask);
  const motion = hornSchunck(fill(ir[4]), fill(ir[5]), grid.rows, grid.cols);
  clipMotion(motion.u, motion.v, 2);
  return { date: cube.date, hhmm, ir, masks, flowU: motion.u, flowV: motion.v };
}

function clipMotion(u: Float32Array, v: Float32Array, limit: number): void {
  for (let i = 0; i < u.length; i += 1) {
    u[i] = Math.max(-limit, Math.min(limit, Number.isFinite(u[i]) ? u[i] : 0));
    v[i] = Math.max(-limit, Math.min(limit, Number.isFinite(v[i]) ? v[i] : 0));
  }
}

function advectedMasks(sequence: Sequence, grid: SensorGrid): Float32Array[] {
  const current = Float32Array.from(sequence.masks[5]);
  return LEADS.map((lead) => advect(current, sequence.flowU, sequence.flowV, lead / 10, grid.rows, grid.cols));
}

const INPUTS = 22;

function featuresFor(
  sequence: RichSequence,
  grid: SensorGrid,
  norm: Norm,
  elevation: Float32Array,
  advected: Float32Array[],
  cell: number,
): Float64Array | null {
  const ir0 = sequence.ir[5][cell];
  const ir30 = sequence.ir[2][cell];
  const ir50 = sequence.ir[0][cell];
  if (!Number.isFinite(ir0) || !Number.isFinite(ir30)) return null;
  const cooling = ir0 - ir30;
  const local = neighborMean(sequence.ir[5], grid)[cell];
  const clock = hourCycle(sequence.hhmm);
  const input = new Float64Array(INPUTS);
  input[0] = z(ir0, norm.irMean, norm.irStd);
  input[1] = z(ir30, norm.irMean, norm.irStd);
  input[2] = z(ir50, norm.irMean, norm.irStd);
  input[3] = z(sequence.vapour[5][cell], norm.wvMean, norm.wvStd);
  input[4] = z(cooling, norm.coolMean, norm.coolStd);
  input[5] = z(local, norm.irMean, norm.irStd);
  input[6] = sequence.masks[5][cell];
  input[7] = z(elevation[cell], norm.elevMean, norm.elevStd);
  input[8] = clock.sin;
  input[9] = clock.cos;
  for (let lead = 0; lead < LEADS.length; lead += 1) input[10 + lead] = advected[lead][cell];
  return input;
}

type RichSequence = Sequence & { vapour: Float32Array[] };

function attachVapour(sequence: Sequence, cube: DayCube): RichSequence {
  const frames = [-50, -40, -30, -20, -10, 0, ...LEADS].map((offset) => cube.times.indexOf(addMinutes(sequence.hhmm, offset)));
  return { ...sequence, vapour: frames.map((index) => cube.wv[index]) };
}

function collectNorm(sequences: RichSequence[]): Norm {
  const ir: number[] = [];
  const wv: number[] = [];
  const cool: number[] = [];
  for (const sequence of sequences) {
    for (let i = 0; i < sequence.ir[5].length; i += 1) {
      if (Number.isFinite(sequence.ir[5][i])) ir.push(sequence.ir[5][i]);
      if (Number.isFinite(sequence.vapour[5][i])) wv.push(sequence.vapour[5][i]);
      if (Number.isFinite(sequence.ir[5][i]) && Number.isFinite(sequence.ir[2][i])) cool.push(sequence.ir[5][i] - sequence.ir[2][i]);
    }
  }
  const stats = (values: number[]) => {
    const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
    return { mean, std: Math.sqrt(variance) || 1 };
  };
  const irStats = stats(ir);
  const wvStats = stats(wv);
  const coolStats = stats(cool);
  return { irMean: irStats.mean, irStd: irStats.std, wvMean: wvStats.mean, wvStd: wvStats.std, coolMean: coolStats.mean, coolStd: coolStats.std, elevMean: 0, elevStd: 1 };
}

function makeSamples(sequences: RichSequence[], grid: SensorGrid, norm: Norm, elevation: Float32Array): Sample[] {
  const samples: Sample[] = [];
  for (const sequence of sequences) {
    const advected = advectedMasks(sequence, grid);
    for (let cell = 0; cell < grid.cells.length; cell += 1) {
      const input = featuresFor(sequence, grid, norm, elevation, advected, cell);
      if (!input) continue;
      const target = LEADS.map((_, lead) => (Number.isFinite(sequence.ir[6 + lead][cell]) ? sequence.masks[6 + lead][cell] : 0));
      if (target.some((_, lead) => !Number.isFinite(sequence.ir[6 + lead][cell]))) continue;
      samples.push({ x: input, y: target });
    }
  }
  return samples;
}

function predictGrid(model: Mlp, sequence: RichSequence, grid: SensorGrid, norm: Norm, elevation: Float32Array): Float32Array[] {
  const advected = advectedMasks(sequence, grid);
  const leads = LEADS.map(() => new Float32Array(grid.cells.length));
  for (let cell = 0; cell < grid.cells.length; cell += 1) {
    const input = featuresFor(sequence, grid, norm, elevation, advected, cell);
    if (!input) continue;
    const { probs } = forward(model, input);
    for (let lead = 0; lead < LEADS.length; lead += 1) leads[lead][cell] = probs[lead];
  }
  return leads;
}

type Counts = { hits: number; misses: number; falseAlarms: number };

function emptyCounts(): Counts[] {
  return LEADS.map(() => ({ hits: 0, misses: 0, falseAlarms: 0 }));
}

function addCounts(target: Counts[], forecast: Uint8Array, observed: Uint8Array, evaluate: Uint8Array, lead: number): void {
  const score = contingency(forecast, observed, evaluate);
  target[lead].hits += score.hits;
  target[lead].misses += score.misses;
  target[lead].falseAlarms += score.falseAlarms;
}

function finalize(counts: Counts[]): LeadScore[] {
  return counts.map((count, index) => {
    const hits = count.hits;
    const misses = count.misses;
    const falseAlarms = count.falseAlarms;
    const pod = hits + misses > 0 ? hits / (hits + misses) : 0;
    const far = hits + falseAlarms > 0 ? falseAlarms / (hits + falseAlarms) : 0;
    const csi = hits + misses + falseAlarms > 0 ? hits / (hits + misses + falseAlarms) : 0;
    return { lead: LEADS[index], pod, far, csi, hits, misses, falseAlarms };
  });
}

function scoreSequences(
  sequences: RichSequence[],
  grid: SensorGrid,
  norm: Norm,
  elevation: Float32Array,
  model: Mlp,
  threshold: number,
): Record<MethodName, ScoreBlock> {
  const buckets: Record<MethodName, Record<SliceName, Counts[]>> = {
    model: { all: emptyCounts(), initiation: emptyCounts(), decay: emptyCounts() },
    persistence: { all: emptyCounts(), initiation: emptyCounts(), decay: emptyCounts() },
    optical_flow: { all: emptyCounts(), initiation: emptyCounts(), decay: emptyCounts() },
  };
  for (const sequence of sequences) {
    const probabilities = predictGrid(model, sequence, grid, norm, elevation);
    const advected = advectedMasks(sequence, grid);
    const now = sequence.masks[5];
    for (let lead = 0; lead < LEADS.length; lead += 1) {
      const observed = sequence.masks[6 + lead];
      const valid = new Uint8Array(grid.cells.length);
      for (let cell = 0; cell < valid.length; cell += 1) {
        if (Number.isFinite(sequence.ir[5][cell]) && Number.isFinite(sequence.ir[6 + lead][cell])) valid[cell] = 1;
      }
      const forecasts: Record<MethodName, Uint8Array> = {
        model: thresholdMask(probabilities[lead], threshold),
        persistence: now,
        optical_flow: Uint8Array.from(advected[lead], (value) => (value >= 0.5 ? 1 : 0)),
      };
      (["all", "initiation", "decay"] as SliceName[]).forEach((slice) => {
        const evaluate = sliceMask(slice, valid, now);
        (Object.keys(forecasts) as MethodName[]).forEach((method) => {
          addCounts(buckets[method][slice], forecasts[method], observed, evaluate, lead);
        });
      });
    }
  }
  return {
    model: { all: finalize(buckets.model.all), initiation: finalize(buckets.model.initiation), decay: finalize(buckets.model.decay) },
    persistence: { all: finalize(buckets.persistence.all), initiation: finalize(buckets.persistence.initiation), decay: finalize(buckets.persistence.decay) },
    optical_flow: { all: finalize(buckets.optical_flow.all), initiation: finalize(buckets.optical_flow.initiation), decay: finalize(buckets.optical_flow.decay) },
  };
}

function meanCsi(block: ScoreBlock): number {
  const values = block.all.map((row) => row.csi);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

export async function runPipeline(only?: string[]): Promise<void> {
  logLines.length = 0;
  await setStatus("running", "grid", "Reading one Himawari segment to fix the satellite grid.");
  const anchorDate = "2024-05-08";
  const anchor = await loadAnchor(anchorDate, "0830");
  const grid = buildSensorGrid(anchor);
  await mkdir(DATA, { recursive: true });
  await writeFile(path.join(DATA, "grid.json"), JSON.stringify(grid));
  await setStatus("running", "grid", `${grid.rows} by ${grid.cols} satellite pixels cover 20N-28N, 84E-96E.`);

  const elevation = await elevations(grid);
  const selected = new Set(only ?? CATALOG.map((day) => day.date));
  const cubes: DayCube[] = [];
  const frames = afternoonFrames();
  for (const day of CATALOG) {
    if (!selected.has(day.date)) continue;
    const cached = await loadCube(day.date, grid.cells.length);
    if (cached && cached.times.length === frames.length) {
      cubes.push(cached);
      await setStatus("running", "download", `${day.date} already stored.`);
      continue;
    }
    const scenes = await mapLimit(frames, 3, async (hhmm) => {
      await setStatus("running", "download", `${day.date} ${hhmm} UTC infrared and water vapour.`);
      return readInfraredAndVapour(day.date, hhmm, grid, anchor);
    });
    const cube = { date: day.date, times: frames, ir: scenes.map((scene) => scene.ir), wv: scenes.map((scene) => scene.wv) };
    await saveCube(cube, grid.cells.length);
    cubes.push(cube);
  }

  const active: Record<string, number> = {};
  for (const cube of cubes) {
    const fractions = cube.ir.map((frame) => activeFraction(stormMask(frame), frame));
    active[cube.date] = fractions.reduce((sum, value) => sum + value, 0) / fractions.length;
    await setStatus("running", "labels", `${cube.date} mean storm fraction ${active[cube.date].toFixed(3)} at ${STORM_BT_K} K.`);
  }

  const byDate = new Map(cubes.map((cube) => [cube.date, cube]));
  const sequencesFor = (split: SplitName): RichSequence[] => {
    const sequences: RichSequence[] = [];
    for (const date of datesFor(split)) {
      const cube = byDate.get(date);
      if (!cube || (only && !only.includes(date))) continue;
      for (const hhmm of ANALYSIS_HHMM) {
        const sequence = buildSequence(cube, hhmm, grid);
        if (sequence) sequences.push(attachVapour(sequence, cube));
      }
    }
    return sequences;
  };

  const train = sequencesFor("train");
  const validation = sequencesFor("validation");
  const test = sequencesFor("test");
  const demo = sequencesFor("demo");
  if (train.length === 0) throw new Error("No training sequences. Check that the afternoon frames downloaded.");

  const norm = collectNorm(train);
  const elevStats = (() => {
    let sum = 0;
    for (const value of elevation.values) sum += value;
    const mean = sum / elevation.values.length;
    let variance = 0;
    for (const value of elevation.values) variance += (value - mean) ** 2;
    return { mean, std: Math.sqrt(variance / elevation.values.length) || 1 };
  })();
  norm.elevMean = elevStats.mean;
  norm.elevStd = elevStats.std;

  await setStatus("running", "train", `Training on ${train.length} sequences.`);
  const samples = makeSamples(train, grid, norm, elevation.values);
  if (samples.length === 0) throw new Error("No trainable cells. Infrared values were missing.");
  const model = createMlp(INPUTS, 24, LEADS.length, 19);
  const losses = trainMlp(model, samples, 30, 0.04, 23);
  await writeFile(path.join(DATA, "model.json"), serializeMlp(model));
  await writeFile(path.join(DATA, "norm.json"), JSON.stringify(norm));
  await setStatus("running", "train", `Final loss ${losses[losses.length - 1].toFixed(4)} on ${samples.length} cells.`);

  let threshold = 0.4;
  let best = -1;
  if (validation.length) {
    for (let candidate = 0.2; candidate <= 0.7 + 1e-6; candidate += 0.05) {
      const scored = scoreSequences(validation, grid, norm, elevation.values, model, candidate);
      const value = meanCsi(scored.model);
      if (value > best) {
        best = value;
        threshold = Math.round(candidate * 100) / 100;
      }
    }
  }
  await setStatus("running", "scores", `Validation threshold ${threshold.toFixed(2)}.`);

  const testScores = test.length ? scoreSequences(test, grid, norm, elevation.values, model, threshold) : emptyScore();
  const demoScores = demo.length ? scoreSequences(demo, grid, norm, elevation.values, model, threshold) : emptyScore();
  const demoCube = byDate.get(datesFor("demo")[0]);
  const demoSequence = demo.find((sequence) => sequence.hhmm === "0830") ?? demo[0];
  if (!demoCube || !demoSequence) throw new Error("Demo afternoon did not produce a sequence.");

  const probabilities = predictGrid(model, demoSequence, grid, norm, elevation.values);
  const advected = advectedMasks(demoSequence, grid);
  const cells = grid.cells.length;
  const modelBin = Buffer.alloc(LEADS.length * cells * 4);
  const flowBin = Buffer.alloc(LEADS.length * cells);
  const persistBin = Buffer.alloc(LEADS.length * cells);
  const obsBin = Buffer.alloc(LEADS.length * cells);
  const irBin = Buffer.alloc(LEADS.length * cells * 4);
  const districtsByLead: CaseMeta["districtsByLead"] = {};
  LEADS.forEach((lead, index) => {
    Buffer.from(probabilities[index].buffer, probabilities[index].byteOffset, cells * 4).copy(modelBin, index * cells * 4);
    Buffer.from(demoSequence.ir[6 + index].buffer, demoSequence.ir[6 + index].byteOffset, cells * 4).copy(irBin, index * cells * 4);
    for (let cell = 0; cell < cells; cell += 1) {
      flowBin[index * cells + cell] = advected[index][cell] >= 0.5 ? 1 : 0;
      persistBin[index * cells + cell] = demoSequence.masks[5][cell];
      obsBin[index * cells + cell] = demoSequence.masks[6 + index][cell];
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
        if (probability >= threshold) area += cellAreaKm2(box.south, box.north, box.west, box.east);
      });
      if (!count) return [];
      return [{ id: district.id, name: district.name, nameHi: district.nameHi, max, mean: sum / count, areaKm2: area }];
    });
  });

  const meta: CaseMeta = {
    demoDate: demoSequence.date,
    testDate: datesFor("test")[0],
    analysisHhmm: demoSequence.hhmm,
    analysisUtc: `${demoSequence.date}T${demoSequence.hhmm.slice(0, 2)}:${demoSequence.hhmm.slice(2, 4)}:00Z`,
    leads: [...LEADS],
    threshold,
    stormBtK: STORM_BT_K,
    label: `A cell is stormy when infrared brightness temperature is at or below ${STORM_BT_K} K. The Himawari footprint over this domain is coarse, and 230 K does not occur in it.`,
    lightning: false,
    grid,
    days: {
      train: datesFor("train"),
      validation: datesFor("validation"),
      test: datesFor("test"),
      demo: datesFor("demo"),
    },
    activeFraction: active,
    scores: { test: testScores, demo: demoScores },
    districtsByLead,
    model: { input: INPUTS, hidden: 24, output: LEADS.length, epochs: 30, finalLoss: losses[losses.length - 1] },
    norm,
    elevationNote: elevation.note,
  };
  await mkdir(path.join(DATA, "case"), { recursive: true });
  await writeFile(path.join(DATA, "case", "meta.json"), JSON.stringify(meta));
  await writeFile(path.join(DATA, "case", "model.f32"), modelBin);
  await writeFile(path.join(DATA, "case", "flow.u8"), flowBin);
  await writeFile(path.join(DATA, "case", "persist.u8"), persistBin);
  await writeFile(path.join(DATA, "case", "obs.u8"), obsBin);
  await writeFile(path.join(DATA, "case", "ir.f32"), irBin);
  await setStatus("complete", "done", `Case written for ${meta.demoDate} at ${meta.analysisHhmm} UTC. Threshold ${threshold.toFixed(2)}.`);
}

function emptyScore(): Record<MethodName, ScoreBlock> {
  const blank = (): ScoreBlock => ({
    all: LEADS.map((lead) => ({ lead, pod: 0, far: 0, csi: 0, hits: 0, misses: 0, falseAlarms: 0 })),
    initiation: LEADS.map((lead) => ({ lead, pod: 0, far: 0, csi: 0, hits: 0, misses: 0, falseAlarms: 0 })),
    decay: LEADS.map((lead) => ({ lead, pod: 0, far: 0, csi: 0, hits: 0, misses: 0, falseAlarms: 0 })),
  });
  return { model: blank(), persistence: blank(), optical_flow: blank() };
}

export async function readCaseMeta(): Promise<CaseMeta | null> {
  try {
    return JSON.parse(await readFile(path.join(DATA, "case", "meta.json"), "utf8")) as CaseMeta;
  } catch {
    return null;
  }
}

export async function readModel(): Promise<Mlp | null> {
  try {
    return deserializeMlp(await readFile(path.join(DATA, "model.json"), "utf8"));
  } catch {
    return null;
  }
}
