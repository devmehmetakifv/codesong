import { describe, it, expect } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import { buildEffectChain } from "./effects.js";
import { jsx } from "../core/jsx-runtime.js";
import { Song, Section, Track, Note, Effect, Pattern } from "../core/components.js";
import { compile } from "../core/compile.js";
import type { EffectSpec } from "../core/ir.js";

const SR = 44100;
const h = (type: unknown, props: Record<string, unknown>, ...children: unknown[]) =>
  jsx(type, { ...props, children });

/** Render a short tone burst through an effect chain; return mono samples. */
async function renderThrough(effects: EffectSpec[] | undefined, seconds = 0.5): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.floor(SR * seconds), SR);
  const chain = buildEffectChain(ctx, effects);
  chain.output.connect(ctx.destination);
  const osc = ctx.createOscillator();
  osc.frequency.value = 330;
  const g = ctx.createGain();
  g.gain.value = 0.4;
  osc.connect(g).connect(chain.input);
  osc.start(0);
  osc.stop(0.05); // 50 ms burst
  const buf = await ctx.startRendering();
  return buf.getChannelData(0).slice();
}

function rms(d: Float32Array, from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += d[i] * d[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

describe("buildEffectChain", () => {
  it("is a passthrough when there are no effects", () => {
    const ctx = new OfflineAudioContext(1, 10, SR);
    const chain = buildEffectChain(ctx, undefined);
    expect(chain.input).toBe(chain.output);
  });

  it("delay produces echoes after the source stops", async () => {
    const dry = await renderThrough(undefined);
    const wet = await renderThrough([{ type: "delay", timeSec: 0.12, feedback: 0.5, mix: 0.9 }]);
    // Window well after the 50ms burst: dry is silent, delayed signal still rings.
    const win = [Math.floor(0.2 * SR), Math.floor(0.45 * SR)] as const;
    expect(rms(dry, win[0], win[1])).toBeLessThan(1e-4);
    expect(rms(wet, win[0], win[1])).toBeGreaterThan(1e-3);
  });

  it("lowpass filter attenuates a high tone more than a passthrough", async () => {
    const ctx = new OfflineAudioContext(1, Math.floor(SR * 0.2), SR);
    const chain = buildEffectChain(ctx, [{ type: "filter", mode: "lowpass", cutoff: 300, q: 1 }]);
    chain.output.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.frequency.value = 4000; // well above cutoff
    osc.connect(chain.input);
    osc.start(0);
    osc.stop(0.2);
    const filtered = (await ctx.startRendering()).getChannelData(0);
    expect(rms(filtered, 0, filtered.length)).toBeLessThan(0.5); // strongly reduced
  });

  it("renders every effect type without error and stays finite", async () => {
    const specs: EffectSpec[] = [
      { type: "chorus", rate: 1.2, depthMs: 4, mix: 0.5 },
      { type: "drive", amount: 0.6, mix: 0.7 },
      { type: "tremolo", rate: 6, depth: 0.6 },
    ];
    const out = await renderThrough(specs);
    expect(out.every((x) => Number.isFinite(x))).toBe(true);
    expect(rms(out, 0, Math.floor(0.05 * SR))).toBeGreaterThan(1e-4);
  });
});

describe("compile: effects & buses", () => {
  it("collects <Effect> into track.effects and excludes them from note events", () => {
    const tree = h(
      Song,
      { tempo: 120 },
      h(
        Track,
        { instrument: "lead" },
        h(Effect, { type: "delay", time: "8n", feedback: 0.4, mix: 0.5 }),
        h(Effect, { type: "drive", amount: 0.3 }),
        h(Note, { pitch: "C4", dur: "4n" }),
        h(Note, { pitch: "E4", dur: "4n" }),
      ),
    );
    const score = compile(tree);
    const t = score.tracks[0];
    expect(t.events).toHaveLength(2); // two notes; effects are not notes
    expect(t.effects?.map((e) => e.type)).toEqual(["delay", "drive"]);
    const delay = t.effects?.[0];
    expect(delay).toMatchObject({ type: "delay", feedback: 0.4, mix: 0.5 });
    // "8n" at 120 BPM = 0.25s.
    if (delay?.type === "delay") expect(delay.timeSec).toBeCloseTo(0.25, 5);
  });

  it("records the mix-group bus name on the track", () => {
    const tree = h(
      Song,
      {},
      h(Section, { name: "m", bars: 1 },
        h(Track, { name: "kick", instrument: "drums", bus: "drumbus" }, h(Pattern, { steps: "bd", dur: "4n" })),
        h(Track, { name: "snare", instrument: "drums", bus: "drumbus" }, h(Pattern, { steps: "~ sd", dur: "4n" })),
      ),
    );
    const score = compile(tree);
    expect(score.tracks.every((t) => t.bus === "drumbus")).toBe(true);
  });
});
