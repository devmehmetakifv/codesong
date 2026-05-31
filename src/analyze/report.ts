/** Assemble the post-render report the agent reads to self-correct. */
import { ticksToSeconds, type ScoreIR } from "../core/ir.js";
import { analyzeAudio, estimateKey, type AudioFeatures, type KeyEstimate } from "./features.js";
import { validateScore, type Issue } from "./validate.js";

export interface TrackSummary {
  name: string;
  instrument: string;
  events: number;
  gain: number;
  pan: number;
  reverbSend: number;
}

export interface Report {
  title: string;
  tempo: number;
  declaredKey?: string;
  timeSignature: [number, number];
  durationSec: number;
  sections: { name: string; startSec: number; lengthSec: number }[];
  tracks: TrackSummary[];
  audio: AudioFeatures;
  key: KeyEstimate;
  issues: Issue[];
}

export function buildReport(score: ScoreIR, buffer: AudioBuffer): Report {
  const { tempo, ppq } = score.meta;
  const audio = analyzeAudio(buffer);
  const key = estimateKey(score);
  const issues = validateScore(score);

  // Audio-derived issues.
  if (audio.clippedSamples > 0) {
    issues.push({ severity: "warning", message: `${audio.clippedSamples} clipped samples — reduce track gains.` });
  }
  if (audio.rmsDb < -20) {
    issues.push({ severity: "info", message: `Mix is quiet (RMS ${audio.rmsDb.toFixed(1)} dBFS). Consider raising gains.` });
  }
  if (audio.rmsDb > -8) {
    issues.push({ severity: "info", message: `Mix is hot (RMS ${audio.rmsDb.toFixed(1)} dBFS) — may sound squashed.` });
  }
  if (audio.leadingSilenceSec > 1) {
    issues.push({ severity: "info", message: `${audio.leadingSilenceSec.toFixed(1)}s of leading silence.` });
  }
  if (Math.abs(audio.dcOffset) > 0.01) {
    issues.push({ severity: "warning", message: `DC offset ${audio.dcOffset.toFixed(3)} detected.` });
  }
  if (!key.matchesDeclared) {
    issues.push({
      severity: "warning",
      message: `Detected key "${key.key}" differs from declared "${key.declared}". Check accidentals/chords.`,
    });
  }

  return {
    title: score.meta.title,
    tempo,
    declaredKey: score.meta.key,
    timeSignature: score.meta.timeSignature,
    durationSec: audio.durationSec,
    sections: score.sections.map((s) => ({
      name: s.name,
      startSec: Number(ticksToSeconds(s.startTick, tempo, ppq).toFixed(2)),
      lengthSec: Number(ticksToSeconds(s.lengthTicks, tempo, ppq).toFixed(2)),
    })),
    tracks: score.tracks.map((t) => ({
      name: t.name,
      instrument: t.instrument.kind === "drums" ? "drums" : t.instrument.preset,
      events: t.events.length,
      gain: t.gain,
      pan: t.pan,
      reverbSend: t.reverbSend,
    })),
    audio,
    key,
    issues,
  };
}

/** Compact human/agent-readable summary. */
export function formatReport(r: Report): string {
  const lines: string[] = [];
  lines.push(`♪ ${r.title} — ${r.tempo} BPM, ${r.timeSignature.join("/")}, key ${r.declaredKey ?? "?"}`);
  lines.push(`  duration ${r.durationSec.toFixed(1)}s | peak ${r.audio.peakDb.toFixed(1)} dBFS | RMS ${r.audio.rmsDb.toFixed(1)} dBFS`);
  lines.push(`  detected key: ${r.key.key} (conf ${r.key.confidence})${r.key.matchesDeclared ? " ✓" : " ✗"}`);
  lines.push(`  sections: ${r.sections.map((s) => `${s.name}(${s.lengthSec}s)`).join(" → ")}`);
  for (const t of r.tracks) lines.push(`  • ${t.name} [${t.instrument}] ${t.events} notes, gain ${t.gain}`);
  if (r.issues.length) {
    lines.push(`  issues:`);
    for (const i of r.issues) lines.push(`    [${i.severity}] ${i.track ? i.track + ": " : ""}${i.message}`);
  } else {
    lines.push(`  no issues ✓`);
  }
  return lines.join("\n");
}
