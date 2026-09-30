"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { copyOf } from "@/lib/copy";
import { useLanguage } from "./language";

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { language } = useLanguage();
  const text = copyOf(language);
  const links = [
    { href: "/", label: text.forecast },
    { href: "/scores", label: text.scores },
    { href: "/strategy", label: text.strategy },
    { href: "/display", label: text.display },
  ];
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="brand-header">
            <span className="brand-icon">⚡</span>
            <div>
              <strong>{text.product}</strong>
            </div>
          </div>
          <span>{text.region}</span>
        </div>
        <nav className="nav">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={path === link.href ? "active" : ""}>
              <span className="nav-dot" style={{ background: link.href === "/" ? "#38bdf8" : link.href === "/scores" ? "#10b981" : link.href === "/strategy" ? "#f59e0b" : "#a855f7" }} />
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="side-status">
          <div className="side-status-item">
            <span className="side-status-pulse" />
            <span>Himawari-9: Live Stream</span>
          </div>
          <div className="side-status-item">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#38bdf8", flexShrink: 0 }} />
            <span>Grid: 0.05 deg / 10 min</span>
          </div>
          <div className="side-status-item">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#a855f7", flexShrink: 0 }} />
            <span>NVIDIA Llama-3.1 RAG</span>
          </div>
        </div>
        <p className="disclaimer">{text.disclaimer}</p>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
