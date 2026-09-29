import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DOMAIN } from "../lib/grid";
import { countToBrightnessTemperature, parseHsdHeader } from "../lib/hsd";
import { buildSensorGrid } from "../lib/sensor-grid";

test("brightness temperature stays in a physical range", () => {
  const header = {
    totalHeaderLength: 0,
    satellite: "test",
    band: 13,
    ncols: 1,
    nlines: 1,
    errorCount: 65535,
    outsideCount: 65534,
    gain: -0.0037525074318633814,
    offset: 15.197657722429469,
    centralWavelengthUm: 10.4074,
    c0: -0.118260812197365,
    c1: 1.00101143081895,
    c2: -0.00000180800453227613,
    speedOfLight: 299792458,
    planck: 6.62606957e-34,
    boltzmann: 1.3806488e-23,
    subLon: 140.7,
    cfac: 1,
    lfac: 1,
    coff: 0,
    loff: 0,
    equatorialRadiusKm: 6378,
    polarRadiusKm: 6356,
    satDistanceKm: 42164,
    totalSegments: 10,
    segmentNumber: 1,
    firstLine: 1,
  };
  const bt = countToBrightnessTemperature(header, 3000);
  assert.ok(bt > 220 && bt < 280);
  assert.ok(Number.isNaN(countToBrightnessTemperature(header, 65535)));
});

test("the stored Himawari segment builds a small real grid", async () => {
  const file = await readFile(path.join(process.cwd(), "data", "raw", "probe-b13-s05.dat"));
  const header = parseHsdHeader(file);
  assert.equal(header.satellite.includes("Himawari"), true);
  assert.equal(header.band, 13);
  const grid = buildSensorGrid(header);
  assert.ok(grid.cells.length >= 4);
  assert.ok(grid.cells.length <= 80);
  assert.ok(grid.cells.every((cell) => cell.lat >= 19 && cell.lat <= 29 && cell.lon >= 83 && cell.lon <= 97));
  assert.ok(Math.min(...grid.cells.map((cell) => cell.south)) <= DOMAIN.south + 1e-6);
  assert.ok(Math.max(...grid.cells.map((cell) => cell.north)) >= DOMAIN.north - 1e-6);
  assert.ok(Math.min(...grid.cells.map((cell) => cell.west)) <= DOMAIN.west + 1e-6);
  assert.ok(Math.max(...grid.cells.map((cell) => cell.east)) >= DOMAIN.east - 1e-6);
  assert.equal(grid.rows * grid.cols, grid.cells.length);
});
