import type { AppCommand } from "./commands";
import { findDistrict } from "./districts";
import { LEADS } from "./grid";

export type Lang = "en" | "hi";

export type ViewState = {
  lead: number;
  playing: boolean;
  compare: "optical_flow" | "persistence";
  layers: { obs: boolean; model: boolean; ir: boolean; lightning: boolean };
  district: string | null;
  language: Lang;
};

export function defaultView(): ViewState {
  return {
    lead: 60,
    playing: false,
    compare: "optical_flow",
    layers: { obs: true, model: true, ir: true, lightning: false },
    district: null,
    language: "en",
  };
}

export function applyCommand(view: ViewState, command: AppCommand): ViewState {
  if (command.op === "set_lead") {
    return (LEADS as readonly number[]).includes(command.minutes) ? { ...view, lead: command.minutes } : view;
  }
  if (command.op === "play") return { ...view, playing: true };
  if (command.op === "pause") return { ...view, playing: false };
  if (command.op === "compare") return { ...view, compare: command.baseline };
  if (command.op === "toggle_layer") return { ...view, layers: { ...view.layers, [command.layer]: command.on } };
  if (command.op === "set_language") return { ...view, language: command.code };
  if (command.op === "zoom_district") {
    const district = findDistrict(command.name);
    return district ? { ...view, district: district.id } : view;
  }
  return view;
}

export function sanitizeView(input: unknown): ViewState | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<ViewState>;
  if (typeof raw.lead !== "number" || !(LEADS as readonly number[]).includes(raw.lead)) return null;
  if (raw.language !== "en" && raw.language !== "hi") return null;
  if (raw.compare !== "optical_flow" && raw.compare !== "persistence") return null;
  if (!raw.layers) return null;
  const district = !raw.district ? null : findDistrict(raw.district)?.id ?? null;
  if (raw.district && !district) return null;
  return {
    lead: raw.lead,
    playing: Boolean(raw.playing),
    compare: raw.compare,
    language: raw.language,
    district,
    layers: {
      obs: Boolean(raw.layers.obs),
      model: Boolean(raw.layers.model),
      ir: Boolean(raw.layers.ir),
      lightning: Boolean(raw.layers.lightning),
    },
  };
}
