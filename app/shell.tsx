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
          <strong>{text.product}</strong>
          <span>{text.region}</span>
        </div>
        <nav className="nav">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={path === link.href ? "active" : ""}>
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="disclaimer">{text.disclaimer}</p>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
