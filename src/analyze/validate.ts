/** Symbolic IR validation — structural sanity checks the agent can act on, no audio needed. */
import type { ScoreIR } from "../core/ir.js";

export interface Issue {
  severity: "error" | "warning" | "info";
  track?: string;
  message: string;
}

/** Typical playable MIDI ranges per instrument family (low, high). */
const RANGES: Record<string, [number, number]> = {
  bass: [28, 55],
  "acoustic-guitar": [40, 83],
  "electric-guitar": [40, 86],
  guitar: [40, 86],
  piano: [21, 108],
  "electric-piano": [28, 103],
  fiddle: [55, 100],
  flute: [60, 96],
  strings: [40, 96],
  pad: [36, 96],
  lead: [48, 100],
  organ: [36, 96],
};

export function validateScore(score: ScoreIR): Issue[] {
  const issues: Issue[] = [];

  if (score.tracks.length === 0) {
    issues.push({ severity: "error", message: "Song has no tracks." });
  }

  const totalEvents = score.tracks.reduce((n, t) => n + t.events.length, 0);
  if (totalEvents === 0) {
    issues.push({ severity: "error", message: "Song has no notes — output will be silent." });
  }

  for (const track of score.tracks) {
    if (track.events.length === 0) {
      issues.push({ severity: "warning", track: track.name, message: "Track has no notes." });
      continue;
    }
    if (track.gain <= 0) {
      issues.push({ severity: "warning", track: track.name, message: "Track gain is 0 (inaudible)." });
    }

    if (track.instrument.kind === "synth") {
      const preset = track.instrument.preset;
      const range = RANGES[preset];
      if (range) {
        const lows = track.events.filter((e) => e.midi < range[0]);
        const highs = track.events.filter((e) => e.midi > range[1]);
        if (lows.length) {
          issues.push({
            severity: "warning",
            track: track.name,
            message: `${lows.length} note(s) below ${preset} range (min MIDI ${range[0]}); may sound muddy/unnatural.`,
          });
        }
        if (highs.length) {
          issues.push({
            severity: "warning",
            track: track.name,
            message: `${highs.length} note(s) above ${preset} range (max MIDI ${range[1]}); may sound thin/shrill.`,
          });
        }
      }
    }

    // Heavy overlap (many simultaneous notes) on a monophonic-ish lead.
    if (["bass", "lead", "fiddle", "flute"].includes((track.instrument as { preset?: string }).preset ?? "")) {
      const starts = new Map<number, number>();
      for (const e of track.events) starts.set(e.startTick, (starts.get(e.startTick) ?? 0) + 1);
      const chords = [...starts.values()].filter((c) => c > 1).length;
      if (chords > 0) {
        issues.push({
          severity: "info",
          track: track.name,
          message: `${chords} chord(s) on a typically-monophonic instrument (${(track.instrument as { preset: string }).preset}).`,
        });
      }
    }
  }

  return issues;
}
