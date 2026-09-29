import { mentionedDistrict, parseCommand, type AppCommand } from "./commands";
import { readCorpus, searchCorpus } from "./corpus";
import { findDistrict } from "./districts";
import { formatScore, round2 } from "./format";
import { decimalsMissingFrom, disclaimer, hasDevanagari, unknownUrls, withDisclaimer } from "./guard";
import { readCaseMeta, type CaseMeta, type LeadScore, type MethodName } from "./pipeline";
import { chatComplete, chatStream, type ChatMessage } from "./nvidia";
import type { Lang } from "./view";

export type Source = { url: string; title: string };

export type BriefInput = {
  text: string;
  language: Lang;
  lead: number;
  districtId: string | null;
};

export type Brief =
  | { kind: "command"; command: AppCommand }
  | { kind: "brief"; text: string; sources: Source[]; fallback: boolean; replace: boolean };

type ScoreFact = { pod: number; far: number; csi: number; hits: number; misses: number; falseAlarms: number } | null;

type DistrictFact = { id: string; name: string; nameHi: string; max: number; mean: number; areaKm2: number };

export type Facts = {
  language: Lang;
  question: string;
  caseReady: boolean;
  demoDate: string | null;
  testDate: string | null;
  analysisUtc: string | null;
  lead: number;
  threshold: number | null;
  stormBtK: number | null;
  label: string | null;
  lightningObserved: false;
  grid: string | null;
  district: DistrictFact | null;
  exposed: DistrictFact[];
  test: Record<MethodName, ScoreFact>;
  demo: Record<MethodName, ScoreFact>;
  guidance: { url: string; title: string; excerpt: string }[];
  guidanceNote: string;
};

const METHODS: MethodName[] = ["model", "persistence", "optical_flow"];

function scoreFact(meta: CaseMeta, split: "test" | "demo", method: MethodName, lead: number): ScoreFact {
  const row = meta.scores[split][method].all.find((item) => item.lead === lead);
  if (!row) return null;
  return { pod: row.pod, far: row.far, csi: row.csi, hits: row.hits, misses: row.misses, falseAlarms: row.falseAlarms };
}

function denom(row: LeadScore | ScoreFact | null): boolean {
  return Boolean(row && row.hits + row.misses + row.falseAlarms > 0);
}

function districtFact(meta: CaseMeta, lead: number, id: string): DistrictFact | null {
  const row = meta.districtsByLead[String(lead)]?.find((item) => item.id === id);
  return row ? { id: row.id, name: row.name, nameHi: row.nameHi, max: row.max, mean: row.mean, areaKm2: row.areaKm2 } : null;
}

