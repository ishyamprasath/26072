import { randomBytes } from "node:crypto";
import { defaultView, type ViewState } from "./view";

export type Room = { id: string; view: ViewState; updatedAt: number };

function store(): Map<string, Room> {
  const globalStore = globalThis as typeof globalThis & { __sihRooms?: Map<string, Room> };
  if (!globalStore.__sihRooms) globalStore.__sihRooms = new Map();
  return globalStore.__sihRooms;
}

export function createRoom(): Room {
  const room = { id: randomBytes(4).toString("hex"), view: defaultView(), updatedAt: Date.now() };
  store().set(room.id, room);
  return room;
}

export function readRoom(id: string): Room | null {
  return store().get(id) ?? null;
}

export function writeRoom(id: string, view: ViewState, updatedAt: number): Room | null {
  const current = store().get(id);
  if (!current) return null;
  if (updatedAt < current.updatedAt) return current;
  const next = { id, view, updatedAt };
  store().set(id, next);
  return next;
}
