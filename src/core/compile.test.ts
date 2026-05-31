import { describe, it, expect } from "vitest";
import { jsx, jsxs } from "./jsx-runtime.js";
import { Song, Section, Track, Progression, Note, Pattern, Chord } from "./components.js";
import { compile } from "./compile.js";
import { ticksPerBar, DEFAULT_PPQ } from "./ir.js";

// Build elements via the runtime directly (no JSX transform needed in tests).
const h = (type: unknown, props: Record<string, unknown>, ...children: unknown[]) =>
  jsx(type, { ...props, children });

describe("compile", () => {
  it("compiles a single note track", () => {
    const tree = h(Song, { tempo: 120, title: "t" }, h(Track, { instrument: "piano" }, h(Note, { pitch: "C4", dur: "4n" })));
    const score = compile(tree);
    expect(score.meta.tempo).toBe(120);
    expect(score.tracks).toHaveLength(1);
    expect(score.tracks[0].events).toHaveLength(1);
    expect(score.tracks[0].events[0].midi).toBe(60);
    expect(score.tracks[0].events[0].durationTicks).toBe(DEFAULT_PPQ);
  });

  it("expands a chord progression into notes and advances time", () => {
    const tree = h(Song, {}, h(Track, { instrument: "guitar" }, h(Progression, { chords: ["G", "C", "D", "G"], dur: "1n" })));
    const score = compile(tree);
    const ev = score.tracks[0].events;
    // 4 triads * 3 notes = 12 notes
    expect(ev.length).toBe(12);
    const bar = ticksPerBar(DEFAULT_PPQ, [4, 4]);
    // last chord starts at bar 3
    expect(Math.min(...ev.filter((_, i) => i >= 9).map((e) => e.startTick))).toBe(3 * bar);
  });

  it("maps drum pattern tokens to GM midi notes", () => {
    const tree = h(Song, {}, h(Track, { instrument: "drums" }, h(Pattern, { steps: "bd ~ sd ~", dur: "8n" })));
    const score = compile(tree);
    const ev = score.tracks[0].events;
    expect(ev.map((e) => e.midi)).toEqual([36, 38]); // kick, snare; rests skipped
  });

  it("lays out sections sequentially and merges same-named tracks", () => {
    const tree = h(
      Song,
      {},
      h(Section, { name: "verse", bars: 2 }, h(Track, { name: "gtr", instrument: "guitar" }, h(Chord, { name: "G", dur: "1n" }))),
      h(Section, { name: "chorus", bars: 2 }, h(Track, { name: "gtr", instrument: "guitar" }, h(Chord, { name: "C", dur: "1n" }))),
    );
    const score = compile(tree);
    expect(score.sections.map((s) => s.name)).toEqual(["verse", "chorus"]);
    expect(score.tracks).toHaveLength(1); // merged
    const bar = ticksPerBar(DEFAULT_PPQ, [4, 4]);
    expect(score.sections[1].startTick).toBe(2 * bar);
    // chorus chord (C) should start at section 2 origin
    const cEvents = score.tracks[0].events.filter((e) => e.startTick >= 2 * bar);
    expect(cEvents.length).toBe(3);
  });

  it("loops content to fill a section", () => {
    const tree = h(
      Song,
      {},
      h(Section, { name: "v", bars: 4 }, h(Track, { instrument: "drums", loop: true }, h(Pattern, { steps: "bd sd", dur: "4n" }))),
    );
    const score = compile(tree);
    // pattern is 2 quarter-notes = half a bar; over 4 bars => 8 repeats * 2 hits = 16
    expect(score.tracks[0].events.length).toBe(16);
  });
});
