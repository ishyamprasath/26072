export type AppCommand =
  | { op: "set_lead"; minutes: number }
  | { op: "play" }
  | { op: "pause" }
  | { op: "compare"; baseline: "optical_flow" | "persistence" }
  | { op: "toggle_layer"; layer: "obs" | "model" | "ir" | "lightning"; on: boolean }
  | { op: "zoom_district"; name: string }
  | { op: "set_language"; code: "en" | "hi" }
  | { op: "ask"; text: string };

const LEAD_MINUTES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];

const DISTRICT =
  /(ranchi|patna|kolkata|bhubaneswar|guwahati|jamshedpur|siliguri|gaya|rourkela|bhagalpur|cuttack|shillong|agartala|malda|asansol|hazaribagh|रांची|पटना|कोलकाता|भुवनेश्वर|गुवाहाटी|जमशेदपुर|सिलीगुड़ी|गया|राउरकेला|भागलपुर|कटक|शिलांग|अगरतला|मालदा|आसनसोल|हज़ारीबाग|हजारीबाग)/;

export function mentionedDistrict(raw: string): string | null {
  return raw.trim().toLowerCase().match(DISTRICT)?.[1] ?? null;
}

export function parseCommand(raw: string): AppCommand {
  const text = raw.trim().toLowerCase();
  if (!text) return { op: "ask", text: raw };

  if (/(^|\s)(pause|stop|रुको|रोकें|रोको)(\s|$)/.test(text)) return { op: "pause" };
  if (/(^|\s)(play|start|चलाओ|चलाएँ|चलाएं)(\s|$)/.test(text)) return { op: "play" };

  if (text.includes("हिंदी") || text.includes("hindi")) return { op: "set_language", code: "hi" };
  if (text.includes("अंग्रे") || text.includes("english")) return { op: "set_language", code: "en" };

  if (text.includes("बिजली") || text.includes("lightning")) {
    return { op: "toggle_layer", layer: "lightning", on: true };
  }
  if (text.includes("infrared") || text.includes("अवरक्त")) return { op: "toggle_layer", layer: "ir", on: true };
  if (text.includes("persistence") || text.includes("स्थाय")) return { op: "compare", baseline: "persistence" };
  if (text.includes("flow") || text.includes("advection") || text.includes("ऑप्टिकल") || text.includes("optical")) {
    return { op: "compare", baseline: "optical_flow" };
  }

  const leadMatch = text.match(/(\d{2,3})/);
  if (leadMatch && (text.includes("min") || text.includes("मिनट") || text.includes("lead") || text.includes("show") || text.includes("दिखा"))) {
    const minutes = nearestLead(Number(leadMatch[1]));
    return { op: "set_lead", minutes };
  }

  const name = mentionedDistrict(text);
  if (name) {
    const leftover = text.replace(name, "").replace(/[^\p{L}\p{N}]+/gu, "");
    const navigation = leftover.length === 0 || /(zoom|show|open|\bgo\b|दिखा|जाओ|खोल)/.test(text);
    const question = /(what|should|why|how|when|csi|pod|far|farmer|officer|क्या|कैसे|कब|क्यों|किसान|अधिकारी|करें|करना)/.test(text);
    if (navigation && !question) return { op: "zoom_district", name };
  }

  return { op: "ask", text: raw.trim() };
}

function nearestLead(minutes: number): number {
  return LEAD_MINUTES.reduce((best, lead) => (Math.abs(lead - minutes) < Math.abs(best - minutes) ? lead : best));
}
