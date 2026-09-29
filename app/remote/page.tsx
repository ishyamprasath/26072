import { Player } from "../player";
import { readCaseMeta } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function RemotePage({ searchParams }: { searchParams: Promise<{ room?: string }> }) {
  const { room } = await searchParams;
  const meta = await readCaseMeta();
  return <Player mode={room ? "remote" : "local"} initialRoomId={room ?? ""} initialMeta={meta} phone />;
}
