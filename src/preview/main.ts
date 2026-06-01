/** Codesong Studio — live in-browser playback using the same engine as the renderer. */
import { compile, humanize, scoreDurationTicks, ticksToSeconds, type MusicChild } from "codesong";
import { scheduleScore } from "../renderer/engine.js";

/** Compile + humanize, matching the offline renderer's pipeline exactly. */
const prepare = (m: MusicChild) => humanize(compile(m));
import country from "../../examples/cheerful-country/song.tsx";
import lofi from "../../examples/lofi-beat/song.tsx";
import blues from "../../examples/blues-piano/song.tsx";

const SONGS: Record<string, MusicChild> = {
  "Cheerful Country": country,
  "Lo-fi Beat": lofi,
  "Blues Piano": blues,
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const songSel = $<HTMLSelectElement>("song");
const playBtn = $<HTMLButtonElement>("play");
const stopBtn = $<HTMLButtonElement>("stop");
const clock = $("clock");
const progress = $("progress");
const sectionsEl = $("sections");
const tracksEl = $("tracks");
const infoEl = $("info");

for (const name of Object.keys(SONGS)) {
  const opt = document.createElement("option");
  opt.value = name;
  opt.textContent = name;
  songSel.appendChild(opt);
}

let ctx: AudioContext | null = null;
let raf = 0;
let startTime = 0;
let totalSec = 0;

function describe(name: string) {
  const score = prepare(SONGS[name]);
  const { tempo, ppq } = score.meta;
  totalSec = ticksToSeconds(scoreDurationTicks(score), tempo, ppq);
  infoEl.textContent = `${score.meta.title} — ${tempo} BPM, key ${score.meta.key ?? "?"} · ${totalSec.toFixed(1)}s`;
  sectionsEl.innerHTML = "";
  for (const s of score.sections) {
    const div = document.createElement("div");
    div.className = "section";
    div.textContent = s.name;
    div.style.flex = String(s.lengthTicks);
    sectionsEl.appendChild(div);
  }
  tracksEl.innerHTML = score.tracks
    .map((t) => `<div>• ${t.name} <span class="meta">[${t.instrument.kind === "drums" ? "drums" : t.instrument.preset}] ${t.events.length} notes</span></div>`)
    .join("");
  return score;
}

function stop() {
  cancelAnimationFrame(raf);
  if (ctx) { ctx.close(); ctx = null; }
  progress.style.width = "0%";
  clock.textContent = "0.0s";
  playBtn.disabled = false;
  stopBtn.disabled = true;
}

function tick() {
  if (!ctx) return;
  const elapsed = ctx.currentTime - startTime;
  clock.textContent = `${Math.max(0, elapsed).toFixed(1)}s`;
  progress.style.width = `${Math.min(100, (elapsed / totalSec) * 100)}%`;
  if (elapsed >= totalSec + 1.5) { stop(); return; }
  raf = requestAnimationFrame(tick);
}

playBtn.addEventListener("click", () => {
  stop();
  const score = prepare(SONGS[songSel.value]);
  ctx = new AudioContext();
  startTime = ctx.currentTime + 0.12;
  scheduleScore(ctx, score, startTime);
  playBtn.disabled = true;
  stopBtn.disabled = false;
  raf = requestAnimationFrame(tick);
});

stopBtn.addEventListener("click", stop);
songSel.addEventListener("change", () => { stop(); describe(songSel.value); });

describe(songSel.value);
