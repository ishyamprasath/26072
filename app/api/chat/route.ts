import { runBrief } from "@/lib/agent";
import { LEADS } from "@/lib/grid";
import type { Lang } from "@/lib/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 4000) return new Response("Too large", { status: 400 });
  let body: { text?: string; language?: Lang; lead?: number; district?: string | null };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const text = body.text?.trim() ?? "";
  if (!text) return new Response("Missing text", { status: 400 });
  const language: Lang = body.language === "hi" ? "hi" : "en";
  const lead = typeof body.lead === "number" && (LEADS as readonly number[]).includes(body.lead) ? body.lead : 60;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        const brief = await runBrief(
          { text, language, lead, districtId: body.district ?? null },
          (token) => send({ type: "token", text: token }),
        );
        if (brief.kind === "command") send({ type: "command", command: brief.command });
        else if (brief.replace || brief.fallback) send({ type: "replace", text: brief.text });
        send({
          type: "done",
          sources: brief.kind === "brief" ? brief.sources : [],
          fallback: brief.kind === "brief" ? brief.fallback : false,
        });
      } catch {
        send({
          type: "replace",
          text: language === "hi" ? "उत्तर नहीं बन सका।" : "The reply could not be built.",
        });
        send({ type: "done", sources: [], fallback: true });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
  });
}
