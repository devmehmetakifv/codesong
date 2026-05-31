import song from "../examples/cheerful-country/song.js";
import { compile, scoreDurationTicks } from "../src/index.js";
import { renderScore } from "../src/renderer/render.js";

const score = compile(song);
console.log(`Title: ${score.meta.title} | tempo ${score.meta.tempo} | key ${score.meta.key}`);
console.log(`Tracks: ${score.tracks.map((t) => `${t.name}(${t.events.length})`).join(", ")}`);
console.log(`Sections: ${score.sections.map((s) => s.name).join(", ")}`);
console.log(`Duration ticks: ${scoreDurationTicks(score)}`);

const t0 = Date.now();
const res = await renderScore(score, { out: "out.wav" });
const ms = Date.now() - t0;

// peak + RMS to confirm non-silent
let peak = 0;
let sumSq = 0;
let n = 0;
for (let c = 0; c < res.buffer.numberOfChannels; c++) {
  const d = res.buffer.getChannelData(c);
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > peak) peak = a;
    sumSq += d[i] * d[i];
    n++;
  }
}
const rms = Math.sqrt(sumSq / n);
console.log(`Rendered ${res.durationSec.toFixed(1)}s in ${ms}ms (${(res.durationSec * 1000 / ms).toFixed(0)}x realtime)`);
console.log(`peak=${peak.toFixed(3)} rms=${rms.toFixed(4)} -> ${res.out}`);
