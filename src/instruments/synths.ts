/**
 * Synthesized instrument voices built directly on the Web Audio graph.
 *
 * Two voice models, chosen per preset:
 *  - "osc"     subtractive: oscillator stack + amplitude ADSR + optional lowpass
 *              (with its own decay envelope) + optional vibrato.
 *  - "karplus" plucked-string physical model (Karplus-Strong), rendered to a buffer
 *              for authentic string timbre that oscillators can't fake.
 *
 * Realism extras shared by both: velocity opens the tone (harder = brighter, like a
 * real instrument, not just louder) and an optional note-on transient (pick/hammer
 * noise) gives each attack a physical edge. Self-contained — zero sample assets.
 */
import { mulberry32 } from "../core/rng.js";

export interface OscSpec {
  type: OscillatorType;
  /** Detune in cents. */
  detune?: number;
  /** Relative mix level 0..1. */
  gain?: number;
  /** Octave offset (in octaves). */
  octave?: number;
}

export interface ADSR {
  attack: number;
  decay: number;
  /** Sustain level 0..1 (relative to peak). */
  sustain: number;
  release: number;
}

export interface FilterSpec {
  cutoff: number;
  q?: number;
  /** If set, cutoff starts here and decays toward `cutoff` over `decay` seconds. */
  startCutoff?: number;
  decay?: number;
}

/** A short attack-only noise burst layered at note-on (pick scrape, hammer thock, breath). */
export interface TransientSpec {
  /** Level relative to the note's peak, 0..1. */
  level: number;
  /** Decay time of the burst in seconds. */
  decay: number;
  /** High-pass corner so it reads as an attack edge, not a thump (Hz). */
  hz?: number;
}

export interface SynthPreset {
  /** Voice model. Defaults to "osc" when omitted. */
  model?: "osc" | "karplus";
  oscs: OscSpec[];
  amp: ADSR;
  /** Overall output level (keeps summed tracks below clipping). */
  level: number;
  filter?: FilterSpec;
  vibrato?: { rate: number; depthCents: number };
  /** If true, note holds full duration (sustained); else amp decays naturally (plucked). */
  sustained?: boolean;
  /**
   * How strongly velocity opens the lowpass, 0..1. At 0 the filter is fixed; at 1 a
   * soft note is fully dark and a hard note fully bright. Default 0.5.
   */
  velCutoff?: number;
  /** Optional note-on transient burst. */
  transient?: TransientSpec;
  /** Karplus-Strong feel: string damping 0..1 (higher = longer ring). Default 0.5. */
  damping?: number;
}

