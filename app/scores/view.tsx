"use client";

import { useState } from "react";
import { CsiChart, ScoreTable } from "../chart";
import { useLanguage } from "../language";
import { copyOf } from "@/lib/copy";
import type { CaseMeta } from "@/lib/pipeline";
import type { SliceName } from "@/lib/scores";

export function ScoresView({ meta }: { meta: CaseMeta | null }) {
  const { language } = useLanguage();
  const text = copyOf(language);
  const [slice, setSlice] = useState<SliceName>("all");
  if (!meta) {
    return (
      <section className="banner">
        <strong>{text.emptyTitle}</strong>
        <span>{text.emptyBody}</span>
      </section>
    );
  }
  return (
    <>
      <section className="banner">
        <strong>{text.scores}</strong>
        <span>
          {text.testDay} {meta.testDate}. {text.demoDay} {meta.demoDate} {meta.analysisHhmm} UTC. {text.threshold} {meta.threshold.toFixed(2)}. {meta.label}
        </span>
      </section>
      <div className="toolbar">
        {(["all", "initiation", "decay"] as SliceName[]).map((name) => (
          <button key={name} type="button" className={slice === name ? "on" : ""} onClick={() => setSlice(name)}>
            {name === "all" ? text.sliceAll : name === "initiation" ? text.sliceInit : text.sliceDecay}
          </button>
        ))}
      </div>
      <section className="card stack">
        <strong>{text.testDay}</strong>
        <CsiChart scores={meta.scores.test} slice={slice} />
        <ScoreTable scores={meta.scores.test} slice={slice} />
      </section>
      <section className="card stack">
        <strong>{text.demoDay}</strong>
        <ScoreTable scores={meta.scores.demo} slice={slice} />
      </section>
      <section className="card stack">
        <strong>Active fraction</strong>
        <div className="districts">
          {Object.entries(meta.activeFraction).map(([date, fraction]) => (
            <div key={date} className="bubble">
              {date}
              <small>{fraction.toFixed(3)}</small>
            </div>
          ))}
        </div>
        <p className="muted">{meta.elevationNote}</p>
        <p className="muted">
          Network {meta.model.input}-{meta.model.hidden}-{meta.model.output}, epochs {meta.model.epochs}, final loss {meta.model.finalLoss.toFixed(4)}.
        </p>
      </section>
    </>
  );
}
