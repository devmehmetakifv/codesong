/**
 * Synthesized drum kit. Each piece is built from a tuned oscillator (membranes)
 * and/or filtered noise (cymbals/snare). Noise is seeded for deterministic renders.
 */
import { mulberry32 } from "../core/rng.js";

/** Create a deterministic mono noise buffer to reuse across all drum hits. */
export function makeNoiseBuffer(ctx: BaseAudioContext, seed: number, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const rnd = mulberry32(seed >>> 0 || 1);
  for (let i = 0; i < len; i++) data[i] = rnd() * 2 - 1;
  return buf;
}

const EPS = 0.0001;

function noiseHit(
  ctx: BaseAudioContext,
  dest: AudioNode,
  noise: AudioBuffer,
  start: number,
  level: number,
  decay: number,
  filterType: BiquadFilterType,
  freq: number,
  q = 1,
) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(Math.max(EPS, level), start);
  gain.gain.exponentialRampToValueAtTime(EPS, start + decay);
  src.connect(filter).connect(gain).connect(dest);
  src.start(start, (start * 7.13) % 1.5); // vary read offset so hits aren't identical
  src.stop(start + decay + 0.02);
}

function tone(
  ctx: BaseAudioContext,
  dest: AudioNode,
  start: number,
  level: number,
  decay: number,
  f0: number,
  f1: number,
  type: OscillatorType = "sine",
) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), start + decay * 0.9);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(Math.max(EPS, level), start);
  gain.gain.exponentialRampToValueAtTime(EPS, start + decay);
  osc.connect(gain).connect(dest);
  osc.start(start);
  osc.stop(start + decay + 0.02);
}

export function playDrum(
  ctx: BaseAudioContext,
  dest: AudioNode,
  noise: AudioBuffer,
  midi: number,
  start: number,
  velocity: number,
): void {
  const v = velocity;
  switch (midi) {
    case 36: // kick
      tone(ctx, dest, start, 0.95 * v, 0.34, 150, 48, "sine");
      noiseHit(ctx, dest, noise, start, 0.25 * v, 0.03, "lowpass", 1200); // click
      break;
    case 38: // snare
      tone(ctx, dest, start, 0.4 * v, 0.12, 190, 120, "triangle");
      noiseHit(ctx, dest, noise, start, 0.6 * v, 0.18, "bandpass", 1800, 0.7);
      break;
    case 37: // rim/cross-stick
      noiseHit(ctx, dest, noise, start, 0.5 * v, 0.04, "bandpass", 1700, 3);
      break;
    case 39: // clap
      for (const off of [0, 0.012, 0.024]) {
        noiseHit(ctx, dest, noise, start + off, 0.45 * v, 0.06, "bandpass", 1200, 0.8);
      }
      break;
    case 42: // closed hat
      noiseHit(ctx, dest, noise, start, 0.4 * v, 0.045, "highpass", 7000, 0.7);
      break;
    case 46: // open hat
      noiseHit(ctx, dest, noise, start, 0.4 * v, 0.32, "highpass", 7000, 0.7);
      break;
    case 49: // crash
      noiseHit(ctx, dest, noise, start, 0.5 * v, 1.1, "highpass", 5000, 0.5);
      break;
    case 51: // ride
      noiseHit(ctx, dest, noise, start, 0.35 * v, 0.5, "highpass", 8000, 0.6);
      tone(ctx, dest, start, 0.15 * v, 0.4, 520, 520, "square");
      break;
    case 45: // low tom
      tone(ctx, dest, start, 0.7 * v, 0.4, 160, 90, "sine");
      break;
    case 47: // mid tom
      tone(ctx, dest, start, 0.7 * v, 0.35, 220, 120, "sine");
      break;
    case 50: // high tom
      tone(ctx, dest, start, 0.7 * v, 0.3, 300, 160, "sine");
      break;
    default:
      tone(ctx, dest, start, 0.5 * v, 0.2, 200, 120, "sine");
  }
}
