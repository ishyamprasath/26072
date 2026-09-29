import { NextResponse } from "next/server";
import { readCaseMeta } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const meta = await readCaseMeta();
  if (!meta) return NextResponse.json({ ready: false });
  return NextResponse.json({ ready: true, meta });
}
