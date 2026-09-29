import { NextResponse } from "next/server";
import { runBrief } from "@/lib/agent";
import { findDistrict } from "@/lib/districts";
import { LEADS } from "@/lib/grid";
import type { Lang } from "@/lib/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const language: Lang = url.searchParams.get("language") === "hi" ? "hi" : "en";
  const leadValue = Number(url.searchParams.get("lead") ?? 60);
  const lead = (LEADS as readonly number[]).includes(leadValue) ? leadValue : 60;
  const district = url.searchParams.get("district");
  const districtId = district ? findDistrict(district)?.id ?? null : null;
  const question = url.searchParams.get("q")?.slice(0, 500)
    || (language === "hi" ? "इस लीड पर जिला अधिकारी को क्या करना चाहिए?" : "What should a district officer do at this lead?");
  const brief = await runBrief({ text: question, language, lead, districtId });
  if (brief.kind === "command") return NextResponse.json({ command: brief.command });
  return NextResponse.json({ text: brief.text, sources: brief.sources, fallback: brief.fallback });
}
