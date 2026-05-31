/**
 * Music Intermediate Representation (IR).
 *
 * The deterministic, serializable score that the authoring JSX compiles down to,
 * and that the renderer consumes. A flat, tick-based timeline of note events grouped
 * into tracks, plus a tempo/meter map and a section arrangement.
 * Time is measured in PPQ ticks (resolution-independent),
 * converted to seconds at render time using the tempo.
 */

export type Ticks = number;

/** A single sounding note on a track. */
export interface NoteEvent {
  /** Absolute start in ticks from song origin. */
  startTick: Ticks;
  /** Length in ticks. */
  durationTicks: Ticks;
  /** MIDI note number (60 = C4). */
  midi: number;
  /** 0..1 */
  velocity: number;
}

/** How a track makes sound. Discriminated by `kind`. */
export type InstrumentSpec =
  | { kind: "synth"; preset: string }
  | { kind: "drums"; kit: string };

export interface TrackIR {
  id: string;
  name: string;
  instrument: InstrumentSpec;
  events: NoteEvent[];
  /** Linear gain multiplier, 0..1+ (1 = unity). */
  gain: number;
  /** Stereo pan, -1 (L) .. 1 (R). */
  pan: number;
  /** Reverb bus send amount, 0..1. */
  reverbSend: number;
}

export interface SectionIR {
  name: string;
  startTick: Ticks;
  lengthTicks: Ticks;
}

export interface ScoreMeta {
  title: string;
  /** Beats per minute (quarter notes). */
  tempo: number;
  /** [beatsPerBar, beatUnit] e.g. [4,4]. */
  timeSignature: [number, number];
  /** e.g. "G major" — informational + used by theory helpers. */
  key?: string;
  /** Ticks per quarter note. */
  ppq: number;
  sampleRate: number;
  /** Seed for any humanize/randomization, so renders are reproducible. */
  seed: number;
}

export interface ScoreIR {
  meta: ScoreMeta;
  tracks: TrackIR[];
  sections: SectionIR[];
}

export const DEFAULT_PPQ = 480;
export const DEFAULT_SAMPLE_RATE = 48000;

/** Ticks in one bar for the given time signature. */
export function ticksPerBar(ppq: number, [num, den]: [number, number]): Ticks {
  return Math.round(num * ppq * (4 / den));
}

/** Total duration of a score in ticks (end of the last section, or last event). */
export function scoreDurationTicks(score: ScoreIR): Ticks {
  const sectionEnd = score.sections.reduce(
    (max, s) => Math.max(max, s.startTick + s.lengthTicks),
    0,
  );
  const eventEnd = score.tracks.reduce(
    (max, t) =>
      t.events.reduce((m, e) => Math.max(m, e.startTick + e.durationTicks), max),
    0,
  );
  return Math.max(sectionEnd, eventEnd);
}

/** Convert ticks to seconds at a constant tempo. */
export function ticksToSeconds(ticks: Ticks, tempo: number, ppq: number): number {
  const secondsPerBeat = 60 / tempo;
  return (ticks / ppq) * secondsPerBeat;
}
