import { describe, it, expect } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import { midiToFreq, resolvePreset, playSynth } from "./synths.js";
import { makeNoiseBuffer } from "./drums.js";

const SR = 44100;

/** Render a single note through playSynth and return the mono samples. */
async function renderNote(
  preset = resolvePreset("acoustic-guitar"),
  { midi = 60, dur = 0.5, vel = 0.9, seed = 1, seconds = 1.5 } = {},
): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.floor(SR * seconds), SR);
  const noise = makeNoiseBuffer(ctx, seed);
  playSynth(ctx, ctx.destination, preset, midi, 0, dur, vel, noise, seed);
  const buf = await ctx.startRendering();
  return buf.getChannelData(0).slice();
}

function rms(d: Float32Array, from = 0, to = d.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += d[i] * d[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

describe("midiToFreq", () => {
  it("anchors A4 = 440 and is octave-doubling", () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToFreq(81)).toBeCloseTo(880, 6);
    expect(midiToFreq(57)).toBeCloseTo(220, 6);
  });
});

describe("resolvePreset", () => {
  it("resolves direct names, aliases, and falls back to piano", () => {
    expect(resolvePreset("acoustic-guitar").model).toBe("karplus");
    expect(resolvePreset("guitar")).toBe(resolvePreset("acoustic-guitar")); // alias
    expect(resolvePreset("keys")).toBe(resolvePreset("piano")); // alias
    expect(resolvePreset("does-not-exist")).toBe(resolvePreset("piano")); // fallback
  });
});

describe("Karplus-Strong voice", () => {
  it("produces an audible, non-silent string tone", async () => {
    const d = await renderNote();
    expect(rms(d)).toBeGreaterThan(1e-4);
    expect(Number.isFinite(rms(d))).toBe(true);
  });

  it("decays over time like a plucked string", async () => {
    const d = await renderNote();
    const head = rms(d, 0, Math.floor(0.1 * SR));
    const tail = rms(d, Math.floor(1.0 * SR), Math.floor(1.2 * SR));
    expect(head).toBeGreaterThan(tail * 1.5);
  });

  it("is deterministic for a fixed seed", async () => {
    const a = await renderNote();
    const b = await renderNote();
    expect(Array.from(a.slice(0, 2000))).toEqual(Array.from(b.slice(0, 2000)));
  });

  it("scales loudness with velocity", async () => {
    const soft = rms(await renderNote(resolvePreset("acoustic-guitar"), { vel: 0.3 }));
    const hard = rms(await renderNote(resolvePreset("acoustic-guitar"), { vel: 1.0 }));
    expect(hard).toBeGreaterThan(soft);
  });
});

describe("oscillator voice", () => {
  it("renders a sustained pad without clipping", async () => {
    const d = await renderNote(resolvePreset("pad"), { dur: 0.6 });
    let peak = 0;
    for (const x of d) peak = Math.max(peak, Math.abs(x));
    expect(rms(d)).toBeGreaterThan(1e-4);
    expect(peak).toBeLessThanOrEqual(1.0001);
  });
});
