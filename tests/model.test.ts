import assert from "node:assert/strict";
import test from "node:test";
import { createMlp, forward, trainMlp } from "../lib/model";

test("the network learns a simple threshold", () => {
  const model = createMlp(2, 8, 1, 3);
  const samples = [];
  for (let i = 0; i < 200; i += 1) {
    const x = new Float64Array([i % 2 === 0 ? 1 : -1, 0.1]);
    samples.push({ x, y: [i % 2 === 0 ? 1 : 0] });
  }
  trainMlp(model, samples, 12, 0.08, 5);
  const positive = forward(model, new Float64Array([1, 0.1])).probs[0];
  const negative = forward(model, new Float64Array([-1, 0.1])).probs[0];
  assert.ok(positive > 0.7);
  assert.ok(negative < 0.3);
});
