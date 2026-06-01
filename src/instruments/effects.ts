/**
 * Per-track insert effects on the Web Audio graph. Each builder returns an
 * { input, output } pair; `buildEffectChain` wires a list in series. All effects are
 * deterministic (LFOs are plain oscillators), so renders stay reproducible.
 *
 * Wet/dry effects (delay, chorus, drive) keep the dry signal at unity and add the wet
 * path scaled by `mix`, which reads musically as "amount of effect" on an insert.
 */
import type { EffectSpec } from "../core/ir.js";

interface IO {
  input: AudioNode;
  output: AudioNode;
}

/** Soft-clip overdrive curve; `amount` 0..1 maps to gentle warmth → hard saturation. */
function driveCurve(amount: number, n = 1024): Float32Array<ArrayBuffer> {
  const k = 1 + amount * 80;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

function buildDelay(ctx: BaseAudioContext, timeSec: number, feedback: number, mix: number): IO {
  const input = ctx.createGain();
  const output = ctx.createGain();
  input.connect(output); // dry

  const delay = ctx.createDelay(Math.max(1, timeSec + 0.1));
  delay.delayTime.value = Math.max(0, timeSec);
  const fb = ctx.createGain();
  fb.gain.value = Math.min(0.95, Math.max(0, feedback));
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 3500; // darken each repeat, like analog echo
  const wet = ctx.createGain();
  wet.gain.value = Math.max(0, mix);

  input.connect(delay);
  delay.connect(damp);
  damp.connect(fb);
  fb.connect(delay); // feedback loop
  delay.connect(wet).connect(output);
  return { input, output };
}

function buildChorus(ctx: BaseAudioContext, rate: number, depthMs: number, mix: number): IO {
  const input = ctx.createGain();
  const output = ctx.createGain();
  input.connect(output); // dry

  const base = 0.022;
  const delay = ctx.createDelay(0.1);
  delay.delayTime.value = base;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = Math.max(0, depthMs) / 1000;
  lfo.connect(lfoGain).connect(delay.delayTime);
  lfo.start(0);

  const wet = ctx.createGain();
  wet.gain.value = Math.max(0, mix);
  input.connect(delay).connect(wet).connect(output);
  return { input, output };
}

function buildDrive(ctx: BaseAudioContext, amount: number, mix: number): IO {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 1 - Math.min(1, Math.max(0, mix));
  input.connect(dry).connect(output);

  const pre = ctx.createGain();
  pre.gain.value = 1 + amount * 3; // drive harder into the curve
  const shaper = ctx.createWaveShaper();
  shaper.curve = driveCurve(amount);
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 4200 - amount * 1500; // tame fizz as drive increases
  const wet = ctx.createGain();
  wet.gain.value = Math.min(1, Math.max(0, mix));
  input.connect(pre).connect(shaper).connect(tone).connect(wet).connect(output);
  return { input, output };
}

function buildTremolo(ctx: BaseAudioContext, rate: number, depth: number): IO {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const d = Math.min(1, Math.max(0, depth));
  const vca = ctx.createGain();
  vca.gain.value = 1 - d / 2;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = d / 2;
  lfo.connect(lfoGain).connect(vca.gain);
  lfo.start(0);
  input.connect(vca).connect(output);
  return { input, output };
}

function buildFilter(ctx: BaseAudioContext, mode: "lowpass" | "highpass", cutoff: number, q: number): IO {
  const filter = ctx.createBiquadFilter();
  filter.type = mode;
  filter.frequency.value = cutoff;
  filter.Q.value = q;
  return { input: filter, output: filter };
}

function buildEffect(ctx: BaseAudioContext, spec: EffectSpec): IO {
  switch (spec.type) {
    case "delay":
      return buildDelay(ctx, spec.timeSec, spec.feedback, spec.mix);
    case "chorus":
      return buildChorus(ctx, spec.rate, spec.depthMs, spec.mix);
    case "drive":
      return buildDrive(ctx, spec.amount, spec.mix);
    case "tremolo":
      return buildTremolo(ctx, spec.rate, spec.depth);
    case "filter":
      return buildFilter(ctx, spec.mode, spec.cutoff, spec.q);
  }
}

/**
 * Wire effects in series and return the chain's endpoints. With no effects, input
 * and output are the same passthrough gain node.
 */
export function buildEffectChain(ctx: BaseAudioContext, effects: EffectSpec[] | undefined): IO {
  const input = ctx.createGain();
  if (!effects || effects.length === 0) return { input, output: input };
  let cursor: AudioNode = input;
  for (const spec of effects) {
    const node = buildEffect(ctx, spec);
    cursor.connect(node.input);
    cursor = node.output;
  }
  return { input, output: cursor };
}
