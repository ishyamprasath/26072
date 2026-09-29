export function formatScore(value: number, hits: number, misses: number, falseAlarms: number): string {
  if (hits + misses + falseAlarms === 0) return "n/a";
  return value.toFixed(2);
}

export function round2(value: number): string {
  return value.toFixed(2);
}
