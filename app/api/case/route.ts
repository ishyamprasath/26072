import { NextResponse } from "next/server";
import { readCaseMeta } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const caseId = url.searchParams.get("case") ?? undefined;
  const meta = await readCaseMeta(caseId);
  if (!meta) return NextResponse.json({ ready: false });
  return NextResponse.json({ ready: true, meta });
}