const EPS = 0.0001;

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const PRESETS: Record<string, SynthPreset> = {
  "acoustic-guitar": {
    model: "karplus",
    oscs: [],
    amp: { attack: 0.003, decay: 0, sustain: 0, release: 0.12 },
    level: 0.34,
    filter: { cutoff: 4200, q: 0.6 },
    velCutoff: 0.55,
    damping: 0.52,
    transient: { level: 0.5, decay: 0.025, hz: 1800 },
  },
  "electric-guitar": {
    model: "karplus",
    oscs: [],
    amp: { attack: 0.003, decay: 0, sustain: 0, release: 0.18 },
    level: 0.32,
    filter: { cutoff: 3200, q: 0.9 },
    velCutoff: 0.5,
    damping: 0.62,
    transient: { level: 0.35, decay: 0.02, hz: 1400 },
  },
  piano: {
    oscs: [{ type: "sine" }, { type: "triangle", gain: 0.45, octave: 1 }],
    amp: { attack: 0.004, decay: 1.4, sustain: 0, release: 0.2 },
    level: 0.34,
    filter: { cutoff: 3200, q: 0.5, startCutoff: 6000, decay: 0.5 },
    velCutoff: 0.6,
    transient: { level: 0.28, decay: 0.012, hz: 2600 },
  },
  "electric-piano": {
    oscs: [{ type: "sine" }, { type: "sine", gain: 0.4, octave: 1, detune: 4 }],
    amp: { attack: 0.005, decay: 1.0, sustain: 0.1, release: 0.25 },
    level: 0.32,
    velCutoff: 0.5,
    transient: { level: 0.18, decay: 0.01, hz: 3200 },
  },
  bass: {
    oscs: [{ type: "sine" }, { type: "triangle", gain: 0.5 }],
    amp: { attack: 0.01, decay: 0.2, sustain: 0.85, release: 0.06 },
    level: 0.5,
    filter: { cutoff: 900, q: 0.8 },
    velCutoff: 0.45,
    sustained: true,
    transient: { level: 0.16, decay: 0.018, hz: 700 },
  },
  pad: {
    oscs: [
      { type: "sawtooth" },
      { type: "sawtooth", detune: 9, gain: 0.7 },
      { type: "sawtooth", detune: -9, gain: 0.7 },
    ],
    amp: { attack: 0.35, decay: 0.4, sustain: 0.8, release: 0.5 },
    level: 0.18,
    filter: { cutoff: 2400, q: 0.6 },
    velCutoff: 0.4,
    vibrato: { rate: 4.5, depthCents: 4 },
    sustained: true,
  },
  strings: {
    oscs: [{ type: "sawtooth" }, { type: "sawtooth", detune: 7, gain: 0.6 }],
    amp: { attack: 0.18, decay: 0.3, sustain: 0.8, release: 0.4 },
    level: 0.22,
    filter: { cutoff: 3000, q: 0.5 },
    velCutoff: 0.5,
    vibrato: { rate: 5.5, depthCents: 6 },
    sustained: true,
  },
  organ: {
    oscs: [
      { type: "sine" },
      { type: "sine", octave: 1, gain: 0.6 },
      { type: "sine", octave: 2, gain: 0.3 },
    ],
    amp: { attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.06 },
    level: 0.26,
    velCutoff: 0.2,
    sustained: true,
  },
  lead: {
    oscs: [{ type: "sawtooth" }, { type: "square", gain: 0.25, octave: -1 }],
    amp: { attack: 0.02, decay: 0.2, sustain: 0.7, release: 0.12 },
    level: 0.3,
    filter: { cutoff: 4000, q: 1.2 },
    velCutoff: 0.55,
    vibrato: { rate: 5.5, depthCents: 8 },
    sustained: true,
  },
  fiddle: {
    oscs: [{ type: "sawtooth" }, { type: "sawtooth", detune: 4, gain: 0.5 }],
    amp: { attack: 0.04, decay: 0.2, sustain: 0.75, release: 0.15 },
    level: 0.28,
    filter: { cutoff: 4200, q: 0.9 },
    velCutoff: 0.5,
    vibrato: { rate: 6, depthCents: 10 },
    sustained: true,
  },
  flute: {
    oscs: [{ type: "sine" }, { type: "triangle", gain: 0.2 }],
    amp: { attack: 0.06, decay: 0.1, sustain: 0.85, release: 0.18 },
    level: 0.3,
    velCutoff: 0.3,
    vibrato: { rate: 5, depthCents: 7 },
    sustained: true,
    transient: { level: 0.12, decay: 0.04, hz: 2000 },
  },
};

const ALIASES: Record<string, string> = {
  guitar: "acoustic-guitar",
  "acoustic-bass": "bass",
  "electric-bass": "bass",
  keys: "piano",
  synth: "lead",
};

export function resolvePreset(name: string): SynthPreset {
  return PRESETS[name] ?? PRESETS[ALIASES[name] ?? ""] ?? PRESETS.piano;
}