export async function collectFacts(input: BriefInput): Promise<Facts> {
  const meta = await readCaseMeta();
  const named = mentionedDistrict(input.text);
  const namedDistrict = named ? findDistrict(named) : undefined;
  const districtId = namedDistrict?.id ?? input.districtId;
  let guidance: Facts["guidance"] = [];
  let guidanceNote = "The guidance index has not been built yet.";
  try {
    const index = await readCorpus();
    if (index?.chunks.length) {
      const hits = await searchCorpus(`${input.text} thunderstorm lightning safety`, 6);
      const unique: Facts["guidance"] = [];
      for (const hit of hits) {
        if (unique.some((item) => item.url === hit.url)) continue;
        unique.push({ url: hit.url, title: hit.title, excerpt: hit.text.replace(/\s+/g, " ").slice(0, 320) });
        if (unique.length === 3) break;
      }
      guidance = unique;
      guidanceNote = unique.length ? "" : "No guidance chunk matched this question.";
    }
  } catch {
    guidanceNote = "Guidance search failed, so no page is quoted.";
  }

  const emptyScores = { model: null, persistence: null, optical_flow: null } as Record<MethodName, ScoreFact>;
  if (!meta) {
    return {
      language: input.language,
      question: input.text,
      caseReady: false,
      demoDate: null,
      testDate: null,
      analysisUtc: null,
      lead: input.lead,
      threshold: null,
      stormBtK: null,
      label: null,
      lightningObserved: false,
      grid: null,
      district: null,
      exposed: [],
      test: emptyScores,
      demo: emptyScores,
      guidance,
      guidanceNote,
    };
  }

  const district = districtId ? districtFact(meta, input.lead, districtId) : null;
  const exposed = (meta.districtsByLead[String(input.lead)] ?? []).filter((item) => item.max >= meta.threshold);
  return {
    language: input.language,
    question: input.text,
    caseReady: true,
    demoDate: meta.demoDate,
    testDate: meta.testDate,
    analysisUtc: meta.analysisUtc,
    lead: input.lead,
    threshold: meta.threshold,
    stormBtK: meta.stormBtK,
    label: meta.label,
    lightningObserved: false,
    grid: `${meta.grid.rows} by ${meta.grid.cols} Himawari pixels`,
    district,
    exposed,
    test: {
      model: scoreFact(meta, "test", "model", input.lead),
      persistence: scoreFact(meta, "test", "persistence", input.lead),
      optical_flow: scoreFact(meta, "test", "optical_flow", input.lead),
    },
    demo: {
      model: scoreFact(meta, "demo", "model", input.lead),
      persistence: scoreFact(meta, "demo", "persistence", input.lead),
      optical_flow: scoreFact(meta, "demo", "optical_flow", input.lead),
    },
    guidance,
    guidanceNote,
  };
}

function hindiNote(note: string): string {
  if (note.startsWith("The guidance index")) return "मार्गदर्शन सूची अभी नहीं बनी है।";
  if (note.startsWith("Guidance search failed")) return "मार्गदर्शन खोज असफल रही, इसलिए कोई पृष्ठ उद्धृत नहीं है।";
  if (note.startsWith("No guidance")) return "इस प्रश्न से कोई मार्गदर्शन अंश नहीं मिला।";
  return note;
}

function lineScore(label: string, row: ScoreFact, language: Lang): string {
  if (!row || !denom(row)) {
    return language === "hi" ? `${label}: इस हिस्से में कोई सेल नहीं।` : `${label}: no cells in this slice.`;
  }
  const pod = formatScore(row.pod, row.hits, row.misses, row.falseAlarms);
  const far = formatScore(row.far, row.hits, row.misses, row.falseAlarms);
  const csi = formatScore(row.csi, row.hits, row.misses, row.falseAlarms);
  return `${label}: POD ${pod}, FAR ${far}, CSI ${csi} (${row.hits}/${row.misses}/${row.falseAlarms}).`;
}

