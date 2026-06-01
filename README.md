<a id="readme-top"></a>

<!--
*** Codesong README — built from the Best-README-Template
*** https://github.com/othneildrew/Best-README-Template
*** Reference-style links are collected at the bottom of this file.
-->

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![npm version][npm-shield]][npm-url]
[![MIT License][license-shield]][license-url]



<!-- PROJECT HEADER -->
<br />
<div align="center">
  <a href="https://github.com/devmehmetakifv/codesong">
    <h1>🎵 Codesong</h1>
  </a>

  <p align="center">
    <b>Code songs, render audio.</b><br />
    A declarative TypeScript/JSX music framework — write a song as a component tree,
    render a listenable <code>.wav</code>/<code>.mp3</code>, and read an analysis report to self-correct.
    <br />
    <br />
    <a href="./CODESONG.md"><strong>Explore the authoring API »</strong></a>
    <br />
    <br />
    <a href="./examples">View Examples</a>
    &middot;
    <a href="https://github.com/devmehmetakifv/codesong/issues/new?labels=bug&template=bug-report.md">Report Bug</a>
    &middot;
    <a href="https://github.com/devmehmetakifv/codesong/issues/new?labels=enhancement&template=feature-request.md">Request Feature</a>
  </p>
</div>



<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li>
      <a href="#usage">Usage</a>
      <ul>
        <li><a href="#write-a-song">Write a song</a></li>
        <li><a href="#render-it">Render it</a></li>
        <li><a href="#feel-effects--mixing">Feel, effects &amp; mixing</a></li>
      </ul>
    </li>
    <li><a href="#how-its-built">How It's Built</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## About The Project

Codesong turns a song into a TypeScript/JSX file. You write a component tree that
default-exports a `<Song>`; the framework compiles it to a music IR, synthesizes it on a Web
Audio graph, auto-masters the mix, and writes an audio file **plus** a JSON analysis report
(key detection, loudness, clipping, per-track note counts, issues). Components in, sound out.

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

```text
$ codesong render song.tsx -o out.wav
♪ Sunny Backroads — 124 BPM, 4/4, key G major
  duration 41.2s | peak -1.0 dBFS | RMS -12.1 dBFS
  detected key: G major (conf 0.985) ✓
  sections: intro → verse → chorus
  no issues ✓
```

Why it exists:

* **Authoring, not DSP.** It is thin orchestration over proven open source — the value is the
  declarative model and a tight, agent-friendly feedback loop, not hand-rolled signal processing.
* **Self-contained.** No sample packs or native binaries to install — instruments are
  synthesized directly on the Web Audio graph, so it renders out of the box at ~9× real time.
* **Deterministic.** A `seed` drives all humanization and procedural synthesis, so the same
  song always renders the same audio — diffable, reproducible, CI-friendly.
* **Built for agents.** The analysis report exists so a tool (or a human) can read what's
  wrong and re-render — components in, sound out, repeat.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Built With

