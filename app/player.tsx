"use client";

import { useEffect, useRef, useState } from "react";
import { CsiChart } from "./chart";
import { useLanguage } from "./language";
import { commandAck, copyOf } from "@/lib/copy";
import { mentionedDistrict, parseCommand, type AppCommand } from "@/lib/commands";
import { DISTRICTS, findDistrict } from "@/lib/districts";
import { cellAreaKm2, DOMAIN, LEADS } from "@/lib/grid";
import { formatScore } from "@/lib/format";
import type { CaseMeta } from "@/lib/pipeline";
import type { SliceName } from "@/lib/scores";
import { applyCommand, defaultView, type Lang, type ViewState } from "@/lib/view";
import "maplibre-gl/dist/maplibre-gl.css";

type Source = { url: string; title: string };
type ChatLine = { id: number; role: "user" | "assistant"; text: string; sources?: Source[]; fallback?: boolean };
type Fit = [number, number, number, number];

type SpeechResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechRec = { lang: string; onresult: ((event: SpeechResult) => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void };

const DOMAIN_FIT: Fit = [DOMAIN.west, DOMAIN.south, DOMAIN.east, DOMAIN.north];

function recognition(): SpeechRec | null {
  const root = window as Window & { webkitSpeechRecognition?: new () => SpeechRec; SpeechRecognition?: new () => SpeechRec };
  const Ctor = root.SpeechRecognition ?? root.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function speak(text: string, language: Lang): void {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 400));
  utterance.lang = language === "hi" ? "hi-IN" : "en-IN";
  window.speechSynthesis.speak(utterance);
}

function ForecastMap({ title, accent, imageUrl, fitKey }: { title: string; accent: string; imageUrl: string; fitKey: string }) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{
    remove: () => void;
    fitBounds: (bounds: [[number, number], [number, number]], options?: { padding?: number; animate?: boolean }) => void;
    getSource: (id: string) => { updateImage?: (options: { url: string; coordinates: number[][] }) => void } | undefined;
  } | null>(null);
  const urlRef = useRef(imageUrl);
  const fitRef = useRef(fitKey);
  urlRef.current = imageUrl;
  fitRef.current = fitKey;

  useEffect(() => {
    let dead = false;
    let created: { remove: () => void } | null = null;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (dead || !node.current) return;
      const map = new maplibregl.Map({
        container: node.current,
        style: {
          version: 8,
          sources: {
            base: {
              type: "raster",
              tiles: ["https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "CARTO, OpenStreetMap",
            },
          },
          layers: [{ id: "base", type: "raster", source: "base" }],
        },
        center: [90, 24],
        zoom: 5,
      });
      created = map;
      mapRef.current = map as unknown as NonNullable<typeof mapRef.current>;
      map.on("load", () => {
        if (dead) return;
        map.addSource("overlay", {
          type: "image",
          url: urlRef.current,
          coordinates: [
            [DOMAIN.west, DOMAIN.north],
            [DOMAIN.east, DOMAIN.north],
            [DOMAIN.east, DOMAIN.south],
            [DOMAIN.west, DOMAIN.south],
          ],
        });
        map.addLayer({ id: "overlay", type: "raster", source: "overlay", paint: { "raster-opacity": 0.9 } });
        const [west, south, east, north] = fitRef.current.split(",").map(Number);
        map.fitBounds([[west, south], [east, north]], { padding: 16, animate: false });
      });
    })();
    return () => {
      dead = true;
      created?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.getSource("overlay")?.updateImage?.({
      url: imageUrl,
      coordinates: [
        [DOMAIN.west, DOMAIN.north],
        [DOMAIN.east, DOMAIN.north],
        [DOMAIN.east, DOMAIN.south],
        [DOMAIN.west, DOMAIN.south],
      ],
    });
  }, [imageUrl]);

  useEffect(() => {
    const [west, south, east, north] = fitKey.split(",").map(Number);
    mapRef.current?.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 16, animate: false },
    );
  }, [fitKey]);

  return (
    <section className="panel">
      <header>
        <span>
          <i className="swatch" style={{ background: accent }} />
          {title}
        </span>
      </header>
      <div ref={node} className="map" />
    </section>
  );
}

async function readSse(response: Response, onEvent: (event: { type: string; text?: string; command?: AppCommand; sources?: Source[]; fallback?: boolean }) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No stream");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((item) => item.startsWith("data:"));
      if (!line) continue;
      onEvent(JSON.parse(line.slice(5).trim()) as { type: string; text?: string; command?: AppCommand; sources?: Source[]; fallback?: boolean });
    }
  }
}

