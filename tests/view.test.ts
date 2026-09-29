import assert from "node:assert/strict";
import test from "node:test";
import { parseCommand } from "../lib/commands";
import { applyCommand, defaultView } from "../lib/view";

test("commands move the same view the buttons use", () => {
  const started = applyCommand(defaultView(), parseCommand("show 60 minutes"));
  assert.equal(started.lead, 60);
  const playing = applyCommand(started, parseCommand("play"));
  assert.equal(playing.playing, true);
  const zoomed = applyCommand(playing, parseCommand("zoom Ranchi"));
  assert.equal(zoomed.district, "ranchi");
  const hindi = applyCommand(zoomed, parseCommand("हिंदी"));
  assert.equal(hindi.language, "hi");
  const lightning = applyCommand(hindi, parseCommand("बिजली की परत दिखाओ"));
  assert.equal(lightning.layers.lightning, true);
});
