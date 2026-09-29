function idx(row: number, col: number, cols: number): number {
  return row * cols + col;
}

export function hornSchunck(
  earlier: Float32Array,
  later: Float32Array,
  rows: number,
  cols: number,
  iterations = 30,
  alpha = 2,
): { u: Float32Array; v: Float32Array } {
  const ix = new Float32Array(rows * cols);
  const iy = new Float32Array(rows * cols);
  const it = new Float32Array(rows * cols);
  for (let row = 1; row < rows - 1; row += 1) {
    for (let col = 1; col < cols - 1; col += 1) {
      const i = idx(row, col, cols);
      const a = earlier[i];
      const b = later[i];
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const ax1 = earlier[idx(row, col + 1, cols)];
      const ax0 = earlier[idx(row, col - 1, cols)];
      const ay1 = earlier[idx(row + 1, col, cols)];
      const ay0 = earlier[idx(row - 1, col, cols)];
      const bx1 = later[idx(row, col + 1, cols)];
      const bx0 = later[idx(row, col - 1, cols)];
      const by1 = later[idx(row + 1, col, cols)];
      const by0 = later[idx(row - 1, col, cols)];
      if (![ax1, ax0, ay1, ay0, bx1, bx0, by1, by0].every(Number.isFinite)) continue;
      ix[i] = ((ax1 - ax0) + (bx1 - bx0)) * 0.25;
      iy[i] = ((ay1 - ay0) + (by1 - by0)) * 0.25;
      it[i] = b - a;
    }
  }

  const u = new Float32Array(rows * cols);
  const v = new Float32Array(rows * cols);
  const alpha2 = alpha * alpha;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const nextU = new Float32Array(rows * cols);
    const nextV = new Float32Array(rows * cols);
    for (let row = 1; row < rows - 1; row += 1) {
      for (let col = 1; col < cols - 1; col += 1) {
        const i = idx(row, col, cols);
        const uBar =
          (u[idx(row - 1, col, cols)] +
            u[idx(row + 1, col, cols)] +
            u[idx(row, col - 1, cols)] +
            u[idx(row, col + 1, cols)]) *
          0.25;
        const vBar =
          (v[idx(row - 1, col, cols)] +
            v[idx(row + 1, col, cols)] +
            v[idx(row, col - 1, cols)] +
            v[idx(row, col + 1, cols)]) *
          0.25;
        const gx = ix[i];
        const gy = iy[i];
        const divisor = alpha2 + gx * gx + gy * gy;
        const common = (gx * uBar + gy * vBar + it[i]) / divisor;
        nextU[i] = uBar - gx * common;
        nextV[i] = vBar - gy * common;
      }
    }
    u.set(nextU);
    v.set(nextV);
  }
  return { u, v };
}

function sampleBilinear(field: Float32Array, row: number, col: number, rows: number, cols: number): number {
  if (row < 0 || col < 0 || row > rows - 1 || col > cols - 1) return 0;
  const r0 = Math.floor(row);
  const c0 = Math.floor(col);
  const r1 = Math.min(r0 + 1, rows - 1);
  const c1 = Math.min(c0 + 1, cols - 1);
  const tr = row - r0;
  const tc = col - c0;
  const v00 = field[idx(r0, c0, cols)];
  const v01 = field[idx(r0, c1, cols)];
  const v10 = field[idx(r1, c0, cols)];
  const v11 = field[idx(r1, c1, cols)];
  return (1 - tr) * ((1 - tc) * v00 + tc * v01) + tr * ((1 - tc) * v10 + tc * v11);
}

/** Move a field by `steps` applications of a per-frame pixel velocity. */
export function advect(
  field: Float32Array,
  u: Float32Array,
  v: Float32Array,
  steps: number,
  rows: number,
  cols: number,
): Float32Array {
  const out = new Float32Array(field.length);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const i = idx(row, col, cols);
      const sourceCol = col - u[i] * steps;
      const sourceRow = row - v[i] * steps;
      out[i] = sampleBilinear(field, sourceRow, sourceCol, rows, cols);
    }
  }
  return out;
}

export function toMask(field: Float32Array, threshold: number): Uint8Array {
  const out = new Uint8Array(field.length);
  for (let i = 0; i < field.length; i += 1) {
    if (field[i] >= threshold) out[i] = 1;
  }
  return out;
}