export function Player({
  mode,
  initialRoomId = "",
  initialMeta,
  phone = false,
}: {
  mode: "local" | "remote" | "display";
  initialRoomId?: string;
  initialMeta: CaseMeta | null;
  phone?: boolean;
}) {
  const { language, setLanguage } = useLanguage();
  const [view, setView] = useState<ViewState>({ ...defaultView(), language });
  const [meta, setMeta] = useState<CaseMeta | null>(initialMeta);
  const [status, setStatus] = useState("");
  const [roomId, setRoomId] = useState(initialRoomId);
  const [origin, setOrigin] = useState("");
  const [synced, setSynced] = useState(mode !== "remote");
  const [slice, setSlice] = useState<SliceName>("all");
  const [listening, setListening] = useState(false);
  const [speechNote, setSpeechNote] = useState("");
  const [draft, setDraft] = useState("");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [publishedAt, setPublishedAt] = useState(0);
  const viewRef = useRef(view);
  const stamp = useRef(0);
  const chatId = useRef(1);
  viewRef.current = view;

  useEffect(() => {
    setView((current) => (current.language === language ? current : { ...current, language }));
  }, [language]);

  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    if (mode !== "display" || roomId) return;
    fetch("/api/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ create: true }) })
      .then((response) => response.json())
      .then((body: { id: string }) => setRoomId(body.id))
      .catch(() => setStatus("The display room could not be opened."));
  }, [mode, roomId]);

  useEffect(() => {
    if (!roomId || mode === "local") return;
    const timer = setInterval(() => {
      fetch(`/api/room?id=${roomId}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { view?: ViewState; updatedAt?: number } | null) => {
          if (!body?.view || body.updatedAt === undefined || body.updatedAt <= stamp.current) return;
          stamp.current = body.updatedAt;
          setView(body.view);
          setLanguage(body.view.language);
          setSynced(true);
        })
        .catch(() => undefined);
    }, 1000);
    return () => clearInterval(timer);
  }, [roomId, mode, setLanguage]);

  useEffect(() => {
    if (!roomId || mode === "local" || !publishedAt) return;
    fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: roomId, view: viewRef.current, updatedAt: publishedAt }),
    }).catch(() => undefined);
  }, [publishedAt, roomId, mode]);

  useEffect(() => {
    if (meta) return;
    const pull = () => {
      fetch("/api/status")
        .then((response) => response.json())
        .then((body: { step?: string; detail?: string; state?: string }) => {
          setStatus([body.step, body.detail].filter(Boolean).join(": "));
          if (body.state === "complete") {
            fetch("/api/case")
              .then((response) => response.json())
              .then((bodyCase: { ready?: boolean; meta?: CaseMeta }) => {
                if (bodyCase.ready && bodyCase.meta) setMeta(bodyCase.meta);
              })
              .catch(() => undefined);
          }
        })
        .catch(() => undefined);
    };
    pull();
    const timer = setInterval(pull, 5000);
    return () => clearInterval(timer);
  }, [meta]);

  useEffect(() => {
    if (!view.playing) return;
    const timer = setInterval(() => {
      const current = viewRef.current;
      const index = (LEADS as readonly number[]).indexOf(current.lead);
      const lead = LEADS[(index + 1) % LEADS.length];
      commit({ ...current, lead });
    }, 900);
    return () => clearInterval(timer);
  }, [view.playing]);

  function commit(next: ViewState): void {
    const updatedAt = Date.now();
    stamp.current = updatedAt;
    viewRef.current = next;
    setView(next);
    setPublishedAt(updatedAt);
    if (next.language !== language) setLanguage(next.language);
  }

  function push(line: Omit<ChatLine, "id">): void {
    const id = chatId.current;
    chatId.current += 1;
    setLines((current) => [...current, { ...line, id }]);
  }

  async function ask(text: string, spoken: boolean, nextView: ViewState): Promise<void> {
    const userId = chatId.current;
    chatId.current += 1;
    const assistantId = chatId.current;
    chatId.current += 1;
    setLines((current) => [
      ...current,
      { id: userId, role: "user", text },
      { id: assistantId, role: "assistant", text: "" },
    ]);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: nextView.language, lead: nextView.lead, district: nextView.district }),
    });
    if (!response.ok) throw new Error("Chat failed");
    let spokenText = "";
    await readSse(response, (event) => {
      if (event.type === "command" && event.command) {
        const applied = applyCommand(viewRef.current, event.command);
        commit(applied);
        const ack = commandAck(applied.language, event.command);
        spokenText = ack;
        setLines((current) => current.map((line) => (line.id === assistantId ? { ...line, text: ack } : line)));
      }
      if (event.type === "token" && event.text) {
        spokenText += event.text;
        const token = event.text;
        setLines((current) => current.map((line) => (line.id === assistantId ? { ...line, text: line.text + token } : line)));
      }
      if (event.type === "replace" && event.text) {
        spokenText = event.text;
        const replacement = event.text;
        setLines((current) => current.map((line) => (line.id === assistantId ? { ...line, text: replacement } : line)));
      }
      if (event.type === "done") {
        setLines((current) =>
          current.map((line) => (line.id === assistantId ? { ...line, sources: event.sources, fallback: event.fallback } : line)),
        );
      }
    });
    if (spoken && spokenText) speak(spokenText, nextView.language);
  }

  async function send(text: string, spoken: boolean): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    const command = parseCommand(trimmed);
    if (command.op !== "ask") {
      const next = applyCommand(viewRef.current, command);
      commit(next);
      const ack = commandAck(next.language, command);
      push({ role: "assistant", text: ack });
      if (spoken) speak(ack, next.language);
      return;
    }
    let next = viewRef.current;
    if (/[\u0900-\u097F]/.test(trimmed)) next = { ...next, language: "hi" };
    const named = mentionedDistrict(trimmed);
    const district = named ? findDistrict(named) : undefined;
    if (district) next = { ...next, district: district.id };
    if (next !== viewRef.current) commit(next);
    await ask(trimmed, spoken, next);
  }

  function listen(): void {
    const heard = recognition();
    if (!heard) {
      setSpeechNote(copyOf(view.language).noSpeech);
      return;
    }
    heard.lang = view.language === "hi" ? "hi-IN" : "en-IN";
    heard.onerror = () => setListening(false);
    heard.onresult = (event) => {
      setListening(false);
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setDraft(transcript);
      send(transcript, true).catch(() => setSpeechNote(copyOf(viewRef.current.language).templateNote));
    };
    setListening(true);
    setSpeechNote("");
    heard.start();
  }

  const text = copyOf(view.language);
  const areas = meta ? meta.grid.cells.map((cell) => cellAreaKm2(cell.south, cell.north, cell.west, cell.east)) : [];
  const district = DISTRICTS.find((item) => item.id === view.district);
  const fit = district ? [district.west, district.south, district.east, district.north].join(",") : DOMAIN_FIT.join(",");
  const leadRow = meta?.scores.demo.model[slice].find((row) => row.lead === view.lead);
  const flowRow = meta?.scores.demo.optical_flow[slice].find((row) => row.lead === view.lead);
  const persistRow = meta?.scores.demo.persistence[slice].find((row) => row.lead === view.lead);
  const districts = meta?.districtsByLead[String(view.lead)] ?? [];
  const remoteUrl = origin && roomId ? `${origin}/remote?room=${roomId}` : "";

  return (
    <>
      <section className="banner">
        <strong>{meta ? `${meta.demoDate} ${meta.analysisHhmm} UTC` : text.emptyTitle}</strong>
        <span>
          {meta
            ? `${meta.grid.rows} x ${meta.grid.cols} pixels, ${Math.round(Math.min(...areas))} to ${Math.round(Math.max(...areas))} km2. ${text.footprint} ${meta.label}`
            : text.emptyBody}
        </span>
        {status && !meta ? <span>{status}</span> : null}
      </section>
      {phone && !initialRoomId ? <p className="note">{text.noRoom}</p> : null}
      {mode === "remote" && !synced ? <p className="note">{text.joining}</p> : null}
      <div className="toolbar">
        <label>
          {text.lead} +{view.lead}
          <input
            type="range"
            min={10}
            max={120}
            step={10}
            value={view.lead}
            onChange={(event) => commit({ ...view, lead: Number(event.target.value) })}
          />
        </label>
        <button type="button" onClick={() => commit({ ...view, playing: !view.playing })} className={view.playing ? "on" : ""}>
          {view.playing ? text.pause : text.play}
        </button>
        <button type="button" className={view.compare === "optical_flow" ? "on" : ""} onClick={() => commit({ ...view, compare: "optical_flow" })}>
          {text.flow}
        </button>
        <button type="button" className={view.compare === "persistence" ? "on" : ""} onClick={() => commit({ ...view, compare: "persistence" })}>
          {text.persistence}
        </button>
        <button type="button" className={view.layers.ir ? "on" : ""} onClick={() => commit({ ...view, layers: { ...view.layers, ir: !view.layers.ir } })}>
          {text.infrared}
        </button>
        <button type="button" className={view.layers.lightning ? "storm" : ""} onClick={() => commit({ ...view, layers: { ...view.layers, lightning: !view.layers.lightning } })}>
          {text.lightning}
        </button>
        <button type="button" className={view.language === "en" ? "on" : ""} onClick={() => commit({ ...view, language: "en" })}>
          {text.english}
        </button>
        <button type="button" className={view.language === "hi" ? "on" : ""} onClick={() => commit({ ...view, language: "hi" })}>
          {text.hindi}
        </button>
        <button type="button" onClick={listen}>{listening ? text.listening : text.listen}</button>
      </div>
      {speechNote ? <p className="note">{speechNote}</p> : null}
      {view.layers.lightning ? <p className="note">{text.lightningNote}</p> : null}
      {meta ? (
        <div className="panels">
          <ForecastMap title={text.observed} accent="#9f2d2d" imageUrl={`/api/panel?name=obs&lead=${view.lead}&ir=${view.layers.ir ? 1 : 0}`} fitKey={fit} />
          <ForecastMap title={text.model} accent="#0f6e56" imageUrl={`/api/panel?name=model&lead=${view.lead}`} fitKey={fit} />
          <ForecastMap
            title={view.compare === "persistence" ? text.persistence : text.flow}
            accent={view.compare === "persistence" ? "#8a5a00" : "#1d4e89"}
            imageUrl={`/api/panel?name=${view.compare === "persistence" ? "persist" : "flow"}&lead=${view.lead}`}
            fitKey={fit}
          />
        </div>
      ) : null}
      {meta ? (
        <section className="card">
          <div className="toolbar">
            {(["all", "initiation", "decay"] as SliceName[]).map((name) => (
              <button key={name} type="button" className={slice === name ? "on" : ""} onClick={() => setSlice(name)}>
                {name === "all" ? text.sliceAll : name === "initiation" ? text.sliceInit : text.sliceDecay}
              </button>
            ))}
            <span className="muted">
              {text.demoDay}. {text.threshold} {meta.threshold.toFixed(2)}. {text.model} CSI {leadRow ? formatScore(leadRow.csi, leadRow.hits, leadRow.misses, leadRow.falseAlarms) : "n/a"}. {text.flow}{" "}
              {flowRow ? formatScore(flowRow.csi, flowRow.hits, flowRow.misses, flowRow.falseAlarms) : "n/a"}. {text.persistence}{" "}
              {persistRow ? formatScore(persistRow.csi, persistRow.hits, persistRow.misses, persistRow.falseAlarms) : "n/a"}.
            </span>
          </div>
          <CsiChart scores={meta.scores.demo} slice={slice} />
        </section>
      ) : null}
      <div className="layout">
        <section className="card stack">
          <strong>{text.districts}</strong>
          <div className="districts">
            {districts.map((item) => (
              <button key={item.id} type="button" className={view.district === item.id ? "on" : ""} onClick={() => commit({ ...view, district: item.id })}>
                {view.language === "hi" ? item.nameHi : item.name}
                <small>
                  {item.max.toFixed(2)} / {item.areaKm2.toFixed(0)} km2
                </small>
              </button>
            ))}
          </div>
          {meta ? <p className="muted">{meta.elevationNote}</p> : null}
        </section>
        <section className="chat">
          <strong>{text.chat}</strong>
          <div className="messages">
            {lines.map((line) => (
              <div key={line.id} className={line.role === "user" ? "bubble user" : "bubble"}>
                <div>{line.text}</div>
                {line.fallback ? <small className="muted">{text.templateNote}</small> : null}
                {line.sources?.length ? (
                  <div className="sources">
                    {line.sources.map((source) => (
                      <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                        {source.title}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="row">
            {text.suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => send(suggestion, false).catch(() => undefined)}>
                {suggestion}
              </button>
            ))}
          </div>
          <textarea value={draft} placeholder={text.placeholder} onChange={(event) => setDraft(event.target.value)} />
          <button
            type="button"
            className="primary"
            onClick={() => {
              const value = draft;
              setDraft("");
              send(value, false).catch(() => undefined);
            }}
          >
            {text.send}
          </button>
        </section>
      </div>
      {mode === "display" && remoteUrl ? (
        <section className="room">
          <strong>{text.roomTitle}</strong>
          <p>{text.roomHelp}</p>
          <img src={`/api/qr?text=${encodeURIComponent(remoteUrl)}`} alt={text.roomTitle} />
          <span className="muted">
            {text.roomLocal} {roomId}
          </span>
        </section>
      ) : null}
    </>
  );
}
