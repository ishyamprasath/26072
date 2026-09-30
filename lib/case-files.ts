import { readFile } from "node:fs/promises";
import path from "node:path";
import { LEADS } from "./grid";
import { readCaseMeta, type CaseMeta } from "./pipeline";

const CASE_DIR = path.join(process.cwd(), "data", "case");

export type LeadFrames = {
  meta: CaseMeta;
  model: Float32Array;
  ir: Float32Array;
  flow: Uint8Array;
  persist: Uint8Array;
  obs: Uint8Array;
};

function frameFloat(file: Buffer, index: number, cells: number): Float32Array | null {
  const start = index * cells * 4;
  if (file.length < start + cells * 4) return null;
  return new Float32Array(file.buffer.slice(file.byteOffset + start, file.byteOffset + start + cells * 4));
}

function frameBytes(file: Buffer, index: number, cells: number): Uint8Array | null {
  const start = index * cells;
  if (file.length < start + cells) return null;
  return file.subarray(start, start + cells);
}

export async function readLead(lead: number, caseId?: string): Promise<LeadFrames | null> {
  const dir = caseId === "convective" ? path.join(CASE_DIR, "convective") : CASE_DIR;
  const meta = await readCaseMeta(caseId);
  if (!meta) return null;
  const index = (LEADS as readonly number[]).indexOf(lead);
  if (index < 0) return null;
  const cells = meta.grid.cells.length;
  const [modelFile, irFile, flowFile, persistFile, obsFile] = await Promise.all([
    readFile(path.join(dir, "model.f32")),
    readFile(path.join(dir, "ir.f32")),
    readFile(path.join(dir, "flow.u8")),
    readFile(path.join(dir, "persist.u8")),
    readFile(path.join(dir, "obs.u8")),
  ]);
  const model = frameFloat(modelFile, index, cells);
  const ir = frameFloat(irFile, index, cells);
  const flow = frameBytes(flowFile, index, cells);
  const persist = frameBytes(persistFile, index, cells);
  const obs = frameBytes(obsFile, index, cells);
  if (!model || !ir || !flow || !persist || !obs) return null;
  return { meta, model, ir, flow, persist, obs };
}
