# Codesong — Agent Guide

You are writing a **song as code**. A song is a TypeScript/JSX file that default-exports a
`<Song>` element. The framework compiles it to a music IR, renders it to audio (`.wav`/`.mp3`),
and prints an **analysis report** you use to self-correct. Components in, sound out.

## Workflow

1. Write/edit a `song.tsx` that `export default`s a `<Song>`.
2. Render + analyze: `codesong render song.tsx -o out.wav`
   (or `npx tsx src/cli/index.ts render song.tsx -o out.wav` in this repo).
3. Read the printed report (also written to `out.report.json`). Fix any issues, adjust the mix,
   re-render. The human listens to `out.wav` for the final subjective call.

## Mental model

- `<Song>` → `<Section>`s play **sequentially** (intro → verse → chorus …).
- Inside a section, `<Track>`s play **in parallel** (layered). A track is one instrument/voice.
- Same-named tracks across sections **merge** into one instrument part.
- `loop` on a track repeats its content to fill the section — write one bar, loop it.
- Time is musical: durations are note values (`"1n"` whole, `"2n"` half, `"4n"` quarter,
  `"8n"`, `"16n"`; add `.` dotted, `t` triplet). Pitches are `"C4"`, `"G#3"`, or raw MIDI.

## Components

| Component | Purpose | Key props |
|---|---|---|
| `<Song>` | Root | `tempo`, `keySignature` (NOT `key`), `timeSignature`, `title`, `seed` |
| `<Section>` | Sequential block | `name`, `bars` |
| `<Track>` | One instrument | `instrument`, `name`, `gain`, `pan` (-1..1), `reverb` (0..1), `octave`, `loop` |
| `<Progression>` | Chord sequence | `chords={["G","C","D"]}`, `dur`, `strum`, `voicing` |
| `<Chord>` | One chord | `name="Cmaj7"`, `dur`, `strum`, `voicing`, `inversion` |
| `<Arp>` | Arpeggiate a chord | `chord`, `pattern` (`up`/`down`/`updown`), `step`, `length` |
| `<Note>` | One note | `pitch`, `dur`, `velocity` |
| `<Rest>` | Silence | `dur` |
| `<Pattern>` | Step sequence / drums | `steps="bd ~ sd ~"`, `dur`, `velocity` |
| `<Stack>` / `<Seq>` | Layer / sequence children | — |

`voicing`: `"full"` (triad, default), `"root"` (bass single note), `"root5"` (boom-chick
root→fifth, great for country/folk bass), `"octaves"`.

## Instruments (synth presets)

`acoustic-guitar`, `electric-guitar`/`guitar`, `bass`, `piano`/`keys`, `electric-piano`,
`pad`, `strings`, `organ`, `lead`, `fiddle`, `flute`. Run `codesong presets` to list.

**Drums:** `instrument="drums"` + `<Pattern>` with tokens:
`bd` kick · `sd` snare · `hh` closed hat · `oh` open hat · `cp` clap · `rs` rim ·
`cr` crash · `rd` ride · `lt`/`mt`/`ht` toms · `~` rest.

## Composition tips

- Pick a `keySignature` and use diatonic chords. The report estimates the key from your notes
  and flags mismatches — a mismatch usually means a wrong accidental or borrowed chord.
- Keep instruments in range (bass low, fiddle/lead high). The report warns on out-of-range notes.
- Set a clear arrangement: distinct sections, layered tracks, bass + drums as the foundation.
- Use `pan` to spread instruments and `reverb` for space. Watch the report's `peak`/`RMS`:
  target RMS roughly -14 to -10 dBFS, peak under 0 dBFS (clipping = lower gains).
- Reusable parts: write a function component that returns a `<Track>` (see the country example).

## Reading the report

- `detected key … ✓/✗` — harmony sanity check vs declared key.
- `peak`/`RMS dBFS` — loudness; clipping samples mean reduce gains.
- per-track note counts — `0 notes` = a track did nothing (check `loop`/content).
- `issues[]` — `error` (must fix, e.g. silent), `warning` (likely wrong), `info` (style note).
