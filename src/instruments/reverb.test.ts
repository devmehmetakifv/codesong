import { describe, it, expect } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import { generateImpulseResponse, resolveRoom, ROOMS } from "./reverb.js";

const SR = 44100;
const ctx = new OfflineAudioContext(2, SR, SR);

function rms(d: Float32Array, from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += d[i] * d[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

describe("resolveRoom", () => {
  it("resolves named rooms and falls back to room", () => {
    expect(resolveRoom("hall")).toBe(ROOMS.hall);
    expect(resolveRoom("plate")).toBe(ROOMS.plate);
    expect(resolveRoom(undefined)).toBe(ROOMS.room);
    expect(resolveRoom("nonsense")).toBe(ROOMS.room);
  });
});

describe("generateImpulseResponse", () => {
  it("builds a stereo IR of roughly the room length", () => {
    const ir = generateImpulseResponse(ctx, ROOMS.hall, 1);
    expect(ir.numberOfChannels).toBe(2);
    expect(ir.length).toBeCloseTo(ROOMS.hall.seconds * SR, -3);
  });

  it("is non-silent and decays from head to tail", () => {
    const ir = generateImpulseResponse(ctx, ROOMS.hall, 1);
    const d = ir.getChannelData(0);
    const head = rms(d, 0, Math.floor(0.05 * SR));
    const tail = rms(d, d.length - Math.floor(0.1 * SR), d.length);
    expect(head).toBeGreaterThan(1e-3);
    expect(head).toBeGreaterThan(tail * 3); // clearly decaying
  });

  it("has decorrelated (wide) stereo channels", () => {
    const ir = generateImpulseResponse(ctx, ROOMS.room, 1);
    const l = ir.getChannelData(0);
    const r = ir.getChannelData(1);
    let diff = 0;
    for (let i = 0; i < l.length; i++) diff += Math.abs(l[i] - r[i]);
    expect(diff).toBeGreaterThan(0); // L and R are not identical
  });

  it("is deterministic for a fixed seed and varies by seed", () => {
    const a = generateImpulseResponse(ctx, ROOMS.room, 7).getChannelData(0).slice(0, 1000);
    const b = generateImpulseResponse(ctx, ROOMS.room, 7).getChannelData(0).slice(0, 1000);
    const c = generateImpulseResponse(ctx, ROOMS.room, 99).getChannelData(0).slice(0, 1000);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it("scales tail length with room size", () => {
    expect(generateImpulseResponse(ctx, ROOMS.hall, 1).length).toBeGreaterThan(
      generateImpulseResponse(ctx, ROOMS.ambience, 1).length,
    );
  });
});
