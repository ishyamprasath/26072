import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import bz2 from "unbzip2-stream";

export type HsdHeader = {
  totalHeaderLength: number;
  satellite: string;
  band: number;
  ncols: number;
  nlines: number;
  errorCount: number;
  outsideCount: number;
  gain: number;
  offset: number;
  centralWavelengthUm: number;
  c0: number;
  c1: number;
  c2: number;
  speedOfLight: number;
  planck: number;
  boltzmann: number;
  subLon: number;
  cfac: number;
  lfac: number;
  coff: number;
  loff: number;
  equatorialRadiusKm: number;
  polarRadiusKm: number;
  satDistanceKm: number;
  totalSegments: number;
  segmentNumber: number;
  firstLine: number;
};

export type GeoProj = {
  subLon: number;
  cfac: number;
  lfac: number;
  coff: number;
  loff: number;
  equatorialRadiusKm: number;
  polarRadiusKm: number;
  satDistanceKm: number;
};

function readAscii(buf: Buffer, offset: number, length: number): string {
  return buf.subarray(offset, offset + length).toString("latin1").replace(/\0/g, "").trim();
}

export function parseHsdHeader(buf: Buffer): HsdHeader {
  const header = {} as HsdHeader;
  const block1Length = buf.readUInt16LE(1);
  if (block1Length < 80 || block1Length > 4096) {
    throw new Error(`Unexpected Himawari block 1 length ${block1Length}`);
  }
  header.totalHeaderLength = buf.readUInt32LE(70);
  header.satellite = readAscii(buf, 6, 16);
  if (header.totalHeaderLength < 256 || header.totalHeaderLength > buf.length) {
    throw new Error(`Unexpected Himawari header length ${header.totalHeaderLength}`);
  }

  let off = 0;
  while (off + 3 < header.totalHeaderLength) {
    const blockNo = buf.readUInt8(off);
    const blockLength = blockNo === 10 ? buf.readUInt32LE(off + 1) : buf.readUInt16LE(off + 1);
    if (blockLength < 3 || off + blockLength > buf.length) break;

    if (blockNo === 2) {
      header.ncols = buf.readUInt16LE(off + 5);
      header.nlines = buf.readUInt16LE(off + 7);
    } else if (blockNo === 3) {
      header.subLon = buf.readDoubleLE(off + 3);
      header.cfac = buf.readUInt32LE(off + 11);
      header.lfac = buf.readUInt32LE(off + 15);
      header.coff = buf.readFloatLE(off + 19);
      header.loff = buf.readFloatLE(off + 23);
      header.satDistanceKm = buf.readDoubleLE(off + 27);
      header.equatorialRadiusKm = buf.readDoubleLE(off + 35);
      header.polarRadiusKm = buf.readDoubleLE(off + 43);
    } else if (blockNo === 5) {
      header.band = buf.readUInt16LE(off + 3);
      header.centralWavelengthUm = buf.readDoubleLE(off + 5);
      header.errorCount = buf.readUInt16LE(off + 15);
      header.outsideCount = buf.readUInt16LE(off + 17);
      header.gain = buf.readDoubleLE(off + 19);
      header.offset = buf.readDoubleLE(off + 27);
      if (header.band >= 7) {
        const cal = off + 35;
        header.c0 = buf.readDoubleLE(cal);
        header.c1 = buf.readDoubleLE(cal + 8);
        header.c2 = buf.readDoubleLE(cal + 16);
        header.speedOfLight = buf.readDoubleLE(cal + 48);
        header.planck = buf.readDoubleLE(cal + 56);
        header.boltzmann = buf.readDoubleLE(cal + 64);
      }
    } else if (blockNo === 7) {
      header.totalSegments = buf.readUInt8(off + 3);
      header.segmentNumber = buf.readUInt8(off + 4);
      header.firstLine = buf.readUInt16LE(off + 5);
    }
    off += blockLength;
  }

  if (!header.ncols || !header.nlines || !header.band) {
    throw new Error("Himawari header is missing image size or band number");
  }
  return header;
}

export function countToBrightnessTemperature(header: HsdHeader, count: number): number {
  if (count === header.errorCount || count === header.outsideCount) return Number.NaN;
  const radiance = count * header.gain + header.offset;
  if (!(radiance > 0)) return Number.NaN;
  const cwl = header.centralWavelengthUm * 1e-6;
  const h = header.planck;
  const c = header.speedOfLight;
  const k = header.boltzmann;
  const a = (h * c) / (k * cwl);
  const b = (2 * h * c * c) / (radiance * 1e6 * cwl ** 5) + 1;
  if (!(b > 1)) return Number.NaN;
  const effective = a / Math.log(b);
  const bt = header.c0 + header.c1 * effective + header.c2 * effective * effective;
  if (!Number.isFinite(bt) || bt < 150 || bt > 400) return Number.NaN;
  return bt;
}

export function headerToProj(header: HsdHeader): GeoProj {
  return {
    subLon: header.subLon,
    cfac: header.cfac,
    lfac: header.lfac,
    coff: header.coff,
    loff: header.loff,
    equatorialRadiusKm: header.equatorialRadiusKm,
    polarRadiusKm: header.polarRadiusKm,
    satDistanceKm: header.satDistanceKm,
  };
}

/** CGMS geostationary image coordinates. Returns 1-based column and line, or null if off the disk. */
export function latLonToColumnLine(latDeg: number, lonDeg: number, proj: GeoProj): { col: number; line: number } | null {
  const deg = Math.PI / 180;
  const lat = latDeg * deg;
  const lon = lonDeg * deg;
  const sub = proj.subLon * deg;
  const req = proj.equatorialRadiusKm;
  const rpol = proj.polarRadiusKm;
  const sd = proj.satDistanceKm;
  const geocentric = Math.atan((rpol * rpol) / (req * req) * Math.tan(lat));
  const cosC = Math.cos(geocentric);
  const eccentricityTerm = ((req * req - rpol * rpol) / (req * req)) * cosC * cosC;
  const rl = rpol / Math.sqrt(1 - eccentricityTerm);
  const r1 = sd - rl * cosC * Math.cos(lon - sub);
  const r2 = -rl * cosC * Math.sin(lon - sub);
  const r3 = rl * Math.sin(geocentric);
  const rn = Math.hypot(r1, r2, r3);
  if (!(r1 > 0) || !Number.isFinite(rn) || rn === 0) return null;
  const x = Math.atan(-r2 / r1);
  const y = Math.asin(-r3 / rn);
  const col = proj.coff + x * 2 ** -16 * proj.cfac;
  const line = proj.loff + y * 2 ** -16 * proj.lfac;
  if (!Number.isFinite(col) || !Number.isFinite(line)) return null;
  return { col, line };
}

export function sampleBrightnessTemperature(
  file: Buffer,
  header: HsdHeader,
  column: number,
  line: number,
): number {
  const col = Math.round(column);
  const row = Math.round(line) - header.firstLine;
  if (col < 0 || row < 0 || col >= header.ncols || row >= header.nlines) return Number.NaN;
  const offset = header.totalHeaderLength + (row * header.ncols + col) * 2;
  if (offset + 2 > file.length) return Number.NaN;
  return countToBrightnessTemperature(header, file.readUInt16LE(offset));
}

export async function decompressBz2(compressed: Buffer): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await pipeline(
    Readable.from(compressed),
    bz2(),
    new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
    }),
  );
  return Buffer.concat(chunks);
}

export async function fetchBz2(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Himawari download failed with status ${response.status}`);
  const compressed = Buffer.from(await response.arrayBuffer());
  return decompressBz2(compressed);
}
