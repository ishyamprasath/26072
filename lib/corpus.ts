import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hostAllowed, scrapeMarkdown, searchPages } from "./firecrawl";
import { embedTexts } from "./nvidia";

const INDEX_PATH = path.join(process.cwd(), "data", "corpus", "index.json");

const SEEDS = [
  "https://ndma.gov.in/sites/default/files/PDF/Technical%20Documents/Protocol-for-EWS-on-Thunderstorm-and-lighting.pdf",
  "https://sachet.ndma.gov.in/DosDont",
  "https://ndma.gov.in/sites/default/files/PDF/pocketbook-do-dont.pdf",
];

export type CorpusChunk = {
  id: string;
  url: string;
  title: string;
  text: string;
  embedding: number[];
};

export type CorpusIndex = {
  builtAt: string;
  pages: { url: string; title: string; chars: number }[];
  skipped: { url: string; reason: string }[];
  chunks: CorpusChunk[];
};

export type GuidanceHit = { url: string; title: string; text: string; score: number };

function cleanChunk(text: string): string {
  return text.replace(/[\u2010-\u2015]/g, ", ").replace(/\s+/g, " ").trim();
}

function chunksOf(markdown: string, limit: number): string[] {
  const parts = markdown
    .split(/\n{2,}/)
    .map((part) => cleanChunk(part))
    .filter((part) => part.length >= 80);
  const packed: string[] = [];
  const push = (text: string) => {
    const clean = cleanChunk(text).slice(0, 1000);
    if (clean.length >= 80 && packed.length < limit) packed.push(clean);
  };
  let current = "";
  for (const part of parts) {
    if (packed.length >= limit) break;
    if (part.length > 1000) {
      if (current) {
        push(current);
        current = "";
      }
      for (let start = 0; start < part.length && packed.length < limit; start += 1000) push(part.slice(start, start + 1000));
      continue;
    }
    if (`${current} ${part}`.trim().length > 1000) {
      push(current);
      current = part;
    } else {
      current = `${current} ${part}`.trim();
    }
  }
  if (current && packed.length < limit) push(current);
  return packed;
}

function chunkLimit(url: string): number {
  if (url.includes("Protocol-for-EWS")) return 12;
  return 6;
}

function cosine(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < length; i += 1) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }
  const denom = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return denom ? dot / denom : 0;
}

export async function readCorpus(): Promise<CorpusIndex | null> {
  try {
    return JSON.parse(await readFile(INDEX_PATH, "utf8")) as CorpusIndex;
  } catch {
    return null;
  }
}

export async function buildCorpus(): Promise<CorpusIndex> {
  const skipped: CorpusIndex["skipped"] = [];
  const urls = new Set(SEEDS);
  try {
    const found = await Promise.all([
      searchPages("thunderstorm lightning safety guidance site:ndma.gov.in"),
      searchPages("nowcast thunderstorm site:imd.gov.in"),
    ]);
    found.flat().forEach((page) => urls.add(page.url));
  } catch (error) {
    skipped.push({ url: "search", reason: error instanceof Error ? error.message : "search failed" });
  }

  const pages: { url: string; title: string; markdown: string }[] = [];
  const pending: { url: string; title: string; text: string }[] = [];
  for (const url of [...urls].filter(hostAllowed).slice(0, 6)) {
    if (pending.length >= 24) break;
    try {
      const page = await scrapeMarkdown(url);
      const pieces = chunksOf(page.markdown, Math.min(chunkLimit(page.url), 24 - pending.length));
      if (!pieces.length) {
        skipped.push({ url: page.url, reason: "Page had no usable paragraph." });
        continue;
      }
      pages.push(page);
      pieces.forEach((text) => pending.push({ url: page.url, title: page.title, text }));
      console.log(`corpus page host=${new URL(page.url).hostname} chars=${page.markdown.length} chunks=${pieces.length}`);
    } catch (error) {
      skipped.push({ url, reason: error instanceof Error ? error.message : "scrape failed" });
      console.log(`corpus skip status=${error instanceof Error ? error.message : "failed"}`);
    }
  }
  if (!pages.length) throw new Error("No guidance pages could be scraped.");
  const selected = pending.slice(0, 24);
  const embeddings = await embedTexts(selected.map((item) => item.text), "passage");
  const chunks: CorpusChunk[] = selected.map((item, index) => ({
    id: `c${index + 1}`,
    url: item.url,
    title: item.title,
    text: item.text,
    embedding: embeddings[index],
  }));
  const index: CorpusIndex = {
    builtAt: new Date().toISOString(),
    pages: pages.map((page) => ({ url: page.url, title: page.title, chars: page.markdown.length })),
    skipped,
    chunks,
  };
  await mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await writeFile(INDEX_PATH, JSON.stringify(index));
  console.log(`corpus chunks=${chunks.length} pages=${pages.length}`);
  return index;
}

export async function searchCorpus(query: string, limit = 4): Promise<GuidanceHit[]> {
  const index = await readCorpus();
  if (!index?.chunks.length) return [];
  const [vector] = await embedTexts([query.slice(0, 4000)], "query");
  return index.chunks
    .map((chunk) => ({
      url: chunk.url,
      title: chunk.title,
      text: chunk.text,
      score: cosine(vector, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
