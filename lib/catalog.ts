export type SplitName = "train" | "validation" | "test" | "demo";

export type CatalogDay = { date: string; split: SplitName };

export const CATALOG: CatalogDay[] = [
  { date: "2024-04-02", split: "train" },
  { date: "2024-04-09", split: "train" },
  { date: "2024-04-16", split: "train" },
  { date: "2024-04-23", split: "train" },
  { date: "2024-04-30", split: "train" },
  { date: "2024-05-07", split: "train" },
  { date: "2024-05-14", split: "train" },
  { date: "2024-05-21", split: "train" },
  { date: "2024-05-28", split: "validation" },
  { date: "2024-06-04", split: "validation" },
  { date: "2024-06-11", split: "test" },
  { date: "2024-04-18", split: "demo" },
];

export const ANALYSIS_HHMM = ["0800", "0830", "0900", "0930"] as const;

/** 12:00 to 17:00 IST, which is 06:30 to 11:30 UTC. */
export function afternoonFrames(): string[] {
  const frames: string[] = [];
  for (let hour = 6; hour <= 11; hour += 1) {
    for (let minute = 0; minute < 60; minute += 10) {
      if (hour === 6 && minute < 30) continue;
      if (hour === 11 && minute > 30) continue;
      frames.push(`${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}`);
    }
  }
  return frames;
}

export function addMinutes(hhmm: string, minutes: number): string {
  const hour = Number(hhmm.slice(0, 2));
  const minute = Number(hhmm.slice(2, 4));
  const total = hour * 60 + minute + minutes;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}${String(wrapped % 60).padStart(2, "0")}`;
}

export function datesFor(split: SplitName): string[] {
  return CATALOG.filter((day) => day.split === split).map((day) => day.date);
}
