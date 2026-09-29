import assert from "node:assert/strict";
import test from "node:test";
import { advect, hornSchunck } from "../lib/flow";

test("advection moves a block in the flow direction", () => {
  const rows = 12;
  const cols = 12;
  const field = new Float32Array(rows * cols);
  for (let row = 4; row <= 6; row += 1) {
    for (let col = 2; col <= 4; col += 1) field[row * cols + col] = 1;
  }
  const u = new Float32Array(rows * cols).fill(1);
  const v = new Float32Array(rows * cols);
  const moved = advect(field, u, v, 3, rows, cols);
  assert.ok(moved[5 * cols + 6] > 0.5);
  assert.ok(moved[5 * cols + 2] < 0.2);
});

test("optical flow follows a shifted cold block", () => {
  const rows = 16;
  const cols = 16;
  const earlier = new Float32Array(rows * cols).fill(280);
  const later = new Float32Array(rows * cols).fill(280);
  for (let row = 6; row <= 9; row += 1) {
    for (let col = 4; col <= 7; col += 1) earlier[row * cols + col] = 220;
    for (let col = 6; col <= 9; col += 1) later[row * cols + col] = 220;
  }
  const motion = hornSchunck(earlier, later, rows, cols, 40, 1);
  let sum = 0;
  let count = 0;
  for (let row = 6; row <= 9; row += 1) {
    for (let col = 6; col <= 7; col += 1) {
      sum += motion.u[row * cols + col];
      count += 1;
    }
  }
  assert.ok(sum / count > 0.4);
});
