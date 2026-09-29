import type { ReactNode } from "react";
import { LanguageProvider } from "./language";
import { Shell } from "./shell";
import "./globals.css";

export const metadata = {
  title: "Thunderstorm nowcast",
  description: "Research prototype for a 0 to 2 hour thunderstorm nowcast over east-central India.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <Shell>{children}</Shell>
        </LanguageProvider>
      </body>
    </html>
  );
}
