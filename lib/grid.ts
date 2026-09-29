export const DOMAIN = {
  west: 84,
  east: 96,
  south: 20,
  north: 28,
} as const;

/** Cold-cloud label. 230 K never occurs in this oblique Himawari footprint; 240 K is the cold top the instrument actually records. */
export const STORM_BT_K = 240;

export const LEADS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120] as const;

export function cellAreaKm2(south: number, north: number, west: number, east: number): number {
  const midLat = (south + north) / 2;
  const height = 111.32 * Math.abs(north - south);
  const width = 111.32 * Math.abs(east - west) * Math.cos((midLat * Math.PI) / 180);
  return height * width;
}
