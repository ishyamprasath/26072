import { ScoresView } from "./view";
import { readCaseMeta } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function ScoresPage() {
  const meta = await readCaseMeta();
  return <ScoresView meta={meta} />;
}
