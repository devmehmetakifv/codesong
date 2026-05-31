# 🎵 Codesong

**Code songs, render audio.** Describe a song, write it as declarative TypeScript/JSX, and render a
listenable audio file. Built to be written by an agent (Claude Code) and iterated with a tight
feedback loop — components in, sound out.

```bash
npx create-codesong@latest my-song   # scaffold a project
cd my-song && npm run render          # song.tsx -> out.wav
```

```tsx
export default (
  <Song title="Sunny Backroads" tempo={124} keySignature="G major">
    <Section name="verse" bars={8}>
      <Track instrument="acoustic-guitar" reverb={0.18} loop>
        <Progression chords={["G", "C", "G", "D"]} dur="1n" strum="down" />
      </Track>
      <Track instrument="bass" octave={2} loop>
        <Progression chords={["G", "C", "G", "D"]} dur="1n" voicing="root5" />
      </Track>
      <Track instrument="drums" loop>
        <Pattern steps="bd ~ sd ~ bd bd sd ~" dur="8n" />
      </Track>
    </Section>
  </Song>
);
```

```
$ codesong render song.tsx -o out.wav
♪ Sunny Backroads — 124 BPM, 4/4, key G major
  duration 41.2s | peak -1.0 dBFS | RMS -12.1 dBFS
  detected key: G major (conf 0.985) ✓
  sections: intro → verse → chorus
  no issues ✓
```

## Why this works

Codesong is thin orchestration over proven open source. The hard part isn't DSP — it's the
authoring model and the agent feedback loop. The pipeline:

| Stage | What it does |
|---|---|
| declarative TS/JSX song | you (or the agent) write a component tree |
| **music IR** | compiles to a tick-based note/event timeline |
| **instruments** | synthesis on the Web Audio graph |
| **mix/master + encode** | sums tracks, normalizes, writes WAV/MP3 |
| **Codesong Studio** | live browser preview of the same engine |

## Develop this repo

```bash
npm install
npm run render -- examples/cheerful-country/song.tsx -o out.wav   # render + analysis report
npm run preview                                                   # live studio at :5174
npm test                                                          # unit + render integration
npx tsx src/cli/index.ts presets                                  # list instruments
npm run build                                                     # build dist/ for publishing
```

No external sample packs or native binaries required — instruments are synthesized directly on the
Web Audio graph (via `node-web-audio-api`), so it renders out of the box at ~9× real time.

## How it's built

```
song.tsx ─compile→ ScoreIR ─schedule→ Web Audio graph ─render→ AudioBuffer ─→ WAV/MP3
                                                                          └→ report.json (analysis)
```

- **`src/core`** — JSX runtime (no React), music IR, `tonal`-backed theory helpers, `compile()`.
- **`src/instruments`** — data-driven synth presets + a synthesized drum kit.
- **`src/renderer`** — `engine.ts` schedules a score onto any Web Audio context (shared by the
  Node offline renderer **and** the browser preview); `render.ts` renders + normalizes + encodes.
- **`src/analyze`** — symbolic validation + audio features (loudness, clipping, key estimate) →
  the report the agent reads to self-correct.
- **`src/cli`** — `render` / `presets` / `init`.
- **`src/preview`** — Vite studio: live playback, transport, section map, hot reload.

See [CODESONG.md](./CODESONG.md) for the full authoring API (the agent guide).

## Status & roadmap

**Working today:** declarative authoring, full render pipeline, analysis/feedback loop, live
preview, genre examples (country, lo-fi, blues piano, an epic-minor theme), deterministic renders,
green tests + typecheck, and a publishable package + `create-codesong` scaffolder.

**Next:** SoundFont/SFZ sampler backend (FluidSynth/sfizz) for acoustic realism; MIDI/MusicXML
export; loudness-normalized MP3; more genre presets; and an optional **vocals** plugin
(DiffSinger/NNSVS) — deferred because it needs Python + ML models + voicebanks.
