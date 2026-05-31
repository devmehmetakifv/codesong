/**
 * Score -> Web Audio graph scheduler. Works with ANY BaseAudioContext
 * (Node OfflineAudioContext for rendering, or a browser AudioContext for live
 * preview), so it imports no Node-only modules. render.ts wraps this for files.
 */
import { ticksToSeconds, type ScoreIR } from "../core/ir.js";
import { playSynth, resolvePreset } from "../instruments/synths.js";
import { playDrum, makeNoiseBuffer } from "../instruments/drums.js";

export interface ScheduleResult {
  /** Total audio length in seconds including tail. */
  durationSec: number;
}

/** Soft-clip curve (tanh) so summed tracks limit gracefully instead of hard-clipping. */
function softClipCurve(k = 2.2, n = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

/** Simple stereo feedback reverb from well-supported nodes. Returns its send input + output. */
function buildReverb(ctx: BaseAudioContext): { input: AudioNode; output: AudioNode } {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const combs = [0.0297, 0.0371, 0.0411, 0.0437];
  for (const time of combs) {
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = time;
    const fb = ctx.createGain();
    fb.gain.value = 0.72;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 3200;
    input.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay); // feedback loop
    damp.connect(output);
  }
  return { input, output };
}

/** Equal-power pan that falls back gracefully if StereoPannerNode is unavailable. */
function connectWithPan(ctx: BaseAudioContext, source: AudioNode, dest: AudioNode, pan: number): void {
  if (typeof (ctx as { createStereoPanner?: unknown }).createStereoPanner === "function") {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(panner).connect(dest);
  } else {
    source.connect(dest);
  }
}

/**
 * @param offset Seconds added to every event time. Use 0 for offline render;
 *   for live playback pass ctx.currentTime (+ small lead) so events are in the future.
 */
export function scheduleScore(ctx: BaseAudioContext, score: ScoreIR, offset = 0): ScheduleResult {
  const { tempo, ppq, seed } = score.meta;

  // Master chain: masterGain -> softclip limiter -> destination.
  // Scale headroom by track count so summed tracks stay below saturation; the
  // soft-clip limiter is then only a transient safety net. Final level is set by
  // peak-normalization after render (see render.ts).
  const master = ctx.createGain();
  master.gain.value = 0.85 / Math.sqrt(Math.max(1, score.tracks.length));
  const limiter = ctx.createWaveShaper();
  limiter.curve = softClipCurve();
  master.connect(limiter).connect(ctx.destination);

  const reverb = buildReverb(ctx);
  reverb.output.connect(master);

  const noise = makeNoiseBuffer(ctx, seed);

  let maxEnd = 0;

  for (const track of score.tracks) {
    const trackGain = ctx.createGain();
    trackGain.gain.value = track.gain;
    connectWithPan(ctx, trackGain, master, track.pan);

    if (track.reverbSend > 0) {
      const send = ctx.createGain();
      send.gain.value = track.reverbSend;
      trackGain.connect(send).connect(reverb.input);
    }

    const isDrums = track.instrument.kind === "drums";
    const preset = isDrums ? null : resolvePreset((track.instrument as { preset: string }).preset);

    for (const ev of track.events) {
      const start = ticksToSeconds(ev.startTick, tempo, ppq) + offset;
      const dur = ticksToSeconds(ev.durationTicks, tempo, ppq);
      if (isDrums) {
        playDrum(ctx, trackGain, noise, ev.midi, start, ev.velocity);
        maxEnd = Math.max(maxEnd, start + 1.2);
      } else {
        playSynth(ctx, trackGain, preset!, ev.midi, start, dur, ev.velocity);
        maxEnd = Math.max(maxEnd, start + dur + 0.6);
      }
    }
  }

  return { durationSec: maxEnd + 1.5 /* reverb/release tail */ };
}
