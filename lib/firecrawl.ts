import { getDocumentProxy } from "unpdf";
import { firecrawlKey } from "./env";

const ROOTS = ["ndma.gov.in", "imd.gov.in"];

export function hostAllowed(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return ROOTS.some((root) => host === root || host.endsWith(`.${root}`));
  } catch {
    return false;
  }
}

export type ScrapedPage = { url: string; title: string; markdown: string };

async function firecrawlScrape(url: string): Promise<ScrapedPage> {
  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firecrawlKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
      timeout: 90000,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Firecrawl scrape failed with status ${response.status}`);
  const body = (await response.json()) as {
    success?: boolean;
    data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string } };
  };
  const markdown = body.data?.markdown?.trim() ?? "";
  const source = body.data?.metadata?.sourceURL || url;
  if (!body.success || markdown.length < 40) throw new Error("Firecrawl returned no page text.");
  if (!hostAllowed(source)) throw new Error("Firecrawl returned a page outside the guidance allowlist.");
  return {
    url: source,
    title: body.data?.metadata?.title?.trim() || source,
    markdown,
  };
}

function htmlText(html: string): { title: string; text: string } {
  const title = html.match(/<title[^>]*>([^<]{1,180})<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  return { title, text };
}

async function pdfText(data: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(data);
  const pageCount = Math.min(pdf.numPages, 12);
  const parts: string[] = [];
  for (let number = 1; number <= pageCount; number += 1) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => (item && typeof item === "object" && "str" in item && typeof item.str === "string" ? item.str : ""))
      .join(" ");
    parts.push(line);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

async function fetchAllowlisted(url: string): Promise<ScrapedPage> {
  const response = await fetch(url, {
    headers: { "User-Agent": "sih26072-research/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Public page failed with status ${response.status}`);
  if (!hostAllowed(response.url)) throw new Error("Public page redirected outside the guidance allowlist.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 8_000_000) throw new Error("Public page is larger than 8 MB.");
  const type = (response.headers.get("content-type") ?? "").toLowerCase();
  const pdf = type.includes("pdf") || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
  if (pdf) {
    const text = await pdfText(bytes);
    if (text.length < 40) throw new Error("Public PDF had no extractable text.");
    const name = decodeURIComponent(new URL(response.url).pathname.split("/").pop() || "guidance.pdf");
    console.log(`guidance direct pdf host=${new URL(response.url).hostname} chars=${text.length}`);
    return { url: response.url, title: name, markdown: text.slice(0, 20000) };
  }
  const parsed = htmlText(new TextDecoder("utf8", { fatal: false }).decode(bytes));
  if (parsed.text.length < 40) throw new Error("Public page had no text.");
  console.log(`guidance direct html host=${new URL(response.url).hostname} chars=${parsed.text.length}`);
  return { url: response.url, title: parsed.title || response.url, markdown: parsed.text.slice(0, 20000) };
}

export async function scrapeMarkdown(url: string): Promise<ScrapedPage> {
  if (!hostAllowed(url)) throw new Error("Host is not on the guidance allowlist.");
  try {
    return await firecrawlScrape(url);
  } catch (error) {
    try {
      return await fetchAllowlisted(url);
    } catch (direct) {
      const first = error instanceof Error ? error.message : "Firecrawl scrape failed";
      const second = direct instanceof Error ? direct.message : "direct fetch failed";
      throw new Error(`${first}. ${second}`);
    }
  }
}

export async function searchPages(query: string): Promise<{ url: string; title: string }[]> {
  const response = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firecrawlKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit: 5 }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Firecrawl search failed with status ${response.status}`);
  const body = (await response.json()) as { data?: { url?: string; title?: string }[] };
  return (body.data ?? []).flatMap((row) => {
    if (!row.url || !hostAllowed(row.url)) return [];
    return [{ url: row.url, title: row.title || row.url }];
  });
}
