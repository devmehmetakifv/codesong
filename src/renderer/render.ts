/** Node-side offline render: ScoreIR -> WAV file (+ optional mp3). */
import { OfflineAudioContext } from "node-web-audio-api";
import { writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

/** Bundled ffmpeg binary (no system install needed); falls back to PATH ffmpeg. */
const FFMPEG = (ffmpegStatic as unknown as string | null) ?? "ffmpeg";
import { scoreDurationTicks, ticksToSeconds, type ScoreIR } from "../core/ir.js";
import { scheduleScore } from "./engine.js";
import { encodeWav } from "./wav.js";

export interface RenderOptions {
  /** Output path. ".mp3" triggers an ffmpeg encode from the rendered WAV. */
  out: string;
}

export interface RenderResult {
  out: string;
  durationSec: number;
  sampleRate: number;
  /** The rendered buffer, for analysis without re-reading the file. */
  buffer: AudioBuffer;
}

/** Scale the whole buffer so its peak hits `target` — consistent loudness, no clipping. */
function normalizePeak(buffer: AudioBuffer, target: number): void {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
  }
  if (peak < 1e-6) return;
  const scale = target / peak;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= scale;
  }
}

/** Conservative total duration (seconds) used to size the offline context. */
export function estimateDurationSec(score: ScoreIR): number {
  const ticks = scoreDurationTicks(score);
  return ticksToSeconds(ticks, score.meta.tempo, score.meta.ppq) + 2.5;
}

export async function renderScore(score: ScoreIR, opts: RenderOptions): Promise<RenderResult> {
  const sampleRate = score.meta.sampleRate;
  const seconds = Math.max(1, estimateDurationSec(score));
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);

  scheduleScore(ctx, score);

  const buffer = await ctx.startRendering();
  normalizePeak(buffer, 0.89);
  const wav = encodeWav(buffer);

  const isMp3 = opts.out.toLowerCase().endsWith(".mp3");
  if (isMp3) {
    const tmpWav = opts.out.replace(/\.mp3$/i, ".tmp.wav");
    writeFileSync(tmpWav, wav);
    execFileSync(FFMPEG, ["-y", "-i", tmpWav, "-b:a", "192k", opts.out], { stdio: "pipe" });
    rmSync(tmpWav, { force: true });
  } else {
    writeFileSync(opts.out, wav);
  }

  return { out: opts.out, durationSec: buffer.duration, sampleRate, buffer };
}
