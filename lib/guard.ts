export function hasDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

export function disclaimer(language: "en" | "hi"): string {
  if (language === "hi") return "यह शोध प्रोटोटाइप है। यह भारत मौसम विज्ञान विभाग की चेतावनी नहीं है।";
  return "This is a research prototype. It is not an India Meteorological Department warning.";
}

export function withDisclaimer(text: string, language: "en" | "hi"): string {
  const line = disclaimer(language);
  if (text.includes("India Meteorological Department") || text.includes("भारत मौसम विज्ञान विभाग")) return text.trim();
  return `${text.trim()} ${line}`;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

export function unknownUrls(text: string, allowed: string[]): string[] {
  const permit = new Set(allowed.map(normalizeUrl));
  const found = text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [];
  return found.map((url) => url.replace(/[.,;:]+$/g, "")).filter((url) => !permit.has(normalizeUrl(url)));
}

export function decimalsMissingFrom(text: string, source: string): string[] {
  const known = (source.match(/\d+\.\d+/g) ?? []).map(Number);
  const found = text.match(/\d+\.\d+/g) ?? [];
  return found.filter((raw) => {
    const value = Number(raw);
    return !known.some((item) => Math.abs(item - value) <= 0.011);
  });
}
