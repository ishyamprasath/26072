import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG, afternoonFrames, datesFor } from "../lib/catalog";

test("twelve afternoons stay on one side of the split", () => {
  const groups = (["train", "validation", "test", "demo"] as const).map((split) => datesFor(split));
  const all = groups.flat();
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, CATALOG.length);
  assert.deepEqual(groups.map((group) => group.length), [8, 2, 1, 1]);
});

test("afternoon frames cover 06:30 to 11:30 UTC", () => {
  const frames = afternoonFrames();
  assert.equal(frames.length, 31);
  assert.equal(frames[0], "0630");
  assert.equal(frames.at(-1), "1130");
  assert.equal(new Set(frames).size, frames.length);
});
