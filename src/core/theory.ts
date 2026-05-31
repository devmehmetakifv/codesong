/** Thin wrappers over tonal.js: chord symbols / scales -> MIDI note numbers with sane voicings. */
import { Note, Chord, Scale, Key } from "tonal";

/** "C4" / "A#3" / "Db5" -> MIDI number. Throws on invalid. */
export function noteNameToMidi(name: string): number {
  const midi = Note.midi(name);
  if (midi == null) throw new Error(`Invalid note name: "${name}"`);
  return midi;
}

export function midiToNoteName(midi: number): string {
  return Note.fromMidi(midi);
}

/**
 * Chord symbol ("Cmaj7", "Am", "G7", "D") -> ascending MIDI voicing.
 * Pitch classes from tonal are stacked upward starting at `octave`, so the chord
 * reads root-up without collapsing into one pitch. `inversion` rotates the voicing.
 */
export function chordToMidi(symbol: string, octave = 3, inversion = 0): number[] {
  const chord = Chord.get(symbol);
  if (chord.empty || chord.notes.length === 0) {
    throw new Error(`Unknown chord symbol: "${symbol}"`);
  }
  const pcs = chord.notes;
  const midis: number[] = [];
  let prev = -Infinity;
  for (const pc of pcs) {
    let m = noteNameToMidi(`${pc}${octave}`);
    while (m <= prev) m += 12;
    midis.push(m);
    prev = m;
  }
  // Apply inversion by moving the lowest notes up an octave.
  for (let i = 0; i < inversion; i++) {
    const lowest = midis.shift()!;
    midis.push(lowest + 12);
  }
  return midis;
}

/** Root note (lowest) of a chord symbol at the given octave — handy for bass lines. */
export function chordRootMidi(symbol: string, octave = 2): number {
  const chord = Chord.get(symbol);
  const tonic = chord.tonic || chord.notes[0];
  if (!tonic) throw new Error(`Unknown chord symbol: "${symbol}"`);
  return noteNameToMidi(`${tonic}${octave}`);
}

/** Notes of a scale ("C major", "A minor pentatonic") as MIDI, spanning `count` notes upward from `octave`. */
export function scaleToMidi(scaleName: string, octave = 4, count = 8): number[] {
  const scale = Scale.get(scaleName);
  if (scale.empty || scale.notes.length === 0) {
    throw new Error(`Unknown scale: "${scaleName}"`);
  }
  const pcs = scale.notes;
  const out: number[] = [];
  let oct = octave;
  let prev = -Infinity;
  for (let i = 0; i < count; i++) {
    const pc = pcs[i % pcs.length];
    let m = noteNameToMidi(`${pc}${oct}`);
    while (m <= prev) m += 12;
    out.push(m);
    prev = m;
    if ((i + 1) % pcs.length === 0) oct++;
  }
  return out;
}

/** Diatonic triads of a major key, e.g. diatonicTriads("G") -> ["G","Am","Bm","C","D","Em","F#dim"]. */
export function diatonicTriads(tonic: string): string[] {
  return [...Key.majorKey(tonic).triads];
}
