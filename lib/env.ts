import { readFileSync } from "node:fs";
import path from "node:path";

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  try {
    const text = readFileSync(path.join(process.cwd(), ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // The Next.js server loads .env on its own.
  }
}

export function requireEnv(name: string): string {
  loadEnv();
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

export function nvidiaSettings(): { key: string; chatModel: string; embedModel: string; base: string } {
  loadEnv();
  const key = requireEnv("NVIDIA_API_KEY");
  const chatModel = process.env.NVIDIA_MODEL_RAG || process.env.NVIDIA_MODEL_TEXT;
  const embedModel = process.env.NVIDIA_MODEL_EMBED;
  if (!chatModel) throw new Error("Missing NVIDIA_MODEL_RAG or NVIDIA_MODEL_TEXT in .env");
  if (!embedModel) throw new Error("Missing NVIDIA_MODEL_EMBED in .env");
  return { key, chatModel, embedModel, base: "https://integrate.api.nvidia.com/v1" };
}

export function firecrawlKey(): string {
  return requireEnv("FIRECRAWL_API_KEY");
}
