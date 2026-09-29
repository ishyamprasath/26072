import { loadAnchor, readInfraredAndVapour } from "../lib/satellite";
import { buildSensorGrid } from "../lib/sensor-grid";

function summarize(name: string, values: Float32Array): void {
  let finite = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    finite += 1;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  console.log(`${name} finite ${finite} min ${min === Infinity ? "n/a" : min.toFixed(2)} max ${max === -Infinity ? "n/a" : max.toFixed(2)}`);
  if (finite < 4) throw new Error(`${name} did not return enough finite brightness temperatures`);
}

async function main(): Promise<void> {
  const anchor = await loadAnchor("2024-05-08", "0830");
  const grid = buildSensorGrid(anchor);
  const scene = await readInfraredAndVapour("2024-04-18", "0830", grid, anchor);
  console.log(`grid ${grid.rows}x${grid.cols}`);
  summarize("ir", scene.ir);
  summarize("wv", scene.wv);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
