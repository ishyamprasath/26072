import { loadEnv } from "../lib/env";
import { markPipelineError, runPipeline } from "../lib/pipeline";

async function main(): Promise<void> {
  loadEnv();
  const only = process.argv.slice(2).filter((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
  try {
    await runPipeline(only.length ? only : undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline failed";
    await markPipelineError(message);
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
