import { loadEnv } from "../lib/env";

const base = process.env.CHECK_BASE ?? "http://127.0.0.1:8787";

type Failure = { name: string; detail: string };

const failures: Failure[] = [];
const notes: string[] = [];

function fail(name: string, detail: string): void {
  failures.push({ name, detail });
  console.log(`FAIL ${name}: ${detail}`);
}

function pass(name: string, detail: string): void {
  notes.push(`${name}: ${detail}`);
  console.log(`ok ${name}: ${detail}`);
}

function secrets(): string[] {
  loadEnv();
  return ["NVIDIA_API_KEY", "FIRECRAWL_API_KEY"]
    .map((name) => process.env[name] ?? "")
    .filter((value) => value.length > 8);
}

function assertClean(name: string, body: string): void {
  if (body.includes("\u2014") || body.includes("\u2013")) fail(name, "response contains an em dash or en dash");
  for (const secret of secrets()) {
    if (body.includes(secret)) fail(name, "response contained a secret");
  }
}

async function textResponse(path: string, init?: RequestInit): Promise<{ status: number; body: string; type: string }> {
  const response = await fetch(`${base}${path}`, init);
  const body = await response.text();
  return { status: response.status, body, type: response.headers.get("content-type") ?? "" };
}

async function bytesResponse(path: string): Promise<{ status: number; bytes: Buffer; type: string }> {
  const response = await fetch(`${base}${path}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, bytes, type: response.headers.get("content-type") ?? "" };
}

function png(bytes: Buffer): boolean {
  return bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

type SseEvent = { type?: string; command?: { op?: string; minutes?: number }; text?: string; sources?: { url?: string }[]; fallback?: boolean };

async function readSse(path: string, init: RequestInit): Promise<SseEvent[]> {
  const response = await fetch(`${base}${path}`, init);
  if (!response.ok) throw new Error(`status ${response.status}`);
  const raw = await response.text();
  assertClean("chat-body", raw);
  const events: SseEvent[] = [];
  for (const block of raw.split("\n\n")) {
    const line = block.split("\n").find((item) => item.startsWith("data:"));
    if (!line) continue;
    events.push(JSON.parse(line.slice(5).trim()) as SseEvent);
  }
  return events;
}

async function main(): Promise<void> {
  const pages = ["/", "/scores", "/strategy", "/display", "/remote", "/remote?room=deadbeef"];
  for (const path of pages) {
    const page = await textResponse(path);
    assertClean(path, page.body);
    if (page.status !== 200) {
      fail(path, `status ${page.status}`);
      continue;
    }
    if (!page.body.includes("Thunderstorm nowcast")) fail(path, "missing product title");
    if (!page.body.includes("India Meteorological Department")) fail(path, "missing disclaimer");
    pass(path, `status 200 chars=${page.body.length}`);
  }

  const status = await textResponse("/api/status");
  assertClean("/api/status", status.body);
  const statusJson = JSON.parse(status.body) as { state?: string; step?: string };
  if (status.status !== 200 || !statusJson.state) fail("/api/status", `status ${status.status}`);
  else pass("/api/status", `state=${statusJson.state} step=${statusJson.step ?? ""}`);

  const caseFile = await textResponse("/api/case");
  assertClean("/api/case", caseFile.body);
  const caseJson = JSON.parse(caseFile.body) as {
    ready?: boolean;
    meta?: {
      grid?: { rows?: number; cols?: number };
      threshold?: number;
      stormBtK?: number;
      activeFraction?: Record<string, number>;
      scores?: { test?: { model?: { all?: { lead: number; csi: number; hits: number; misses: number; falseAlarms: number }[] } } };
      elevationNote?: string;
      demoDate?: string;
    };
  };
  if (caseFile.status !== 200 || typeof caseJson.ready !== "boolean") fail("/api/case", `status ${caseFile.status}`);
  else pass("/api/case", `ready=${caseJson.ready}`);

  const corpus = await textResponse("/api/corpus");
  assertClean("/api/corpus", corpus.body);
  const corpusJson = JSON.parse(corpus.body) as { ready?: boolean; chunks?: number; pages?: { url: string }[] };
  if (corpus.status !== 200 || typeof corpusJson.ready !== "boolean") fail("/api/corpus", `status ${corpus.status}`);
  else pass("/api/corpus", `ready=${corpusJson.ready} chunks=${corpusJson.chunks ?? 0} pages=${corpusJson.pages?.length ?? 0}`);

  const missingQr = await textResponse("/api/qr");
  if (missingQr.status !== 400) fail("/api/qr-missing", `status ${missingQr.status}`);
  else pass("/api/qr-missing", "status 400");

  const qr = await bytesResponse(`/api/qr?text=${encodeURIComponent(`${base}/remote?room=abc`)}`);
  if (qr.status !== 200 || !qr.type.includes("image/png") || !png(qr.bytes)) fail("/api/qr", `status ${qr.status} type=${qr.type} bytes=${qr.bytes.length}`);
  else pass("/api/qr", `png bytes=${qr.bytes.length}`);

  const badPanel = await textResponse("/api/panel?name=nope&lead=60");
  if (badPanel.status !== 400) fail("/api/panel-bad", `status ${badPanel.status}`);
  else pass("/api/panel-bad", "status 400");

  const panel = await bytesResponse("/api/panel?name=obs&lead=60&ir=1");
  if (caseJson.ready) {
    if (panel.status !== 200 || !png(panel.bytes)) fail("/api/panel", `status ${panel.status} bytes=${panel.bytes.length}`);
    else pass("/api/panel", `png bytes=${panel.bytes.length}`);
    const home = await textResponse("/");
    if (!home.body.includes("2024-04-18") || !home.body.includes("n/a")) fail("/held-out", "player did not render the date or n/a");
    else pass("/held-out", "date and n/a");
    const scoresPage = await textResponse("/scores");
    const compact = scoresPage.body.replace(/<!-- -->/g, "");
    if (!compact.includes("218/4/56") || !compact.includes("2024-06-11")) fail("/scores-counts", "missing test counts");
    else pass("/scores-counts", "218/4/56");
    for (const name of ["model", "flow", "persist"]) {
      const frame = await bytesResponse(`/api/panel?name=${name}&lead=60`);
      if (frame.status !== 200 || !png(frame.bytes)) fail(`/api/panel-${name}`, `status ${frame.status}`);
      else pass(`/api/panel-${name}`, `png bytes=${frame.bytes.length}`);
    }
  } else if (panel.status !== 404) {
    fail("/api/panel-empty", `expected 404 before the case exists, got ${panel.status}`);
  } else {
    pass("/api/panel-empty", "status 404 before the case exists");
  }

  const created = await textResponse("/api/room", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ create: true }),
  });
  assertClean("/api/room-create", created.body);
  const room = JSON.parse(created.body) as { id?: string; view?: { lead?: number } };
  if (created.status !== 200 || !room.id || room.view?.lead !== 60) fail("/api/room-create", created.body.slice(0, 180));
  else pass("/api/room-create", `id length=${room.id.length}`);

  const postedAt = Date.now();
  const posted = await textResponse("/api/room", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: room.id,
      updatedAt: postedAt,
      view: {
        lead: 90,
        playing: false,
        compare: "persistence",
        language: "hi",
        district: "ranchi",
        layers: { obs: true, model: true, ir: false, lightning: true },
      },
    }),
  });
  const postedJson = JSON.parse(posted.body) as { view?: { lead?: number; language?: string; district?: string; compare?: string } };
  if (posted.status !== 200 || postedJson.view?.lead !== 90 || postedJson.view.language !== "hi" || postedJson.view.district !== "ranchi") {
    fail("/api/room-write", posted.body.slice(0, 180));
  } else pass("/api/room-write", "lead 90 hindi ranchi persistence");

  const readBack = await textResponse(`/api/room?id=${room.id}`);
  const readJson = JSON.parse(readBack.body) as { view?: { lead?: number } };
  if (readBack.status !== 200 || readJson.view?.lead !== 90) fail("/api/room-read", readBack.body.slice(0, 180));
  else pass("/api/room-read", "lead 90");

  const missingRoom = await textResponse("/api/room?id=nosuch");
  if (missingRoom.status !== 404) fail("/api/room-missing", `status ${missingRoom.status}`);
  else pass("/api/room-missing", "status 404");

  const commandEvents = await readSse("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "show 60 minutes", language: "en", lead: 30, district: null }),
  });
  const command = commandEvents.find((event) => event.type === "command");
  if (command?.command?.op !== "set_lead" || command.command.minutes !== 60) fail("/api/chat-command", JSON.stringify(commandEvents));
  else pass("/api/chat-command", "set_lead 60");

  const askEvents = await readSse("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "What should Ranchi farmers do at this lead?", language: "en", lead: 60, district: "ranchi" }),
  });
  const replace = askEvents.find((event) => event.type === "replace");
  const tokens = askEvents.filter((event) => event.type === "token").map((event) => event.text ?? "").join("");
  const answer = (replace?.text ?? tokens).trim();
  const done = askEvents.find((event) => event.type === "done");
  if (!done) fail("/api/chat-ask", "missing done event");
  else if (!answer.includes("India Meteorological Department") && !answer.includes("भारत मौसम विज्ञान विभाग")) fail("/api/chat-ask", "missing disclaimer");
  else if (answer.includes("\u2014") || answer.includes("\u2013")) fail("/api/chat-ask", "dash in answer");
  else pass("/api/chat-ask", `chars=${answer.length} fallback=${Boolean(done.fallback)} sources=${done.sources?.length ?? 0}`);

  for (const language of ["en", "hi"] as const) {
    const strategy = await textResponse(`/api/strategy?lead=60&district=ranchi&language=${language}`);
    assertClean(`/api/strategy-${language}`, strategy.body);
    if (strategy.status !== 200) {
      fail(`/api/strategy-${language}`, `status ${strategy.status}`);
      continue;
    }
    const body = JSON.parse(strategy.body) as { text?: string; fallback?: boolean; sources?: { url: string }[] };
    const text = body.text ?? "";
    if (language === "en" && !text.includes("India Meteorological Department")) fail(`/api/strategy-${language}`, "missing disclaimer");
    if (language === "hi" && !/[\u0900-\u097F]/.test(text)) fail(`/api/strategy-${language}`, "missing Devanagari");
    if (language === "hi" && !text.includes("भारत मौसम विज्ञान विभाग")) fail(`/api/strategy-${language}`, "missing Hindi disclaimer");
    if (caseJson.ready && language === "en" && !text.includes("Ranchi")) fail(`/api/strategy-${language}`, "missing district");
    pass(`/api/strategy-${language}`, `chars=${text.length} fallback=${Boolean(body.fallback)} sources=${body.sources?.length ?? 0}`);
  }

  if (caseJson.ready && caseJson.meta) {
    const meta = caseJson.meta;
    if (meta.grid?.rows !== 8 || meta.grid.cols !== 9) fail("grid", `${meta.grid?.rows}x${meta.grid?.cols}`);
    else pass("grid", "8x9");
    if (meta.stormBtK !== 240) fail("label", `stormBtK ${meta.stormBtK}`);
    else pass("label", "240 K");
    const rows = meta.scores?.test?.model?.all ?? [];
    if (rows.length !== 12) fail("scores", `leads ${rows.length}`);
    else {
      const line = rows
        .map((row) => {
          const denom = row.hits + row.misses + row.falseAlarms;
          const csi = denom ? (row.hits / denom).toFixed(3) : "n/a";
          return `+${row.lead}:${csi}(${row.hits}/${row.misses}/${row.falseAlarms})`;
        })
        .join(" ");
      pass("scores", line);
    }
    const fractions = Object.entries(meta.activeFraction ?? {})
      .map(([date, value]) => `${date}=${value.toFixed(3)}`)
      .join(" ");
    pass("active", fractions || "none");
    pass("elevation", meta.elevationNote ?? "");
    pass("demo", meta.demoDate ?? "");
    pass("threshold", String(meta.threshold));
  }

  if (failures.length) {
    console.log(`http-check failed ${failures.length}`);
    process.exit(1);
  }
  console.log(`http-check passed ${notes.length}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
