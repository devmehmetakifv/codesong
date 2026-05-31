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

export interface SongProps {
  title?: string;
  tempo?: number;
  /** e.g. "G major". Named `keySignature` because JSX reserves `key`. */
  keySignature?: string;
  timeSignature?: [number, number];
  sampleRate?: number;
  seed?: number;
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
  children?: unknown;
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
/** Group children in parallel (same start time). */
export const Stack = host<{ children?: unknown }>("stack");
/** Group children sequentially (default behavior; explicit form). */
export const Seq = host<{ children?: unknown }>("seq");
