import assert from "node:assert/strict";
import test from "node:test";
import { inflateSync } from "node:zlib";
import { encodeRgbaPng } from "../lib/png";

test("a one pixel PNG round trips", () => {
  const png = encodeRgbaPng(1, 1, Uint8Array.from([255, 0, 0, 255]));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(png.readUInt32BE(16), 1);
  assert.equal(png.readUInt32BE(20), 1);
  let offset = 8;
  let inflated: Buffer | null = null;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IDAT") inflated = inflateSync(data);
    offset += 12 + length;
  }
  assert.deepEqual([...(inflated ?? [])], [0, 255, 0, 0, 255]);
});
