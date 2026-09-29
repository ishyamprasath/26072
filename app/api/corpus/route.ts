import { NextResponse } from "next/server";
import { buildCorpus, readCorpus } from "@/lib/corpus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const index = await readCorpus();
  if (!index) return NextResponse.json({ ready: false });
  return NextResponse.json({
    ready: true,
    builtAt: index.builtAt,
    pages: index.pages,
    skipped: index.skipped,
    chunks: index.chunks.length,
  });
}

export async function POST() {
  try {
    const index = await buildCorpus();
    return NextResponse.json({ ready: true, builtAt: index.builtAt, pages: index.pages.length, chunks: index.chunks.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Corpus build failed";
    return NextResponse.json({ ready: false, error: message }, { status: 502 });
  }
}