export function listPresets(): string[] {
  return [...Object.keys(PRESETS), ...Object.keys(ALIASES)];
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Velocity → lowpass multiplier. Soft notes darken toward `1 - velCutoff`. */
function cutoffScale(velCutoff: number | undefined, velocity: number): number {
  const amt = velCutoff ?? 0.5;
  return 1 - amt + amt * velocity;
}

/**
 * Karplus-Strong plucked string, rendered to a mono buffer. A short noise burst
 * (its brightness scaled by velocity) is fed through a feedback delay of one period
 * with an averaging lowpass — the averaging is what makes the tone decay from bright
 * to mellow like a real plucked string. Deterministic for a given seed.
 */
function generateKarplus(
  ctx: BaseAudioContext,
  freq: number,
  durSec: number,
  velocity: number,
  damping: number,
  seed: number,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const period = Math.max(2, Math.round(sr / freq));
  const total = Math.max(period + 1, Math.floor(durSec * sr));
  const buf = ctx.createBuffer(1, total, sr);
  const y = buf.getChannelData(0);
  const rng = mulberry32(seed >>> 0 || 1);

  // Excitation: noise burst, low-passed more for softer (lower-velocity) plucks.
  const bright = clamp(0.35 + 0.6 * velocity, 0, 1);
  let prev = 0;
  for (let i = 0; i < period; i++) {
    const w = rng() * 2 - 1;
    prev = bright * w + (1 - bright) * prev;
    y[i] = prev;
  }

  // Feedback loop with averaging lowpass; `decay` controls sustain.
  const decay = clamp(0.985 + 0.013 * damping, 0.9, 0.9995);
  for (let i = period; i < total; i++) {
    const a = y[i - period];
    const b = i - period - 1 >= 0 ? y[i - period - 1] : a;
    y[i] = decay * 0.5 * (a + b);
  }

  // Short fade at the buffer tail so the source doesn't end on a click.
  const fade = Math.min(total, Math.floor(0.01 * sr));
  for (let i = 0; i < fade; i++) y[total - 1 - i] *= i / fade;
  return buf;
}

/** Per-context cache of Karplus buffers, keyed by preset feel + pitch + velocity bucket. */
const ksCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

function karplusBuffer(
  ctx: BaseAudioContext,
  preset: SynthPreset,
  freq: number,
  midi: number,
  durSec: number,
  velocity: number,
  seed: number,
): AudioBuffer {
  let perCtx = ksCache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    ksCache.set(ctx, perCtx);
  }
  // Bucket velocity so we cache a handful of brightness variants, not one per note.
  const vbucket = Math.round(velocity * 4) / 4;
  const ring = clamp(durSec + 0.5, 0.35, 3.5);
  const key = `${preset.damping ?? 0.5}:${midi}:${vbucket}:${ring.toFixed(2)}`;
  let buf = perCtx.get(key);
  if (!buf) {
    buf = generateKarplus(ctx, freq, ring, vbucket, preset.damping ?? 0.5, seed ^ midi);
    perCtx.set(key, buf);
  }
  return buf;
}

/** Layer a short noise burst at note-on for a physical attack edge. */
function playTransient(
  ctx: BaseAudioContext,
  dest: AudioNode,
  noise: AudioBuffer,
  spec: TransientSpec,
  startSec: number,
  peak: number,
): void {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = spec.hz ?? 1800;
  const g = ctx.createGain();
  const level = Math.max(EPS, peak * spec.level);
  g.gain.setValueAtTime(EPS, startSec);
  g.gain.linearRampToValueAtTime(level, startSec + 0.001);
  g.gain.exponentialRampToValueAtTime(EPS, startSec + spec.decay);
  src.connect(hp).connect(g).connect(dest);
  // Start at a deterministic offset into the shared noise buffer.
  const offset = (noise.length > 0 ? (startSec * 1000) % noise.duration : 0) || 0;
  src.start(startSec, offset, spec.decay + 0.02);
  src.stop(startSec + spec.decay + 0.05);
}

/**
 * Schedule one synth note into the graph. All nodes are short-lived and stop
 * themselves, so the offline render reclaims them.
 *
 * @param noise Shared deterministic noise buffer (for note-on transients). Optional.
 * @param seed  Per-render seed (mixed with pitch) for the Karplus model. Optional.
 */
