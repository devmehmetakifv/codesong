/**
 * Authoring components — the "React" of Codesong.
 *
 * Each is a host marker: a function carrying a `codesongTag` that the compiler
 * dispatches on. They are never actually called (compile reads the tag), so the
 * body just returns null. Prop types exist purely for authoring ergonomics/typing.
 *
 * NOTE: JSX reserves the `key` attribute, so the musical key is `keySignature`.
 */

export type Strum = "down" | "up" | "none";
export type ArpDir = "up" | "down" | "updown";
/**
 * Chord realization: full triad, single root, root+fifth boom-chick, root octaves,
 * or a quarter-note "walk"ing bass line (root→fifth→third→chromatic approach to the
 * next chord). Walking is only meaningful on <Progression> (it looks ahead).
 */
export type Voicing = "full" | "root" | "root5" | "octaves" | "walk";

type Tagged<P> = ((props: P) => null) & { codesongTag: string; displayName: string };

function host<P>(tag: string): Tagged<P> {
  const fn = ((_props: P) => null) as Tagged<P>;
  fn.codesongTag = tag;
  fn.displayName = tag;
  return fn;
}

export function getTag(type: unknown): string | undefined {
  return typeof type === "function" ? (type as { codesongTag?: string }).codesongTag : undefined;
}

/** Performance humanization: `true`/`false`, a 0..1 master amount, or fine control. */
export type HumanizeProp = boolean | number | { timing?: number; velocity?: number; swing?: number };

export interface SongProps {
  title?: string;
  tempo?: number;
  /** e.g. "G major". Named `keySignature` because JSX reserves `key`. */
  keySignature?: string;
  timeSignature?: [number, number];
  sampleRate?: number;
  seed?: number;
  /** Performance feel (off by `false`). Tracks may override. */
  humanize?: HumanizeProp;
  /** Swing shorthand 0..1 — delays off-beat eighths toward a shuffle. */
  swing?: number;
  /** Reverb room character: "ambience" | "room" | "plate" | "hall". */
  room?: string;
  children?: unknown;
}

export interface SectionProps {
  name?: string;
  /** Length of the section in bars. Tracks inside are layered and may loop to fill it. */
  bars?: number;
  children?: unknown;
}

export interface TrackProps {
  name?: string;
  /** Instrument preset id (e.g. "acoustic-guitar", "bass", "piano") or "drums". */
  instrument: string;
  gain?: number;
  pan?: number;
  /** Reverb send 0..1. */
  reverb?: number;
  /** Default octave for chords/notes authored without one. */
  octave?: number;
  /** Default note velocity (0..1) for this track's content. */
  velocity?: number;
  /** Repeat this track's content to fill the enclosing section. */
  loop?: boolean;
  /** Performance feel for this track (overrides the song's). */
  humanize?: HumanizeProp;
  /** Swing shorthand 0..1 for this track. */
  swing?: number;
  /** Mix-group name; tracks sharing one sum into a shared group bus before master. */
  bus?: string;
  children?: unknown;
}

/**
 * A per-track insert effect, declared as a child of a `<Track>`. Effects apply in
 * document order, between the instrument and the track fader.
 *
 *   delay   — echoes; `time` ("8n"/seconds), `feedback` 0..1, `mix` 0..1
 *   chorus  — thickening modulated delay; `rate` Hz, `depth` ms, `mix` 0..1
 *   drive   — overdrive/saturation; `amount` 0..1, `mix` 0..1
 *   tremolo — amplitude wobble; `rate` Hz, `depth` 0..1
 *   filter  — static lowpass/highpass; `mode`, `cutoff` Hz, `q`
 */
export interface EffectProps {
  type: "delay" | "chorus" | "drive" | "tremolo" | "filter";
  /** delay: note value ("8n") or seconds. */
  time?: string | number;
  /** delay feedback 0..1. */
  feedback?: number;
  /** delay/chorus/drive wet mix 0..1. */
  mix?: number;
  /** chorus/tremolo LFO rate in Hz. */
  rate?: number;
  /** chorus depth in ms / tremolo depth 0..1. */
  depth?: number;
  /** drive amount 0..1. */
  amount?: number;
  /** filter mode. */
  mode?: "lowpass" | "highpass";
  /** filter cutoff in Hz. */
  cutoff?: number;
  /** filter resonance. */
  q?: number;
}

export interface ProgressionProps {
  chords: string[];
  /** Duration of each chord. Default one bar. */
  dur?: string | number;
  octave?: number;
  strum?: Strum;
  /** How chords are realized. Use "root5" for a country boom-chick bass. */
  voicing?: Voicing;
  velocity?: number;
  children?: unknown;
}

export interface ChordProps {
  name: string;
  dur?: string | number;
  octave?: number;
  strum?: Strum;
  voicing?: Voicing;
  inversion?: number;
  velocity?: number;
}

export interface NoteProps {
  /** "C4" / "A#3" or a raw MIDI number. */
  pitch: string | number;
  dur?: string | number;
  velocity?: number;
}

export interface RestProps {
  dur: string | number;
}

export interface PatternProps {
  /**
   * Mini-notation step string. For drums: tokens map to kit pieces
   *   bd=kick sd=snare hh=hat oh=open-hat cp=clap rs=rim, "~" = rest.
   *   e.g. "bd ~ sd ~" or "bd hh sd hh".
   * For pitched tracks: note names, e.g. "c4 e4 g4 ~".
   */
  steps: string;
  /** Length of each step. Default "8n". */
  dur?: string | number;
  velocity?: number;
}

export interface ArpProps {
  chord: string;
  pattern?: ArpDir;
  octave?: number;
  /** Length of each arp note. Default "8n". */
  step?: string | number;
  /** Total length to fill (e.g. "1n" or bars). If omitted, plays the chord once. */
  length?: string | number;
  velocity?: number;
}

export const Song = host<SongProps>("song");
export const Section = host<SectionProps>("section");
export const Track = host<TrackProps>("track");
export const Progression = host<ProgressionProps>("progression");
export const Chord = host<ChordProps>("chord");
export const Note = host<NoteProps>("note");
export const Rest = host<RestProps>("rest");
export const Pattern = host<PatternProps>("pattern");
export const Arp = host<ArpProps>("arp");
/** Per-track insert effect (delay/chorus/drive/tremolo/filter). */
export const Effect = host<EffectProps>("effect");
/** Group children in parallel (same start time). */
export const Stack = host<{ children?: unknown }>("stack");
/** Group children sequentially (default behavior; explicit form). */
export const Seq = host<{ children?: unknown }>("seq");
