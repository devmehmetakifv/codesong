# 🎵 Codesong

A song written as code. Edit `song.tsx`, then render it to audio.

```bash
npm run render    # song.tsx -> out.wav  (+ out.report.json analysis)
npm run mp3       # song.tsx -> out.mp3
npm run presets   # list available instruments
```

The render prints an analysis report (loudness, detected key, per-track notes, issues) you can
use to fix and refine the song. See **CODESONG.md** for the full authoring API.
