import { loadEnv } from "../lib/env";
import { scrapeMarkdown } from "../lib/firecrawl";
import { chatComplete, embedTexts } from "../lib/nvidia";

const PAGES = [
  "https://sachet.ndma.gov.in/DosDont",
  "https://ndma.gov.in/sites/default/files/PDF/pocketbook-do-dont.pdf",
];

async function main(): Promise<void> {
  loadEnv();
  const vectors = await embedTexts(["thunderstorm nowcast"], "query");
  console.log(`nvidia.embed ok dim=${vectors[0]?.length ?? 0}`);
  if (vectors[0]?.length !== 2048) throw new Error(`Expected embedding length 2048, got ${vectors[0]?.length ?? 0}`);
  const reply = await chatComplete([{ role: "user", content: "Reply with the single word ready." }], 16);
  console.log(`nvidia.chat ok chars=${reply.length}`);
  let scraped = false;
  let last = "no page";
  for (const url of PAGES) {
    try {
      const page = await scrapeMarkdown(url);
      console.log(`firecrawl.scrape ok host=${new URL(page.url).hostname} chars=${page.markdown.length}`);
      scraped = true;
      break;
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
  }
  if (!scraped) throw new Error(last);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
