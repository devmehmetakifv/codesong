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
| `<Song>` | Root | `tempo`, `keySignature` (NOT `key`), `timeSignature`, `title`, `seed`, `humanize`, `swing`, `room` |
| `<Section>` | Sequential block | `name`, `bars` |
| `<Track>` | One instrument | `instrument`, `name`, `gain`, `pan` (-1..1), `reverb` (0..1), `octave`, `loop`, `humanize`, `swing` |
| `<Progression>` | Chord sequence | `chords={["G","C","D"]}`, `dur`, `strum`, `voicing` |
| `<Chord>` | One chord | `name="Cmaj7"`, `dur`, `strum`, `voicing`, `inversion` |
| `<Arp>` | Arpeggiate a chord | `chord`, `pattern` (`up`/`down`/`updown`), `step`, `length` |
| `<Note>` | One note | `pitch`, `dur`, `velocity` |
| `<Rest>` | Silence | `dur` |
| `<Pattern>` | Step sequence / drums | `steps="bd ~ sd ~"`, `dur`, `velocity` |
| `<Effect>` | Per-track insert FX | `type`, + per-type params (see below) |
| `<Stack>` / `<Seq>` | Layer / sequence children | — |

`voicing`: `"full"` (triad, default), `"root"` (bass single note), `"root5"` (boom-chick
root→fifth, great for country/folk bass), `"octaves"`.

## Instruments (synth presets)

`acoustic-guitar`/`guitar`, `electric-guitar`, `bass`, `piano`/`keys`, `electric-piano`,
`pad`, `strings`, `organ`, `lead`, `fiddle`, `flute`. Run `codesong presets` to list.

Guitars are physically modeled (Karplus-Strong) for a real plucked-string tone; `electric-guitar`
rings brighter and longer than `acoustic-guitar`. Across all instruments, harder notes (higher
`velocity`) play brighter, not just louder, and plucked/struck voices get a note-on attack edge —
so dynamics shape timbre the way they do on a real instrument.

**Drums:** `instrument="drums"` + `<Pattern>` with tokens:
`bd` kick · `sd` snare · `hh` closed hat · `oh` open hat · `cp` clap · `rs` rim ·
`cr` crash · `rd` ride · `lt`/`mt`/`ht` toms · `~` rest.

## Composition tips

- Pick a `keySignature` and use diatonic chords. The report estimates the key from your notes
  and flags mismatches — a mismatch usually means a wrong accidental or borrowed chord.
- Keep instruments in range (bass low, fiddle/lead high). The report warns on out-of-range notes.
- Set a clear arrangement: distinct sections, layered tracks, bass + drums as the foundation.
- Use `pan` to spread instruments and `reverb` (per-track send, 0..1) for space. Pick the room
  character with `<Song room="…">`: `ambience` (tight), `room` (default), `plate` (bright, dense),
  `hall` (big, long tail). The reverb is true convolution, so sends blend smoothly.
- The mix is auto-mastered (glue compression, rumble-cut + air EQ, stereo widening, soft limiter),
  so aim for a balanced arrangement and let the master bus glue it. Watch the report's `peak`/`RMS`:
  target RMS roughly -14 to -10 dBFS, peak under 0 dBFS (clipping = lower gains).
- Reusable parts: write a function component that returns a `<Track>` (see the country example).

## Feel: humanize & swing

Renders are humanized by default so notes don't land mechanically on the grid — micro-timing
drift, velocity variation, and slight note-length wobble, all seeded by `seed` so output stays
reproducible. Tune it per song or per track:

- `humanize` — `true`/`false`, a number `0..1` (master amount for timing + dynamics), or an object
  `{ timing, velocity, swing }` (each `0..1`). Default ≈ `{ timing: 0.4, velocity: 0.45, swing: 0 }`.
  Set `humanize={false}` on a `<Track>` to keep it dead-on the grid (e.g. a programmed synth arp).
- `swing` — `0..1` shorthand that delays off-beat eighths toward a triplet shuffle. ~`0.3–0.6` is
  musical; great on drums/keys for jazz, blues, funk, lo-fi. Put it on `<Song>` for the whole
  groove or a single `<Track>`.

Per-instrument feel is built in (drummers lock tight, pads/leads breathe), so a single
`humanize` amount sounds right across the arrangement.

## Effects & mix buses

Drop `<Effect>` elements inside a `<Track>` to add insert effects — they apply in document
order, between the instrument and the track fader (so reverb sends carry the effected signal):

```tsx
<Track instrument="electric-piano" reverb={0.3}>
  <Effect type="filter" mode="lowpass" cutoff={2400} />   {/* muffle */}
  <Effect type="chorus" rate={0.8} depth={5} mix={0.35} /> {/* widen/warble */}
  <Progression chords={["Am7", "Dm7"]} dur="1n" />
</Track>
```

| `type` | What | Params (defaults) |
|---|---|---|
| `delay` | Echoes | `time` note/seconds (`"8n"`), `feedback` (0.3), `mix` (0.3) |
| `chorus` | Thickening/width | `rate` Hz (1.2), `depth` ms (4), `mix` (0.4) |
| `drive` | Overdrive/warmth | `amount` 0..1 (0.4), `mix` (0.6) |
| `tremolo` | Amplitude wobble | `rate` Hz (5), `depth` 0..1 (0.5) |
| `filter` | Static tone shaping | `mode` `lowpass`/`highpass`, `cutoff` Hz (1200), `q` (1) |

**Mix-group buses:** give tracks the same `bus="name"` to sum them through one group before the
master (e.g. `bus="beat"` on every drum/percussion track), keeping related parts glued together.

## Reading the report

- `detected key … ✓/✗` — harmony sanity check vs declared key.
- `peak`/`RMS dBFS` — loudness; clipping samples mean reduce gains.
- per-track note counts — `0 notes` = a track did nothing (check `loop`/content).
- `issues[]` — `error` (must fix, e.g. silent), `warning` (likely wrong), `info` (style note).
