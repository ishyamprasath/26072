import { loadEnv } from "../lib/env";
import { buildCorpus } from "../lib/corpus";

async function main(): Promise<void> {
  loadEnv();
  await buildCorpus();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
