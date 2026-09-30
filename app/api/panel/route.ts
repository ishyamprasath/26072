import { readLead } from "@/lib/case-files";
import { renderPanel, type PanelName } from "@/lib/panels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  const lead = Number(url.searchParams.get("lead"));
  const caseId = url.searchParams.get("case") ?? undefined;
  if (name !== "obs" && name !== "model" && name !== "flow" && name !== "persist") {
    return new Response("Unknown panel", { status: 400 });
  }
  const frames = await readLead(lead, caseId);
  if (!frames) return new Response("Case not ready", { status: 404 });
  const png = renderPanel({
    name: name as PanelName,
    grid: frames.meta.grid,
    showIr: name === "obs" && url.searchParams.get("ir") === "1",
    ir: frames.ir,
    model: frames.model,
    mask: name === "obs" ? frames.obs : name === "flow" ? frames.flow : name === "persist" ? frames.persist : undefined,
  });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
