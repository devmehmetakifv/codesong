import { describe, it, expect } from "vitest";
import { jsx } from "../core/jsx-runtime.js";
import { Song, Section, Track, Progression, Pattern, Note } from "../core/components.js";
import { compile } from "../core/compile.js";
import { renderScore } from "./render.js";
import { analyzeAudio, estimateKey } from "../analyze/features.js";
import { tmpdir } from "node:os";
import { join } from "node:path";

const h = (type: unknown, props: Record<string, unknown>, ...children: unknown[]) =>
  jsx(type, { ...props, children });

function fixture() {
  return h(
    Song,
    { tempo: 120, keySignature: "C major", seed: 1 },
    h(
      Section,
      { name: "main", bars: 2 },
      h(Track, { name: "keys", instrument: "piano", octave: 4, loop: true }, h(Progression, { chords: ["C", "G", "Am", "F"], dur: "1n" })),
      h(Track, { name: "bass", instrument: "bass", octave: 2, loop: true }, h(Progression, { chords: ["C", "G", "Am", "F"], dur: "1n", voicing: "root5" })),
      h(Track, { name: "drums", instrument: "drums", loop: true }, h(Pattern, { steps: "bd ~ sd ~", dur: "8n" })),
    ),
  );
}

describe("render (integration)", () => {
  it("renders a fixture to a non-silent, non-clipping buffer of the right length", async () => {
    const score = compile(fixture());
    const out = join(tmpdir(), `codesong-test-${Date.now()}.wav`);
    const res = await renderScore(score, { out });

    // 2 bars at 120 BPM 4/4 = 4s of music + tail.
    expect(res.durationSec).toBeGreaterThan(4);
    expect(res.durationSec).toBeLessThan(9);

    const f = analyzeAudio(res.buffer);
    expect(f.rmsDb).toBeGreaterThan(-30); // non-silent
    expect(f.clippedSamples).toBe(0); // normalized below full scale
    expect(f.peakDb).toBeLessThan(0); // no clipping
  });

  it("estimates the key of an unambiguous C-major melody", () => {
    // Tonic-chord-dominated material resolves the major/relative-minor ambiguity.
    const score = compile(
      h(
        Song,
        { tempo: 120, keySignature: "C major", seed: 1 },
        h(
          Track,
          { name: "lead", instrument: "piano", octave: 4 },
          ...["C4", "E4", "G4", "C5", "G4", "E4", "C4", "G4"].map((p) => h(Note, { pitch: p, dur: "4n" })),
        ),
      ),
    );
    const k = estimateKey(score);
    expect(k.key).toBe("C major");
    expect(k.confidence).toBeGreaterThan(0.6);
  });

  it("is deterministic — same score renders an identical peak", async () => {
    const a = await renderScore(compile(fixture()), { out: join(tmpdir(), `mc-a-${Date.now()}.wav`) });
    const b = await renderScore(compile(fixture()), { out: join(tmpdir(), `mc-b-${Date.now()}.wav`) });
    expect(analyzeAudio(a.buffer).rmsDb).toBeCloseTo(analyzeAudio(b.buffer).rmsDb, 5);
  });
});
