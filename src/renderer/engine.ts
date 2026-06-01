/**
 * Score -> Web Audio graph scheduler. Works with ANY BaseAudioContext
 * (Node OfflineAudioContext for rendering, or a browser AudioContext for live
 * preview), so it imports no Node-only modules. render.ts wraps this for files.
 *
 * Signal flow:  tracks --(pan)--> bus --> glue comp --> EQ --> widener --> limiter --> out
 *               tracks --(send)--> convolution reverb --> bus
 */
import { ticksToSeconds, type ScoreIR } from "../core/ir.js";
import { playSynth, resolvePreset } from "../instruments/synths.js";
import { playDrum, makeNoiseBuffer } from "../instruments/drums.js";
import { generateImpulseResponse, resolveRoom } from "../instruments/reverb.js";
import { buildEffectChain } from "../instruments/effects.js";

export interface ScheduleResult {
  /** Total audio length in seconds including tail. */
  durationSec: number;
}

const has = (ctx: BaseAudioContext, fn: string): boolean =>
  typeof (ctx as unknown as Record<string, unknown>)[fn] === "function";

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

/**
 * Convolution reverb from a procedural impulse response. Falls back to a simple
 * feedback-comb network if ConvolverNode is unavailable. Returns send input + output.
 */
function buildReverb(
  ctx: BaseAudioContext,
  room: string | undefined,
  seed: number,
): { input: AudioNode; output: AudioNode } {
  const input = ctx.createGain();
  const output = ctx.createGain();

  if (has(ctx, "createConvolver")) {
    const conv = ctx.createConvolver();
    conv.buffer = generateImpulseResponse(ctx, resolveRoom(room), seed);
    input.connect(conv).connect(output);
    return { input, output };
  }

  // Fallback: feedback-comb reverb (older/limited contexts).
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
    fb.connect(delay);
    damp.connect(output);
  }
  return { input, output };
}

/**
 * Mid/side stereo widener: L' = mid + w·side, R' = mid − w·side. Implemented as a
 * 2x2 gain matrix over a channel splitter/merger. Bypasses safely (passthrough) if
 * splitter/merger nodes aren't available.
 */
function buildWidener(ctx: BaseAudioContext, width: number): { input: AudioNode; output: AudioNode } {
  const input = ctx.createGain();
  const output = ctx.createGain();
  if (!has(ctx, "createChannelSplitter") || !has(ctx, "createChannelMerger") || width === 1) {
    input.connect(output);
    return { input, output };
  }
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const a = 0.5 * (1 + width); // same-channel coefficient
  const b = 0.5 * (1 - width); // cross-channel coefficient
  const gain = (v: number) => {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  };
  const ll = gain(a), rl = gain(b), lr = gain(b), rr = gain(a);
  input.connect(splitter);
  splitter.connect(ll, 0); ll.connect(merger, 0, 0);
  splitter.connect(rl, 1); rl.connect(merger, 0, 0);
  splitter.connect(lr, 0); lr.connect(merger, 0, 1);
  splitter.connect(rr, 1); rr.connect(merger, 0, 1);
  merger.connect(output);
  return { input, output };
}

/**
 * Master bus: gentle glue compression, corrective EQ (rumble cut + air shelf), a
 * touch of stereo width, then a soft-clip limiter into the destination. Returns the
 * node tracks should sum into. Each stage degrades gracefully if a node is missing.
 */
function buildMasterBus(ctx: BaseAudioContext, trackCount: number): AudioNode {
  // Headroom so summed tracks stay below saturation before the limiter; final level
  // is set by peak-normalization after render (see render.ts).
  const busInput = ctx.createGain();
  busInput.gain.value = 0.85 / Math.sqrt(Math.max(1, trackCount));

  let node: AudioNode = busInput;

  if (has(ctx, "createDynamicsCompressor")) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 24;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.012;
    comp.release.value = 0.22;
    const makeup = ctx.createGain();
    makeup.gain.value = 1.18; // recover the ~1.5 dB the glue comp pulls down
    node.connect(comp).connect(makeup);
    node = makeup;
  }

  // Corrective EQ: high-pass away sub-rumble, lift a gentle "air" shelf.
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 30;
  hp.Q.value = 0.707;
  const air = ctx.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 9000;
  air.gain.value = 2.5;
  node.connect(hp).connect(air);
  node = air;

  const widener = buildWidener(ctx, 1.25);
  node.connect(widener.input);

  const limiter = ctx.createWaveShaper();
  limiter.curve = softClipCurve();
  widener.output.connect(limiter).connect(ctx.destination);

  return busInput;
}

/** Equal-power pan that falls back gracefully if StereoPannerNode is unavailable. */
function connectWithPan(ctx: BaseAudioContext, source: AudioNode, dest: AudioNode, pan: number): void {
  if (has(ctx, "createStereoPanner")) {
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
  const { tempo, ppq, seed, room } = score.meta;

  const master = buildMasterBus(ctx, score.tracks.length);
  const reverb = buildReverb(ctx, room, seed);
  reverb.output.connect(master);

  // Mix-group buses: tracks sharing a `bus` name sum into a shared gain before master.
  const groups = new Map<string, GainNode>();
  const busFor = (name: string | undefined): AudioNode => {
    if (!name) return master;
    let g = groups.get(name);
    if (!g) {
      g = ctx.createGain();
      g.connect(master);
      groups.set(name, g);
    }
    return g;
  };

  const noise = makeNoiseBuffer(ctx, seed);

  let maxEnd = 0;

  for (const track of score.tracks) {
    // Instruments play into voiceBus -> insert effects -> track fader -> (group) bus.
    const voiceBus = ctx.createGain();
    const chain = buildEffectChain(ctx, track.effects);
    voiceBus.connect(chain.input);

    const trackGain = ctx.createGain();
    trackGain.gain.value = track.gain;
    chain.output.connect(trackGain);
    connectWithPan(ctx, trackGain, busFor(track.bus), track.pan);

    // Reverb send is post-effects, so echoes/overdrive carry into the room.
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
        playDrum(ctx, voiceBus, noise, ev.midi, start, ev.velocity);
        maxEnd = Math.max(maxEnd, start + 1.2);
      } else {
        playSynth(ctx, voiceBus, preset!, ev.midi, start, dur, ev.velocity, noise, seed);
        maxEnd = Math.max(maxEnd, start + dur + 0.6);
      }
    }
  }

  return { durationSec: maxEnd + 1.5 /* reverb/release tail */ };
}
