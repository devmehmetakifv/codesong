/**
 * Procedural convolution reverb. Instead of shipping impulse-response WAVs, we
 * synthesize a stereo IR from decaying, decorrelated noise plus a few early
 * reflections — fed into a ConvolverNode this gives the dense, natural tail real
 * rooms have, without the metallic ring of a handful of feedback combs (and with
 * zero sample assets). Deterministic for a given seed.
 */
import { mulberry32 } from "../core/rng.js";

export interface RoomSpec {
  /** Approximate RT60 / tail length in seconds. */
  seconds: number;
  /** High-frequency damping 0..1 — higher = darker, faster-decaying highs. */
  damping: number;
  /** Pre-delay before the tail, in seconds (distance to first reflections). */
  predelay: number;
}

/** Named room characters. `none` is handled by the caller (no reverb bus). */
export const ROOMS: Record<string, RoomSpec> = {
  ambience: { seconds: 0.4, damping: 0.7, predelay: 0.0 },
  room: { seconds: 0.9, damping: 0.55, predelay: 0.006 },
  plate: { seconds: 1.6, damping: 0.2, predelay: 0.0 },
  hall: { seconds: 2.4, damping: 0.35, predelay: 0.02 },
};

export function resolveRoom(name: string | undefined): RoomSpec {
  return ROOMS[name ?? "room"] ?? ROOMS.room;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Build a stereo impulse response buffer. Channels draw independent noise so the
 * tail is naturally wide; a one-pole lowpass (whose strength grows over the tail)
 * models air/material absorption, and a short set of early reflections gives the
 * room a sense of size before the diffuse tail.
 */
export function generateImpulseResponse(
  ctx: BaseAudioContext,
  room: RoomSpec,
  seed: number,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(sr * 0.05 | 0, Math.floor(room.seconds * sr));
  const buf = ctx.createBuffer(2, len, sr);
  const predelay = Math.floor(room.predelay * sr);
  // RT60: amplitude reaches -60 dB (1e-3) at the end of the tail.
  const tau = room.seconds / 6.9;

  // Early reflection taps (seconds) — scaled by room size, alternating channels.
  const erTimes = [0.0079, 0.0123, 0.0191, 0.0257, 0.0331, 0.0411];
  const sizeScale = clamp(room.seconds / 0.9, 0.5, 3);

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const rng = mulberry32(((seed ^ (ch === 0 ? 0x9e3779b9 : 0x85ebca6b)) >>> 0) || 1);
    let lp = 0;

    // Diffuse exponentially-decaying tail.
    for (let i = predelay; i < len; i++) {
      const t = (i - predelay) / sr;
      const env = Math.exp(-t / tau);
      const white = rng() * 2 - 1;
      // Damping grows toward the tail end so highs fade faster than lows.
      const a = clamp(room.damping * (0.3 + 0.7 * (t / room.seconds)), 0, 0.97);
      lp = (1 - a) * white + a * lp;
      d[i] = lp * env;
    }

    // Early reflections layered on top, decaying and panned by channel offset.
    for (let k = 0; k < erTimes.length; k++) {
      const jitter = ch === 0 ? 1 : 1.0 + (rng() * 0.0008); // slight L/R decorrelation
      const idx = predelay + Math.floor(erTimes[k] * sizeScale * jitter * sr);
      if (idx < len) d[idx] += (1 - k / erTimes.length) * 0.6 * (rng() * 0.4 + 0.8);
    }
  }

  // Normalize IR energy so reverb send levels behave consistently across rooms.
  let peak = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak > 1e-6) {
    const g = 0.9 / peak;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] *= g;
    }
  }
  return buf;
}
