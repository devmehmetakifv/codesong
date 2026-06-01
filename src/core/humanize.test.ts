import { describe, it, expect } from "vitest";
import { humanize, resolveHumanize, DEFAULT_HUMANIZE } from "./humanize.js";
import type { HumanizeSettings, ScoreIR, TrackIR } from "./ir.js";
import { DEFAULT_PPQ, DEFAULT_SAMPLE_RATE } from "./ir.js";

function track(over: Partial<TrackIR> = {}): TrackIR {
  return {
    id: "t",
    name: "t",
    instrument: { kind: "synth", preset: "piano" },
    gain: 0.8,
    pan: 0,
    reverbSend: 0,
    events: Array.from({ length: 8 }, (_, i) => ({
      startTick: i * DEFAULT_PPQ,
      durationTicks: DEFAULT_PPQ,
      midi: 60,
      velocity: 0.8,
    })),
    ...over,
  };
}

function score(tracks: TrackIR[], humanizeMeta?: HumanizeSettings): ScoreIR {
  return {
    meta: {
      title: "t",
      tempo: 120,
      timeSignature: [4, 4],
      ppq: DEFAULT_PPQ,
      sampleRate: DEFAULT_SAMPLE_RATE,
      seed: 42,
      humanize: humanizeMeta,
    },
    tracks,
    sections: [],
  };
}

const FULL: HumanizeSettings = { timing: 1, velocity: 1, swing: 0 };

describe("humanize", () => {
  it("is a no-op when settings are absent or all zero", () => {
    const off: HumanizeSettings = { timing: 0, velocity: 0, swing: 0 };
    const s = score([track({ humanize: off })]);
    const out = humanize(s);
    expect(out.tracks[0].events).toEqual(s.tracks[0].events);
  });

  it("does not mutate its input", () => {
    const s = score([track({ humanize: FULL })]);
    const before = JSON.parse(JSON.stringify(s));
    humanize(s);
    expect(s).toEqual(before);
  });

  it("perturbs timing and velocity when active", () => {
    const s = score([track({ humanize: FULL })]);
    const out = humanize(s);
    const ev = out.tracks[0].events;
    // At least some events moved off the exact grid and changed dynamics.
    const movedTiming = ev.some((e, i) => e.startTick !== i * DEFAULT_PPQ);
    const movedVel = ev.some((e) => e.velocity !== 0.8);
    expect(movedTiming).toBe(true);
    expect(movedVel).toBe(true);
  });

  it("is deterministic for a given seed", () => {
    const make = () => humanize(score([track({ humanize: FULL })]));
    expect(make().tracks[0].events).toEqual(make().tracks[0].events);
  });

  it("produces different drift for different seeds", () => {
    const a = humanize(score([track({ humanize: FULL })])).tracks[0].events;
    const s2 = score([track({ humanize: FULL })]);
    s2.meta.seed = 999;
    const b = humanize(s2).tracks[0].events;
    expect(a).not.toEqual(b);
  });

  it("keeps velocity within [0.05, 1] and start ticks non-negative", () => {
    const ev = Array.from({ length: 16 }, (_, i) => ({
      startTick: i,
      durationTicks: 10,
      midi: 60,
      velocity: i % 2 === 0 ? 0.02 : 0.99,
    }));
    const out = humanize(score([track({ humanize: FULL, events: ev })]));
    for (const e of out.tracks[0].events) {
      expect(e.velocity).toBeGreaterThanOrEqual(0.05);
      expect(e.velocity).toBeLessThanOrEqual(1);
      expect(e.startTick).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps events time-ordered", () => {
    const out = humanize(score([track({ humanize: FULL })]));
    const starts = out.tracks[0].events.map((e) => e.startTick);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it("swing delays off-beat eighths only", () => {
    const eighth = DEFAULT_PPQ / 2;
    const ev = Array.from({ length: 4 }, (_, i) => ({
      startTick: i * eighth,
      durationTicks: eighth,
      midi: 60,
      velocity: 0.8,
    }));
    // Pure swing, no timing/velocity jitter, so the shift is exactly measurable.
    const swung = humanize(
      score([track({ humanize: { timing: 0, velocity: 0, swing: 0.6 }, events: ev })]),
    ).tracks[0].events;
    // On-beats (index 0, 2) unmoved; off-beats (1, 3) pushed later.
    expect(swung[0].startTick).toBe(0);
    expect(swung[1].startTick).toBeGreaterThan(eighth);
    expect(swung[2].startTick).toBe(2 * eighth);
    expect(swung[3].startTick).toBeGreaterThan(3 * eighth);
  });
});

describe("resolveHumanize", () => {
  it("returns base for true/undefined", () => {
    expect(resolveHumanize(true, DEFAULT_HUMANIZE)).toEqual(DEFAULT_HUMANIZE);
    expect(resolveHumanize(undefined, DEFAULT_HUMANIZE)).toEqual(DEFAULT_HUMANIZE);
  });

  it("zeroes everything for false or 0", () => {
    expect(resolveHumanize(false, DEFAULT_HUMANIZE)).toEqual({ timing: 0, velocity: 0, swing: 0 });
    expect(resolveHumanize(0, DEFAULT_HUMANIZE)).toEqual({ timing: 0, velocity: 0, swing: 0 });
  });

  it("maps a number to timing+velocity, preserving base swing", () => {
    const base = { timing: 0.4, velocity: 0.4, swing: 0.5 };
    expect(resolveHumanize(0.7, base)).toEqual({ timing: 0.7, velocity: 0.7, swing: 0.5 });
  });

  it("merges a partial object over base and clamps to 0..1", () => {
    const base = { timing: 0.4, velocity: 0.4, swing: 0 };
    expect(resolveHumanize({ swing: 2 }, base)).toEqual({ timing: 0.4, velocity: 0.4, swing: 1 });
  });
});
