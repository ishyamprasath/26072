"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Lang } from "@/lib/view";

type LanguageValue = { language: Lang; setLanguage: (language: Lang) => void };

const LanguageContext = createContext<LanguageValue>({ language: "en", setLanguage: () => undefined });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Lang>("en");
  useEffect(() => {
    const stored = window.localStorage.getItem("sih-lang");
    if (stored === "hi" || stored === "en") setLanguageState(stored);
  }, []);
  const setLanguage = (next: Lang) => {
    window.localStorage.setItem("sih-lang", next);
    document.documentElement.lang = next;
    setLanguageState(next);
  };
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageValue {
  return useContext(LanguageContext);
}
