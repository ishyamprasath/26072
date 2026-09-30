"use client";

import type { MethodName, ScoreBlock } from "@/lib/pipeline";
import type { SliceName } from "@/lib/scores";
import { formatScore } from "@/lib/format";
import { copyOf } from "@/lib/copy";
import { useLanguage } from "./language";

const COLOR: Record<MethodName, string> = {
  model: "#059669",
  optical_flow: "#2563eb",
  persistence: "#d97706",
};

const METHODS: MethodName[] = ["model", "optical_flow", "persistence"];

export function CsiChart({ scores, slice }: { scores: Record<MethodName, ScoreBlock>; slice: SliceName }) {
  const { language } = useLanguage();
  const text = copyOf(language);
  const labels: Record<MethodName, string> = { model: text.model, optical_flow: text.flow, persistence: text.persistence };
  const rows = scores.model[slice];
  const width = 680;
  const height = 220;
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const x = (index: number) => padL + (rows.length <= 1 ? innerW / 2 : (index / (rows.length - 1)) * innerW);
  const y = (value: number) => padT + (1 - Math.max(0, Math.min(1, value))) * innerH;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="CSI by lead">
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line x1={padL} x2={width - padR} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeDasharray={tick === 0.5 ? "4 4" : undefined} />
            <text x={0} y={y(tick) + 4} fill="#64748b" fontSize="11" fontWeight="600">
              {tick.toFixed(2)}
            </text>
          </g>
        ))}
        {METHODS.map((method) => {
          const segments: string[] = [];
          const validPoints: { x: number; y: number }[] = [];
          let current: string[] = [];
          scores[method][slice].forEach((row, index) => {
            const empty = row.hits + row.misses + row.falseAlarms === 0;
            if (empty) {
              if (current.length) segments.push(current.join(" "));
              current = [];
              return;
            }
            const px = x(index);
            const py = y(row.csi);
            current.push(`${px},${py}`);
            validPoints.push({ x: px, y: py });
          });
          if (current.length) segments.push(current.join(" "));
          return (
            <g key={method}>
              {segments.map((points) => (
                <polyline key={`${method}-${points}`} fill="none" stroke={COLOR[method]} strokeWidth="3" points={points} strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {validPoints.map((pt, idx) => (
                <circle key={idx} cx={pt.x} cy={pt.y} r="3.5" fill={COLOR[method]} stroke="#ffffff" strokeWidth="1.5" />
              ))}
            </g>
          );
        })}
        {rows.map((row, index) => (
          <text key={row.lead} x={x(index)} y={height - 8} textAnchor="middle" fill="#475569" fontSize="11" fontWeight="600">
            +{row.lead}
          </text>
        ))}
      </svg>
      <div className="legend">
        {METHODS.map((method) => (
          <span key={method} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
            <i className="swatch" style={{ background: COLOR[method], width: 14, height: 14, borderRadius: 4 }} />
            {labels[method]}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ScoreTable({ scores, slice }: { scores: Record<MethodName, ScoreBlock>; slice: SliceName }) {
  const { language } = useLanguage();
  const text = copyOf(language);
  return (
    <table>
      <thead>
        <tr>
          <th>{text.lead}</th>
          <th>{text.model} CSI</th>
          <th>{text.flow} CSI</th>
          <th>{text.persistence} CSI</th>
          <th>{text.model} POD</th>
          <th>{text.model} FAR</th>
          <th>{text.hits}</th>
        </tr>
      </thead>
      <tbody>
        {scores.model[slice].map((row, index) => {
          const flow = scores.optical_flow[slice][index];
          const persist = scores.persistence[slice][index];
          return (
            <tr key={row.lead}>
              <td>+{row.lead}</td>
              <td>{formatScore(row.csi, row.hits, row.misses, row.falseAlarms)}</td>
              <td>{formatScore(flow.csi, flow.hits, flow.misses, flow.falseAlarms)}</td>
              <td>{formatScore(persist.csi, persist.hits, persist.misses, persist.falseAlarms)}</td>
              <td>{formatScore(row.pod, row.hits, row.misses, row.falseAlarms)}</td>
              <td>{formatScore(row.far, row.hits, row.misses, row.falseAlarms)}</td>
              <td>
                {row.hits}/{row.misses}/{row.falseAlarms}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
