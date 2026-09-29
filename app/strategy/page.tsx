import { StrategyView } from "./view";
import { readCaseMeta } from "@/lib/pipeline";
import { readCorpus } from "@/lib/corpus";

export const dynamic = "force-dynamic";

export default async function StrategyPage() {
  const [meta, corpus] = await Promise.all([readCaseMeta(), readCorpus()]);
  return (
    <StrategyView
      meta={meta}
      indexed={Boolean(corpus?.chunks.length)}
      pages={corpus?.pages.map((page) => ({ url: page.url, title: page.title })) ?? []}
    />
  );
}
