import QRCode from "qrcode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const text = new URL(request.url).searchParams.get("text") ?? "";
  if (!text || text.length > 500) return new Response("Missing text", { status: 400 });
  const png = await QRCode.toBuffer(text, {
    type: "png",
    width: 280,
    margin: 1,
    color: { dark: "#0e2744", light: "#ffffff" },
  });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
