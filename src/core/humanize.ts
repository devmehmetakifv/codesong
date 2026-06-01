/**
 * Humanize pass: a deterministic, seed-driven post-process over a compiled ScoreIR.
 *
 * Real players don't land every note exactly on the grid at identical force — that
 * uniformity is the clearest "this is a machine" tell. This pass nudges note timing,
 * velocity, and length within musical bounds, and applies swing to off-beat eighths.
 *
 * Fully reproducible: all randomness comes from `meta.seed` mixed with each track id,
 * so the same song always renders the same way. Pure — returns a new ScoreIR, never
 * mutates its input.
 */
import {
  type HumanizeSettings,
  type NoteEvent,
  type ScoreIR,
  type TrackIR,
} from "./ir.js";
import { mulberry32, hashString } from "./rng.js";

/** Peak timing wander in milliseconds at amount=1, per instrument family. */
interface VoiceProfile {
  /** Max +/- timing offset (ms) a note start may wander at timing=1. */
  timingMs: number;
  /** Max +/- velocity delta (0..1) at velocity=1. */
  velAmount: number;
  /** Max +/- note-length scaling at timing=1 (e.g. 0.06 = +/-6%). */
  lengthAmount: number;
}

const DEFAULT_PROFILE: VoiceProfile = { timingMs: 22, velAmount: 0.18, lengthAmount: 0.06 };

/** Tighter or looser feel by instrument. Drummers lock the grid; leads breathe. */
const PROFILES: Record<string, VoiceProfile> = {
  drums: { timingMs: 11, velAmount: 0.22, lengthAmount: 0 },
  bass: { timingMs: 14, velAmount: 0.14, lengthAmount: 0.04 },
  piano: { timingMs: 18, velAmount: 0.2, lengthAmount: 0.05 },
  "electric-piano": { timingMs: 18, velAmount: 0.2, lengthAmount: 0.05 },
  organ: { timingMs: 16, velAmount: 0.14, lengthAmount: 0.03 },
  pad: { timingMs: 28, velAmount: 0.1, lengthAmount: 0.03 },
  strings: { timingMs: 26, velAmount: 0.12, lengthAmount: 0.04 },
  lead: { timingMs: 24, velAmount: 0.2, lengthAmount: 0.07 },
  fiddle: { timingMs: 24, velAmount: 0.2, lengthAmount: 0.07 },
  flute: { timingMs: 22, velAmount: 0.16, lengthAmount: 0.06 },
};

function profileFor(track: TrackIR): VoiceProfile {
  if (track.instrument.kind === "drums") return PROFILES.drums;
  return PROFILES[track.instrument.preset] ?? DEFAULT_PROFILE;
}

const ZERO: HumanizeSettings = { timing: 0, velocity: 0, swing: 0 };

function isActive(h: HumanizeSettings | undefined): h is HumanizeSettings {
  return !!h && (h.timing > 0 || h.velocity > 0 || h.swing > 0);
}

/** Triangular noise in [-1, 1] — concentrated near 0, like a steady player's drift. */
function bipolar(rng: () => number): number {
  return rng() + rng() - 1;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Swing offset (ticks) for a note: delay off-beat eighths toward a triplet feel.
 * At swing=1 an off-beat eighth lands a full triplet-third late (hard shuffle);
 * typical musical swing is ~0.3–0.6.
 */
function swingOffsetTicks(startTick: number, ppq: number, swing: number): number {
  if (swing <= 0) return 0;
  const eighth = ppq / 2;
  const index = Math.round(startTick / eighth);
  // Off-beat eighths are the odd subdivisions; on-beats stay put.
  if (Math.abs(index * eighth - startTick) > 1 || index % 2 === 0) return 0;
  return swing * (eighth / 3);
}

function humanizeTrack(track: TrackIR, tempo: number, ppq: number, seed: number): TrackIR {
  const settings = track.humanize;
  if (!isActive(settings)) return track;

  const profile = profileFor(track);
  const rng = mulberry32((seed ^ hashString(track.id)) >>> 0 || 1);
  const maxOffsetTicks = (profile.timingMs / 1000) * (tempo / 60) * ppq * settings.timing;

  const events: NoteEvent[] = track.events.map((e) => {
    const timeJitter = bipolar(rng) * maxOffsetTicks;
    const swing = swingOffsetTicks(e.startTick, ppq, settings.swing);
    const startTick = Math.max(0, Math.round(e.startTick + timeJitter + swing));

    const velDelta = bipolar(rng) * profile.velAmount * settings.velocity;
    const velocity = clamp(e.velocity + velDelta, 0.05, 1);

    const lenScale = 1 + bipolar(rng) * profile.lengthAmount * settings.timing;
    const durationTicks = Math.max(1, Math.round(e.durationTicks * lenScale));

    return { ...e, startTick, durationTicks, velocity };
  });

  // Keep events time-ordered so downstream scheduling/analysis stays stable.
  events.sort((a, b) => a.startTick - b.startTick);
  return { ...track, events };
}

/**
 * Apply humanization to every track using each track's resolved settings.
 * Tracks (and songs) with all-zero settings pass through untouched — identical
 * output to the pre-humanize engine, so opting out is exact.
 */
export function humanize(score: ScoreIR): ScoreIR {
  const { tempo, ppq, seed } = score.meta;
  const tracks = score.tracks.map((t) => humanizeTrack(t, tempo, ppq, seed));
  return { ...score, tracks };
}

/** Resolve a user-supplied humanize prop (boolean | number | partial object) to settings. */
export function resolveHumanize(
  raw: unknown,
  base: HumanizeSettings,
): HumanizeSettings {
  if (raw === false || raw === 0) return ZERO;
  if (raw === true || raw == null) return base;
  if (typeof raw === "number") {
    const n = clamp(raw, 0, 1);
    return { timing: n, velocity: n, swing: base.swing };
  }
  if (typeof raw === "object") {
    const o = raw as Partial<HumanizeSettings>;
    return {
      timing: clamp(o.timing ?? base.timing, 0, 1),
      velocity: clamp(o.velocity ?? base.velocity, 0, 1),
      swing: clamp(o.swing ?? base.swing, 0, 1),
    };
  }
  return base;
}

/** Default song-level feel when `humanize` is not specified: subtle, musical, on. */
export const DEFAULT_HUMANIZE: HumanizeSettings = { timing: 0.4, velocity: 0.45, swing: 0 };
