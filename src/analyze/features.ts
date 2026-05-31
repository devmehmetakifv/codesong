/** Audio + symbolic feature extraction for the agent feedback report. */
import type { ScoreIR } from "../core/ir.js";

export interface AudioFeatures {
  durationSec: number;
  peakDb: number;
  rmsDb: number;
  /** Samples at/above full scale — indicates clipping. */
  clippedSamples: number;
  dcOffset: number;
  leadingSilenceSec: number;
  trailingSilenceSec: number;
}

const PITCHES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function db(x: number): number {
  return x <= 1e-6 ? -Infinity : 20 * Math.log10(x);
}

export function analyzeAudio(buffer: AudioBuffer): AudioFeatures {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  let peak = 0;
  let sumSq = 0;
  let sum = 0;
  let clipped = 0;
  const data: Float32Array[] = [];
  for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c));

  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = data[c][i];
      const a = Math.abs(s);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      sumSq += s * s;
      sum += s;
    }
  }
  const n = len * ch;
  const rms = Math.sqrt(sumSq / n);

  // Silence at head/tail (mono-mixed threshold).
  const thresh = 0.003;
  const frameAbs = (i: number) => {
    let m = 0;
    for (let c = 0; c < ch; c++) m = Math.max(m, Math.abs(data[c][i]));
    return m;
  };
  let lead = 0;
  while (lead < len && frameAbs(lead) < thresh) lead++;
  let tail = len - 1;
  while (tail > 0 && frameAbs(tail) < thresh) tail--;

  return {
    durationSec: buffer.duration,
    peakDb: db(peak),
    rmsDb: db(rms),
    clippedSamples: clipped,
    dcOffset: sum / n,
    leadingSilenceSec: lead / buffer.sampleRate,
    trailingSilenceSec: (len - 1 - tail) / buffer.sampleRate,
  };
}

// Krumhansl-Kessler key profiles.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let dbb = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    dbb += xb * xb;
  }
  return num / (Math.sqrt(da * dbb) || 1);
}

export interface KeyEstimate {
  key: string;
  confidence: number;
  declared?: string;
  matchesDeclared: boolean;
}

/** Estimate key from the IR pitch-class histogram (duration-weighted) and compare to declared. */
export function estimateKey(score: ScoreIR): KeyEstimate {
  const hist = new Array(12).fill(0);
  for (const t of score.tracks) {
    if (t.instrument.kind === "drums") continue;
    for (const e of t.events) hist[((e.midi % 12) + 12) % 12] += e.durationTicks;
  }
  let best = { key: "unknown", corr: -2 };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, profile] of [["major", MAJOR], ["minor", MINOR]] as const) {
      const rotated = profile.map((_, i) => profile[(i - tonic + 12) % 12]);
      const corr = pearson(hist, rotated);
      if (corr > best.corr) best = { key: `${PITCHES[tonic]} ${mode}`, corr };
    }
  }
  const declared = score.meta.key;
  return {
    key: best.key,
    confidence: Math.max(0, Number(best.corr.toFixed(3))),
    declared,
    matchesDeclared: declared ? normalizeKey(declared) === normalizeKey(best.key) : true,
  };
}

function normalizeKey(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, " ");
}
