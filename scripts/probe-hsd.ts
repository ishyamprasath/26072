import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchBz2, parseHsdHeader, sampleBrightnessTemperature } from "../lib/hsd";
import { buildSensorGrid } from "../lib/sensor-grid";

const url =
  "https://noaa-himawari9.s3.amazonaws.com/AHI-L1b-FLDK/2024/05/08/0830/HS_H09_20240508_0830_B13_FLDK_R20_S0510.DAT.bz2";

async function main(): Promise<void> {
  const dir = path.join(process.cwd(), "data", "raw");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "probe-b13-s05.dat");
  let file: Buffer;
  try {
    file = await readFile(filePath);
  } catch {
    file = await fetchBz2(url);
    await writeFile(filePath, file);
  }
  const header = parseHsdHeader(file);
  const grid = buildSensorGrid(header);
  let finite = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const cell of grid.cells) {
    const bt = sampleBrightnessTemperature(file, header, cell.column, cell.line);
    if (!Number.isFinite(bt)) continue;
    finite += 1;
    sum += bt;
    min = Math.min(min, bt);
    max = Math.max(max, bt);
  }
  console.log(`satellite ${header.satellite} band ${header.band} grid ${grid.rows}x${grid.cols}`);
  console.log(
    `finite ${finite} mean ${finite ? (sum / finite).toFixed(2) : "n/a"} min ${min === Infinity ? "n/a" : min.toFixed(2)} max ${max === -Infinity ? "n/a" : max.toFixed(2)}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
