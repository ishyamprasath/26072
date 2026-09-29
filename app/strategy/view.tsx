"use client";

import { useState } from "react";
import { useLanguage } from "../language";
import { copyOf } from "@/lib/copy";
import { DISTRICTS } from "@/lib/districts";
import { LEADS } from "@/lib/grid";
import type { CaseMeta } from "@/lib/pipeline";

type Source = { url: string; title: string };

export function StrategyView({
  meta,
  indexed,
  pages,
}: {
  meta: CaseMeta | null;
  indexed: boolean;
  pages: Source[];
}) {
  const { language, setLanguage } = useLanguage();
  const text = copyOf(language);
  const [lead, setLead] = useState(60);
  const [district, setDistrict] = useState("ranchi");
  const [ready, setReady] = useState(indexed);
  const [knownPages, setKnownPages] = useState(pages);
  const [building, setBuilding] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [fallback, setFallback] = useState(false);
  const [error, setError] = useState("");

  async function buildIndex(): Promise<void> {
    setBuilding(true);
    setError("");
    try {
      const response = await fetch("/api/corpus", { method: "POST" });
      const body = (await response.json()) as { ready?: boolean; error?: string };
      if (!response.ok || !body.ready) throw new Error(body.error || "Index failed");
      const status = await fetch("/api/corpus");
      const index = (await status.json()) as { ready?: boolean; pages?: Source[] };
      setReady(Boolean(index.ready));
      setKnownPages(index.pages ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Index failed");
    } finally {
      setBuilding(false);
    }
  }

  async function ask(): Promise<void> {
    setError("");
    const response = await fetch(`/api/strategy?lead=${lead}&district=${district}&language=${language}`);
    if (!response.ok) {
      setError("The strategy card could not be built.");
      return;
    }
    const body = (await response.json()) as { text?: string; sources?: Source[]; fallback?: boolean };
    setAnswer(body.text ?? "");
    setSources(body.sources ?? []);
    setFallback(Boolean(body.fallback));
  }

  return (
    <>
      <section className="banner">
        <strong>{text.strategy}</strong>
        <span>{meta ? `${meta.analysisUtc}. ${text.threshold} ${meta.threshold.toFixed(2)}.` : text.noCase}</span>
      </section>
      {!ready ? <p className="note">{text.indexMissing}</p> : null}
      <div className="toolbar">
        <label>
          {text.lead}
          <select value={lead} onChange={(event) => setLead(Number(event.target.value))}>
            {LEADS.map((item) => (
              <option key={item} value={item}>
                +{item}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text.districts}
          <select value={district} onChange={(event) => setDistrict(event.target.value)}>
            {DISTRICTS.map((item) => (
              <option key={item.id} value={item.id}>
                {language === "hi" ? item.nameHi : item.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={language === "en" ? "on" : ""} onClick={() => setLanguage("en")}>
          {text.english}
        </button>
        <button type="button" className={language === "hi" ? "on" : ""} onClick={() => setLanguage("hi")}>
          {text.hindi}
        </button>
        <button type="button" className="primary" onClick={() => ask().catch(() => setError("The strategy card could not be built."))}>
          {text.askStrategy}
        </button>
        <button type="button" disabled={building} onClick={() => buildIndex().catch(() => undefined)}>
          {building ? text.building : text.buildIndex}
        </button>
      </div>
      {error ? <p className="note">{error}</p> : null}
      {answer ? (
        <section className="card stack">
          <p>{answer}</p>
          {fallback ? <small className="muted">{text.templateNote}</small> : null}
          {sources.length ? (
            <div className="sources">
              <strong>{text.sources}</strong>
              {sources.map((source) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      {knownPages.length ? (
        <section className="card stack">
          <strong>{text.sources}</strong>
          <div className="sources">
            {knownPages.map((page) => (
              <a key={page.url} href={page.url} target="_blank" rel="noreferrer">
                {page.title}
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
