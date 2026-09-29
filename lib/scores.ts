export type Contingency = {
  hits: number;
  misses: number;
  falseAlarms: number;
  pod: number;
  far: number;
  csi: number;
};

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

export function contingency(forecastOn: Uint8Array, observedOn: Uint8Array, evaluate: Uint8Array): Contingency {
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  for (let i = 0; i < observedOn.length; i += 1) {
    if (!evaluate[i]) continue;
    const forecast = forecastOn[i] === 1;
    const observed = observedOn[i] === 1;
    if (forecast && observed) hits += 1;
    else if (!forecast && observed) misses += 1;
    else if (forecast && !observed) falseAlarms += 1;
  }
  return {
    hits,
    misses,
    falseAlarms,
    pod: ratio(hits, hits + misses),
    far: ratio(falseAlarms, hits + falseAlarms),
    csi: ratio(hits, hits + misses + falseAlarms),
  };
}

export function thresholdMask(probability: Float32Array, threshold: number): Uint8Array {
  const out = new Uint8Array(probability.length);
  for (let i = 0; i < probability.length; i += 1) {
    if (probability[i] >= threshold) out[i] = 1;
  }
  return out;
}

export type SliceName = "all" | "initiation" | "decay";

export function sliceMask(name: SliceName, valid: Uint8Array, observedNow: Uint8Array): Uint8Array {
  if (name === "all") return valid;
  const out = new Uint8Array(valid.length);
  for (let i = 0; i < valid.length; i += 1) {
    if (!valid[i]) continue;
    if (name === "initiation" && observedNow[i] === 0) out[i] = 1;
    if (name === "decay" && observedNow[i] === 1) out[i] = 1;
  }
  return out;
}
