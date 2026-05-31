/**
 * Phase 0 de-risk spike. Proves the core render assumptions on THIS machine:
 *   1. node-web-audio-api can run an OfflineAudioContext faster than real time.
 *   2. We can build a Web Audio graph (osc + gain envelope) and render to a buffer.
 *   3. We can serialize the rendered buffer to a valid WAV file.
 *   4. FFmpeg can read that WAV and encode to mp3 (the stitch/encode chain).
 * If this runs and produces a non-silent WAV, the whole pipeline is viable.
 */
import { OfflineAudioContext } from "node-web-audio-api";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SAMPLE_RATE = 48000;
const DURATION = 2; // seconds

const ctx = new OfflineAudioContext(2, SAMPLE_RATE * DURATION, SAMPLE_RATE);

// Two plucked notes (A4, E5) with a quick decay envelope — proves scheduling + envelopes.
function pluck(freq: number, start: number) {
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.4, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + 1);
}
pluck(440, 0);
pluck(659.25, 1);

const t0 = Date.now();
const buffer = await ctx.startRendering();
const renderMs = Date.now() - t0;

// --- serialize AudioBuffer -> 16-bit PCM WAV (no external dep) ---
function encodeWav(buf: AudioBuffer): Buffer {
  const numCh = buf.numberOfChannels;
  const len = buf.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const out = Buffer.alloc(44 + dataSize);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + dataSize, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(numCh, 22);
  out.writeUInt32LE(buf.sampleRate, 24);
  out.writeUInt32LE(buf.sampleRate * blockAlign, 28);
  out.writeUInt16LE(blockAlign, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(dataSize, 40);
  const channels = Array.from({ length: numCh }, (_, c) => buf.getChannelData(c));
  let offset = 44;
  let peak = 0;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      peak = Math.max(peak, Math.abs(s));
      out.writeInt16LE((s < 0 ? s * 0x8000 : s * 0x7fff) | 0, offset);
      offset += 2;
    }
  }
  console.log(`  peak amplitude: ${peak.toFixed(3)} (should be > 0)`);
  return out;
}

const wav = encodeWav(buffer);
writeFileSync("spike-out.wav", wav);
console.log(`Rendered ${DURATION}s in ${renderMs}ms (${(DURATION * 1000 / renderMs).toFixed(1)}x realtime)`);
console.log(`Wrote spike-out.wav (${wav.length} bytes)`);

// --- prove ffmpeg encode chain ---
try {
  execFileSync("ffmpeg", ["-y", "-i", "spike-out.wav", "-b:a", "192k", "spike-out.mp3"], { stdio: "pipe" });
  console.log("FFmpeg encoded spike-out.mp3 OK — encode chain viable.");
} catch (e) {
  console.error("FFmpeg step failed:", (e as Error).message);
}