export function playSynth(
  ctx: BaseAudioContext,
  dest: AudioNode,
  preset: SynthPreset,
  midi: number,
  startSec: number,
  durSec: number,
  velocity: number,
  noise?: AudioBuffer,
  seed = 1,
): void {
  const freq = midiToFreq(midi);
  const peak = preset.level * velocity;
  const a = preset.amp;

  if (preset.transient && noise) {
    playTransient(ctx, dest, noise, preset.transient, startSec, peak);
  }

  // Karplus-Strong plucked voice: a pre-rendered buffer carries the string body.
  if (preset.model === "karplus") {
    const buf = karplusBuffer(ctx, preset, freq, midi, durSec, velocity, seed);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const ampGain = ctx.createGain();
    const ring = buf.duration;
    const hold = startSec + Math.min(ring - a.release, Math.max(durSec, 0.12));
    ampGain.gain.setValueAtTime(EPS, startSec);
    ampGain.gain.exponentialRampToValueAtTime(Math.max(EPS, peak), startSec + a.attack);
    ampGain.gain.setValueAtTime(Math.max(EPS, peak), Math.max(startSec + a.attack, hold));
    ampGain.gain.exponentialRampToValueAtTime(EPS, hold + a.release);

    if (preset.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = preset.filter.q ?? 0.7;
      filter.frequency.value = Math.max(80, preset.filter.cutoff * cutoffScale(preset.velCutoff, velocity));
      src.connect(filter).connect(ampGain);
    } else {
      src.connect(ampGain);
    }
    ampGain.connect(dest);
    src.start(startSec);
    src.stop(hold + a.release + 0.02);
    return;
  }

  // Oscillator (subtractive) voice.
  const ampGain = ctx.createGain();
  ampGain.gain.setValueAtTime(EPS, startSec);
  ampGain.gain.exponentialRampToValueAtTime(Math.max(EPS, peak), startSec + a.attack);

  let noteEnd: number;
  if (preset.sustained) {
    const sustainLevel = Math.max(EPS, peak * a.sustain);
    ampGain.gain.exponentialRampToValueAtTime(sustainLevel, startSec + a.attack + a.decay);
    ampGain.gain.setValueAtTime(sustainLevel, startSec + durSec);
    ampGain.gain.exponentialRampToValueAtTime(EPS, startSec + durSec + a.release);
    noteEnd = startSec + durSec + a.release;
  } else {
    // Plucked: ignore note length for the body, decay naturally over `decay`.
    const decayTime = Math.min(a.decay, durSec + a.release);
    ampGain.gain.exponentialRampToValueAtTime(EPS, startSec + a.attack + decayTime);
    noteEnd = startSec + a.attack + decayTime + 0.02;
  }

  // Optional lowpass filter (with its own cutoff decay), opened by velocity.
  let chainIn: AudioNode = ampGain;
  if (preset.filter) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = preset.filter.q ?? 0.7;
    const scale = cutoffScale(preset.velCutoff, velocity);
    if (preset.filter.startCutoff && preset.filter.decay) {
      filter.frequency.setValueAtTime(preset.filter.startCutoff * scale, startSec);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(80, preset.filter.cutoff * scale),
        startSec + preset.filter.decay,
      );
    } else {
      filter.frequency.value = Math.max(80, preset.filter.cutoff * scale);
    }
    filter.connect(ampGain);
    chainIn = filter;
  }
  ampGain.connect(dest);

  // Optional vibrato LFO -> detune of all oscillators.
  let lfoGain: GainNode | undefined;
  if (preset.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = preset.vibrato.rate;
    lfoGain = ctx.createGain();
    lfoGain.gain.value = preset.vibrato.depthCents;
    lfo.connect(lfoGain);
    lfo.start(startSec);
    lfo.stop(noteEnd);
  }

  for (const osc of preset.oscs) {
    const o = ctx.createOscillator();
    o.type = osc.type;
    o.frequency.value = freq * Math.pow(2, osc.octave ?? 0);
    if (osc.detune) o.detune.value = osc.detune;
    if (lfoGain) lfoGain.connect(o.detune);
    if (osc.gain != null && osc.gain !== 1) {
      const g = ctx.createGain();
      g.gain.value = osc.gain;
      o.connect(g).connect(chainIn);
    } else {
      o.connect(chainIn);
    }
    o.start(startSec);
    o.stop(noteEnd);
  }
}
