import { Player } from "./player";
import { readCaseMeta } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function Page() {
  const meta = await readCaseMeta();
  return <Player mode="local" initialMeta={meta} />;
}
