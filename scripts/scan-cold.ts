import { readFile } from "node:fs/promises";
import path from "node:path";
import { countToBrightnessTemperature, parseHsdHeader } from "../lib/hsd";

async function main(): Promise<void> {
  const file = await readFile(path.join(process.cwd(), "data", "raw", "probe-b13-s05.dat"));
  const header = parseHsdHeader(file);
  let min = Infinity;
  let max = -Infinity;
  let finite = 0;
  let cold230 = 0;
  let cold240 = 0;
  let cold250 = 0;
  for (let line = 2718; line <= 2740; line += 1) {
    for (let col = 2700; col <= 2730; col += 1) {
      const row = line - header.firstLine;
      const offset = header.totalHeaderLength + (row * header.ncols + col) * 2;
      const bt = countToBrightnessTemperature(header, file.readUInt16LE(offset));
      if (!Number.isFinite(bt)) continue;
      finite += 1;
      min = Math.min(min, bt);
      max = Math.max(max, bt);
      if (bt <= 230) cold230 += 1;
      if (bt <= 240) cold240 += 1;
      if (bt <= 250) cold250 += 1;
    }
  }
  console.log({ finite, min, max, cold230, cold240, cold250 });
}

main();
