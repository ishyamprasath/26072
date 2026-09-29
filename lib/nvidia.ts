import { nvidiaSettings } from "./env";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
      return "";
    })
    .join("");
}

async function postJson(path: string, body: unknown): Promise<Response> {
  const { key, base } = nvidiaSettings();
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
}

export async function embedTexts(texts: string[], inputType: "passage" | "query"): Promise<number[][]> {
  const { embedModel } = nvidiaSettings();
  const vectors: number[][] = [];
  for (const text of texts) {
    const response = await postJson("/embeddings", {
      model: embedModel,
      input: [text.slice(0, 4000)],
      input_type: inputType,
      modality: "text",
      embedding_type: "float",
      encoding_format: "float",
    });
    if (!response.ok) throw new Error(`NVIDIA embeddings failed with status ${response.status}`);
    const body = (await response.json()) as { data?: { embedding?: number[] }[] };
    const vector = body.data?.[0]?.embedding;
    if (!vector?.length) throw new Error("NVIDIA embeddings returned no vector.");
    vectors.push(vector);
  }
  return vectors;
}

export async function chatComplete(messages: ChatMessage[], maxTokens = 500): Promise<string> {
  const { chatModel } = nvidiaSettings();
  const response = await postJson("/chat/completions", {
    model: chatModel,
    messages,
    temperature: 0.2,
    max_tokens: maxTokens,
    stream: false,
  });
  if (!response.ok) throw new Error(`NVIDIA chat failed with status ${response.status}`);
  const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  const text = contentText(body.choices?.[0]?.message?.content).trim();
  if (!text) throw new Error("NVIDIA chat returned an empty reply.");
  return text;
}

export async function chatStream(messages: ChatMessage[], maxTokens: number, onToken: (token: string) => void): Promise<string> {
  const { chatModel } = nvidiaSettings();
  const response = await postJson("/chat/completions", {
    model: chatModel,
    messages,
    temperature: 0.2,
    max_tokens: maxTokens,
    stream: true,
  });
  if (!response.ok || !response.body) throw new Error(`NVIDIA chat failed with status ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as { choices?: { delta?: { content?: unknown }; message?: { content?: unknown } }[] };
        const token = contentText(json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content);
        if (!token) continue;
        full += token;
        onToken(token);
      } catch {
        // A partial JSON line is completed on the next read.
      }
    }
  }
  const text = full.trim();
  if (!text) throw new Error("NVIDIA chat returned an empty reply.");
  return text;
}