* [![TypeScript][TypeScript-shield]][TypeScript-url]
* [![Node.js][Node-shield]][Node-url]
* [![Vite][Vite-shield]][Vite-url]
* [![Vitest][Vitest-shield]][Vitest-url]
* [node-web-audio-api](https://github.com/ircam-ismm/node-web-audio-api) — offline Web Audio rendering
* [tonal](https://github.com/tonaljs/tonal) — music theory helpers (keys, chords, scales)
* [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) — MP3 encoding

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- GETTING STARTED -->
## Getting Started

### Prerequisites

* **Node.js 18+** (the renderer targets ES2022 and the Web Audio API).
* npm (ships with Node).

  ```sh
  node --version   # v18.0.0 or newer
  ```

### Installation

The fastest path — scaffold a new project, then render the starter song:

```sh
npx create-codesong@latest my-song
cd my-song
npm run render          # song.tsx -> out.wav + out.report.json
```

Or add Codesong to an existing TypeScript project:

1. Install the package.

   ```sh
   npm install codesong
   ```

2. Point JSX at Codesong's runtime in your `tsconfig.json` (no React needed).

   ```jsonc
   {
     "compilerOptions": {
       "jsx": "react-jsx",
       "jsxImportSource": "codesong"
     }
   }
   ```

3. (Optional) Install the CLI globally to use `codesong` anywhere.

   ```sh
   npm install -g codesong
   codesong init my-song   # scaffold song.tsx + CODESONG.md
   codesong presets        # list the available instruments
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- USAGE EXAMPLES -->
## Usage

The mental model is small: `<Section>`s play **sequentially**, `<Track>`s inside a section play
**in parallel**, and same-named tracks across sections **merge** into one part. Time is musical —
durations are note values (`"1n"`, `"4n"`, `"8n."`, `"8nt"`) and pitches are `"C4"`, `"G#3"`, or raw MIDI.

### Write a song

Create a `song.tsx` that default-exports a `<Song>`. Components compose, and you can extract
reusable parts as plain function components:

```tsx
import { Song, Section, Track, Progression, Pattern } from "codesong";

function CountryBeat() {
  return (
    <Track instrument="drums" loop>
      <Pattern steps="bd ~ sd ~ bd bd sd ~" dur="8n" velocity={0.9} />
      <Pattern steps="hh hh hh hh hh hh hh hh" dur="8n" velocity={0.5} />
    </Track>
  );
}

export default (
  <Song title="Sunny Backroads" tempo={124} keySignature="G major" seed={7}>
    <Section name="verse" bars={8}>
      <Track instrument="acoustic-guitar" reverb={0.18} loop>
        <Progression chords={["G", "C", "G", "D"]} dur="1n" strum="down" />
      </Track>
      <CountryBeat />
    </Section>
  </Song>
);
```

### Render it

```sh
codesong render song.tsx -o out.wav      # WAV + out.report.json
codesong render song.tsx --mp3           # MP3 instead
```

Read the printed report, fix anything it flags (out-of-key notes, clipping, silent tracks),
re-render, then listen. Want the full component and instrument reference? See
**[CODESONG.md](./CODESONG.md)** — the complete authoring guide.

### Feel, effects & mixing

Renders are humanized by default (seeded micro-timing, dynamics, and swing), and you can drop
insert effects inside any `<Track>`:

```tsx
<Song swing={0.55} room="room">
  <Section name="loop" bars={8}>
    <Track instrument="electric-piano" reverb={0.35} loop>
      <Effect type="filter" mode="lowpass" cutoff={2400} />
      <Effect type="chorus" rate={0.8} depth={5} mix={0.35} />
      <Progression chords={["Am7", "Dm7", "Gmaj7", "Cmaj7"]} dur="1n" />
    </Track>
    <Track instrument="drums" bus="beat" loop>
      <Pattern steps="bd ~ ~ ~ sd ~ ~ bd" dur="8n" />
    </Track>
  </Section>
</Song>
```

| Effect | What | Key params (defaults) |
|---|---|---|
| `delay` | Echoes | `time` (`"8n"`), `feedback` (0.3), `mix` (0.3) |
| `chorus` | Thickening / width | `rate` Hz (1.2), `depth` ms (4), `mix` (0.4) |
| `drive` | Overdrive / warmth | `amount` (0.4), `mix` (0.6) |
| `tremolo` | Amplitude wobble | `rate` Hz (5), `depth` (0.5) |
| `filter` | Tone shaping | `mode` (`lowpass`), `cutoff` Hz (1200), `q` (1) |

More runnable songs live in [`examples/`](./examples) — country, lo-fi, blues piano, and an
epic-minor theme.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- HOW IT'S BUILT -->
## How It's Built

```text
song.tsx ─compile→ ScoreIR ─schedule→ Web Audio graph ─render→ AudioBuffer ─→ WAV/MP3
                                                                          └→ report.json (analysis)
```

| Module | Responsibility |
|---|---|
| `src/core` | JSX runtime (no React), music IR, `tonal`-backed theory, `compile()`, the `humanize` pass |
| `src/instruments` | Data-driven synth presets, a synthesized drum kit, insert effects, convolution reverb |
| `src/renderer` | `engine.ts` schedules a score onto any Web Audio context (shared by Node **and** the browser preview); `render.ts` masters, normalizes, and encodes |
| `src/analyze` | Symbolic validation + audio features (loudness, clipping, key estimate) → the report |
| `src/cli` | `render` / `presets` / `init` |
| `src/preview` | Vite studio: live playback, transport, section map, hot reload |

Develop the repo itself:

```sh
npm install
npm run render -- examples/cheerful-country/song.tsx -o out.wav   # render + report
npm run preview                                                   # live studio at :5174
npm test                                                          # unit + render integration
npm run build                                                     # build dist/ for publishing
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ROADMAP -->
## Roadmap

- [x] Declarative TS/JSX authoring + full render pipeline
- [x] Analysis / feedback report loop
- [x] Humanization, swing, and per-instrument feel
- [x] Per-track insert effects + convolution reverb + auto-master bus
- [x] Karplus-Strong physically-modeled guitars
- [x] Live browser studio (Vite) sharing the render engine
- [ ] SoundFont / SFZ sampler backend (FluidSynth / sfizz) for acoustic realism
- [ ] MIDI / MusicXML export
- [ ] Loudness-normalized MP3 export
- [ ] More genre presets
- [ ] Optional **vocals** plugin (DiffSinger / NNSVS)

See the [open issues](https://github.com/devmehmetakifv/codesong/issues) for a full list of
proposed features and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTRIBUTING -->
## Contributing

Contributions make the open source community an amazing place to learn and create. Any
contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull
request. You can also simply open an issue with the tag "enhancement".

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/amazing-feature`)
3. Commit your Changes (`git commit -m 'feat: add some amazing feature'`)
4. Push to the Branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please keep tests green (`npm test`) and the build clean (`npm run typecheck`) before opening a PR.

### Top contributors:

<a href="https://github.com/devmehmetakifv/codesong/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=devmehmetakifv/codesong" alt="contrib.rocks image" />
</a>

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- LICENSE -->
## License

Distributed under the MIT License. See [`LICENSE`](./LICENSE) for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTACT -->
## Contact

Mehmet Akif — [@devmehmetakifv](https://github.com/devmehmetakifv) — mehmetakifvrdr@gmail.com

Project Link: [https://github.com/devmehmetakifv/codesong](https://github.com/devmehmetakifv/codesong)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* [tonal](https://github.com/tonaljs/tonal) — music theory primitives
* [node-web-audio-api](https://github.com/ircam-ismm/node-web-audio-api) — Web Audio in Node
* [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) — bundled FFmpeg for MP3
* [tsx](https://github.com/privatenumber/tsx) — on-the-fly TS/TSX loading for the CLI
* [Best-README-Template](https://github.com/othneildrew/Best-README-Template) — this README's structure

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/devmehmetakifv/codesong.svg?style=for-the-badge
[contributors-url]: https://github.com/devmehmetakifv/codesong/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/devmehmetakifv/codesong.svg?style=for-the-badge
[forks-url]: https://github.com/devmehmetakifv/codesong/network/members
[stars-shield]: https://img.shields.io/github/stars/devmehmetakifv/codesong.svg?style=for-the-badge
[stars-url]: https://github.com/devmehmetakifv/codesong/stargazers
[issues-shield]: https://img.shields.io/github/issues/devmehmetakifv/codesong.svg?style=for-the-badge
[issues-url]: https://github.com/devmehmetakifv/codesong/issues
[npm-shield]: https://img.shields.io/npm/v/codesong.svg?style=for-the-badge
[npm-url]: https://www.npmjs.com/package/codesong
[license-shield]: https://img.shields.io/github/license/devmehmetakifv/codesong?style=for-the-badge
[license-url]: ./LICENSE
[TypeScript-shield]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Node-shield]: https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white
[Node-url]: https://nodejs.org/
[Vite-shield]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vitejs.dev/
[Vitest-shield]: https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white
[Vitest-url]: https://vitest.dev/
