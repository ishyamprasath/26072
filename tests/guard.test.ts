import assert from "node:assert/strict";
import test from "node:test";
import { acceptModelText, templateFromFacts, type Facts } from "../lib/agent";
import { decimalsMissingFrom, unknownUrls } from "../lib/guard";
import { hostAllowed } from "../lib/firecrawl";

const facts: Facts = {
  language: "en",
  question: "What is the score?",
  caseReady: true,
  demoDate: "2024-04-18",
  testDate: "2024-06-11",
  analysisUtc: "2024-04-18T08:30:00Z",
  lead: 60,
  threshold: 0.4,
  stormBtK: 240,
  label: "A cell is stormy when infrared brightness temperature is at or below 240 K.",
  lightningObserved: false,
  grid: "6 by 7 Himawari pixels",
  district: { id: "ranchi", name: "Ranchi", nameHi: "रांची", max: 0.62, mean: 0.41, areaKm2: 1200 },
  exposed: [],
  test: {
    model: { pod: 0.5, far: 0.25, csi: 0.4, hits: 2, misses: 2, falseAlarms: 1 },
    persistence: { pod: 0.25, far: 0.5, csi: 0.2, hits: 1, misses: 3, falseAlarms: 1 },
    optical_flow: { pod: 0.5, far: 0.5, csi: 0.33, hits: 2, misses: 2, falseAlarms: 2 },
  },
  demo: { model: null, persistence: null, optical_flow: null },
  guidance: [{ url: "https://ndma.gov.in/example", title: "NDMA note", excerpt: "Stay indoors when thunder starts." }],
  guidanceNote: "",
};

test("the template quotes the tool numbers and only the allowed page", () => {
  const text = templateFromFacts(facts);
  assert.match(text, /CSI 0\.40/);
  assert.match(text, /Ranchi: max probability 0\.62/);
  assert.match(text, /https:\/\/ndma\.gov\.in\/example/);
  assert.match(text, /India Meteorological Department/);
  assert.equal(unknownUrls(text, facts.guidance.map((item) => item.url)).length, 0);
});

test("a reply with a new link or a new decimal is rejected", () => {
  assert.equal(acceptModelText("CSI is 0.40. See https://ndma.gov.in/example", facts), true);
  assert.equal(acceptModelText("See https://example.com/storm", facts), false);
  assert.deepEqual(decimalsMissingFrom("CSI 0.99", JSON.stringify(facts)), ["0.99"]);
  assert.equal(acceptModelText("CSI is 0.99", facts), false);
});

test("guidance hosts stay on NDMA and IMD", () => {
  assert.equal(hostAllowed("https://sachet.ndma.gov.in/DosDont"), true);
  assert.equal(hostAllowed("https://mausam.imd.gov.in/imd_latest/contents/faq.php"), true);
  assert.equal(hostAllowed("https://example.com/imd"), false);
});
