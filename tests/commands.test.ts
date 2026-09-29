import assert from "node:assert/strict";
import test from "node:test";
import { parseCommand } from "../lib/commands";

test("english and hindi phrases map to the same commands as the buttons", () => {
  assert.deepEqual(parseCommand("show 60 minutes"), { op: "set_lead", minutes: 60 });
  assert.deepEqual(parseCommand("60 मिनट दिखाओ"), { op: "set_lead", minutes: 60 });
  assert.equal(parseCommand("play").op, "play");
  assert.equal(parseCommand("चलाओ").op, "play");
  assert.deepEqual(parseCommand("बिजली की परत दिखाओ"), { op: "toggle_layer", layer: "lightning", on: true });
  assert.deepEqual(parseCommand("zoom Ranchi"), { op: "zoom_district", name: "ranchi" });
  assert.equal(parseCommand("what should farmers do").op, "ask");
  assert.equal(parseCommand("what should Ranchi farmers do").op, "ask");
  assert.equal(parseCommand("forecast for gaya").op, "ask");
  assert.deepEqual(parseCommand("gaya"), { op: "zoom_district", name: "gaya" });
  assert.deepEqual(parseCommand("रांची"), { op: "zoom_district", name: "रांची" });
});