export function templateFromFacts(facts: Facts): string {
  const hi = facts.language === "hi";
  const lines: string[] = [];
  if (!facts.caseReady) {
    lines.push(hi ? "केस फाइल इस मशीन पर नहीं है, इसलिए कोई प्रायिकता या अंक नहीं दिया जा रहा।" : "The case file is not on this machine, so no probability or score is stated.");
  } else {
    lines.push(
      hi
        ? `विश्लेषण ${facts.analysisUtc}, लीड +${facts.lead} मिनट। सीमा ${facts.threshold === null ? "" : round2(facts.threshold)}। लेबल: अवरक्त ${facts.stormBtK} K या उससे कम। ग्रिड ${facts.grid}।`
        : `Analysis ${facts.analysisUtc}, lead +${facts.lead} minutes. Threshold ${facts.threshold === null ? "" : round2(facts.threshold)}. Label: infrared at or below ${facts.stormBtK} K. Grid ${facts.grid}.`,
    );
    if (facts.district) {
      const name = hi ? facts.district.nameHi : facts.district.name;
      lines.push(
        hi
          ? `${name}: अधिकतम प्रायिकता ${round2(facts.district.max)}, औसत ${round2(facts.district.mean)}, सीमा से ऊपर क्षेत्र ${round2(facts.district.areaKm2)} वर्ग किमी।`
          : `${name}: max probability ${round2(facts.district.max)}, mean ${round2(facts.district.mean)}, area above the threshold ${round2(facts.district.areaKm2)} km2.`,
      );
    }
    if (facts.exposed.length) {
      const names = facts.exposed
        .map((item) => `${hi ? item.nameHi : item.name} ${round2(item.max)}`)
        .join(", ");
      lines.push(hi ? `सीमा पर या उससे ऊपर जिले: ${names}।` : `Districts at or above the threshold: ${names}.`);
    } else {
      lines.push(hi ? "इस लीड पर कोई सूचीबद्ध जिला सीमा तक नहीं पहुँचता।" : "No listed district reaches the threshold at this lead.");
    }
    lines.push(hi ? "परीक्षण दोपहर, सभी सेल:" : "Test afternoon, all cells:");
    METHODS.forEach((method) => lines.push(lineScore(method, facts.test[method], facts.language)));
    const model = facts.test.model;
    const flow = facts.test.optical_flow;
    if (denom(model) && denom(flow) && model && flow) {
      if (model.csi > flow.csi) lines.push(hi ? "इस लीड पर मॉडल का CSI ऑप्टिकल फ्लो से ऊपर है।" : "At this lead the model CSI is above optical flow.");
      else if (model.csi < flow.csi) lines.push(hi ? "इस लीड पर ऑप्टिकल फ्लो का CSI मॉडल से ऊपर है।" : "At this lead the optical flow CSI is above the model.");
      else lines.push(hi ? "इस लीड पर मॉडल और ऑप्टिकल फ्लो का CSI बराबर है।" : "At this lead the model and optical flow CSI are equal.");
    }
    if (facts.label) lines.push(facts.label);
  }
  if (facts.guidance.length) {
    facts.guidance.forEach((item) => lines.push(`${item.title}: ${item.excerpt} (${item.url})`));
  } else if (facts.guidanceNote) {
    lines.push(hi ? hindiNote(facts.guidanceNote) : facts.guidanceNote);
  }
  lines.push(hi ? "बिजली कौशल का दावा नहीं है।" : "Lightning skill is not claimed.");
  lines.push(disclaimer(facts.language));
  return lines.join(" ");
}

function messagesFor(facts: Facts): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "You write a short briefing for a research thunderstorm nowcast. Use only numbers, districts, and URLs that appear in the JSON. If language is hi, answer in Hindi Devanagari and keep POD, FAR, CSI, and digits unchanged. If language is en, answer in English. State that lightning skill is not claimed. Do not call this an official warning. If caseReady is false, do not invent a forecast.",
    },
    { role: "user", content: `${facts.question}\n${JSON.stringify(facts)}` },
  ];
}

export function acceptModelText(text: string, facts: Facts): boolean {
  if (unknownUrls(text, facts.guidance.map((item) => item.url)).length) return false;
  if (decimalsMissingFrom(text, JSON.stringify(facts)).length) return false;
  if (facts.language === "hi" && !hasDevanagari(text)) return false;
  return true;
}

export async function runBrief(input: BriefInput, onToken?: (token: string) => void): Promise<Brief> {
  const command = parseCommand(input.text);
  if (command.op !== "ask") return { kind: "command", command };
  const facts = await collectFacts(input);
  const template = templateFromFacts(facts);
  const sources = facts.guidance.map((item) => ({ url: item.url, title: item.title }));
  try {
    const messages = messagesFor(facts);
    const draft = onToken ? await chatStream(messages, 500, onToken) : await chatComplete(messages, 500);
    if (!acceptModelText(draft, facts)) return { kind: "brief", text: template, sources, fallback: true, replace: true };
    const text = withDisclaimer(draft, facts.language);
    if (text !== draft.trim() && onToken) onToken(` ${disclaimer(facts.language)}`);
    return { kind: "brief", text, sources, fallback: false, replace: false };
  } catch {
    return { kind: "brief", text: template, sources, fallback: true, replace: Boolean(onToken) };
  }
}
