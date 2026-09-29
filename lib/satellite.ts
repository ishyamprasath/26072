import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchBz2, parseHsdHeader, sampleBrightnessTemperature, type HsdHeader } from "./hsd";
import type { SensorGrid } from "./sensor-grid";

const RAW = path.join(process.cwd(), "data", "raw");

export function himawariUrl(date: string, hhmm: string, band: "B13" | "B08", segment: number): string {
  const [year, month, day] = date.split("-");
  const compact = `${year}${month}${day}`;
  const seg = String(segment).padStart(2, "0");
  return `https://noaa-himawari9.s3.amazonaws.com/AHI-L1b-FLDK/${year}/${month}/${day}/${hhmm}/HS_H09_${compact}_${hhmm}_${band}_FLDK_R20_S${seg}10.DAT.bz2`;
}

export function segmentIndexForLine(line: number, anchor: HsdHeader): number {
  const origin = anchor.firstLine - (anchor.segmentNumber - 1) * anchor.nlines;
  return Math.floor((line - origin) / anchor.nlines) + 1;
}

async function loadSegment(date: string, hhmm: string, band: "B13" | "B08", segment: number): Promise<{ file: Buffer; header: HsdHeader }> {
  await mkdir(RAW, { recursive: true });
  const name = `${date.replaceAll("-", "")}_${hhmm}_${band}_S${String(segment).padStart(2, "0")}.dat`;
  const filePath = path.join(RAW, name);
  try {
    const cached = await readFile(filePath);
    return { file: cached, header: parseHsdHeader(cached) };
  } catch {
    // Missing or unreadable cache. Download below.
  }
  let last = "Himawari download failed";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const file = await fetchBz2(himawariUrl(date, hhmm, band, segment));
      const header = parseHsdHeader(file);
      const part = `${filePath}.part`;
      await writeFile(part, file);
      await rename(part, filePath);
      return { file, header };
    } catch (error) {
      last = error instanceof Error ? error.message : last;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw new Error(last);
}

export async function loadAnchor(date: string, hhmm: string): Promise<HsdHeader> {
  const loaded = await loadSegment(date, hhmm, "B13", 5);
  return loaded.header;
}

export async function readInfraredAndVapour(
  date: string,
  hhmm: string,
  grid: SensorGrid,
  anchor: HsdHeader,
): Promise<{ ir: Float32Array; wv: Float32Array }> {
  const segments = [...new Set(grid.cells.map((cell) => segmentIndexForLine(cell.line, anchor)))].filter(
    (segment) => segment >= 1 && segment <= anchor.totalSegments,
  );
  const irFiles = new Map<number, { file: Buffer; header: HsdHeader }>();
  const wvFiles = new Map<number, { file: Buffer; header: HsdHeader }>();
  await Promise.all(
    segments.map(async (segment) => {
      irFiles.set(segment, await loadSegment(date, hhmm, "B13", segment));
      wvFiles.set(segment, await loadSegment(date, hhmm, "B08", segment));
    }),
  );
  const ir = new Float32Array(grid.cells.length);
  const wv = new Float32Array(grid.cells.length);
  grid.cells.forEach((cell, index) => {
    const segment = segmentIndexForLine(cell.line, anchor);
    const infrared = irFiles.get(segment);
    const vapour = wvFiles.get(segment);
    ir[index] = infrared ? sampleBrightnessTemperature(infrared.file, infrared.header, cell.column, cell.line) : Number.NaN;
    wv[index] = vapour ? sampleBrightnessTemperature(vapour.file, vapour.header, cell.column, cell.line) : Number.NaN;
  });
  return { ir, wv };
}
