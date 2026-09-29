import { NextResponse } from "next/server";
import { createRoom, readRoom, writeRoom } from "@/lib/rooms";
import { sanitizeView } from "@/lib/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const room = readRoom(id);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  return NextResponse.json(room);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { create?: boolean; id?: string; view?: unknown; updatedAt?: number };
  if (body.create) return NextResponse.json(createRoom());
  if (!body.id || typeof body.updatedAt !== "number") return NextResponse.json({ error: "Missing room" }, { status: 400 });
  const view = sanitizeView(body.view);
  if (!view) return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  const room = writeRoom(body.id, view, body.updatedAt);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  return NextResponse.json(room);
}
