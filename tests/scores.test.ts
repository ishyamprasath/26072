import assert from "node:assert/strict";
import test from "node:test";
import { contingency, sliceMask } from "../lib/scores";

test("contingency matches a hand count", () => {
  const forecast = Uint8Array.from([1, 1, 0, 0]);
  const observed = Uint8Array.from([1, 0, 1, 0]);
  const evaluate = Uint8Array.from([1, 1, 1, 1]);
  const score = contingency(forecast, observed, evaluate);
  assert.equal(score.hits, 1);
  assert.equal(score.falseAlarms, 1);
  assert.equal(score.misses, 1);
  assert.equal(score.pod, 0.5);
  assert.equal(score.far, 0.5);
  assert.equal(score.csi, 1 / 3);
});

test("initiation slice ignores cells that are already stormy", () => {
  const valid = Uint8Array.from([1, 1, 1]);
  const now = Uint8Array.from([1, 0, 0]);
  const slice = sliceMask("initiation", valid, now);
  assert.deepEqual(Array.from(slice), [0, 1, 1]);
});
