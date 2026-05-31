/**
 * Synthesized instrument voices built directly on the Web Audio graph.
 * Data-driven: each preset is oscillator stack + amplitude ADSR + optional
 * lowpass (with its own decay envelope) + optional vibrato. Velocity scales level.
 * Self-contained — produces sound with zero external sample assets.
 */

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

export interface SynthPreset {
  oscs: OscSpec[];
  amp: ADSR;
  /** Overall output level (keeps summed tracks below clipping). */
  level: number;
  filter?: FilterSpec;
  vibrato?: { rate: number; depthCents: number };
  /** If true, note holds full duration (sustained); else amp decays naturally (plucked). */
  sustained?: boolean;
}

const EPS = 0.0001;

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const PRESETS: Record<string, SynthPreset> = {
  "acoustic-guitar": {
    oscs: [{ type: "triangle" }, { type: "sawtooth", gain: 0.3, detune: 6 }],
    amp: { attack: 0.004, decay: 0.9, sustain: 0, release: 0.15 },
    level: 0.32,
    filter: { cutoff: 700, q: 0.7, startCutoff: 4500, decay: 0.35 },
  },
  piano: {
    oscs: [{ type: "sine" }, { type: "triangle", gain: 0.45, octave: 1 }],
    amp: { attack: 0.004, decay: 1.4, sustain: 0, release: 0.2 },
    level: 0.34,
    filter: { cutoff: 3200, q: 0.5, startCutoff: 6000, decay: 0.5 },
  },
  "electric-piano": {
    oscs: [{ type: "sine" }, { type: "sine", gain: 0.4, octave: 1, detune: 4 }],
    amp: { attack: 0.005, decay: 1.0, sustain: 0.1, release: 0.25 },
    level: 0.32,
  },
  bass: {
    oscs: [{ type: "sine" }, { type: "triangle", gain: 0.5 }],
    amp: { attack: 0.01, decay: 0.2, sustain: 0.85, release: 0.06 },
    level: 0.5,
    filter: { cutoff: 900, q: 0.8 },
    sustained: true,
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
    vibrato: { rate: 4.5, depthCents: 4 },
    sustained: true,
  },
  strings: {
    oscs: [{ type: "sawtooth" }, { type: "sawtooth", detune: 7, gain: 0.6 }],
    amp: { attack: 0.18, decay: 0.3, sustain: 0.8, release: 0.4 },
    level: 0.22,
    filter: { cutoff: 3000, q: 0.5 },
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
    sustained: true,
  },
  lead: {
    oscs: [{ type: "sawtooth" }, { type: "square", gain: 0.25, octave: -1 }],
    amp: { attack: 0.02, decay: 0.2, sustain: 0.7, release: 0.12 },
    level: 0.3,
    filter: { cutoff: 4000, q: 1.2 },
    vibrato: { rate: 5.5, depthCents: 8 },
    sustained: true,
  },
  fiddle: {
    oscs: [{ type: "sawtooth" }, { type: "sawtooth", detune: 4, gain: 0.5 }],
    amp: { attack: 0.04, decay: 0.2, sustain: 0.75, release: 0.15 },
    level: 0.28,
    filter: { cutoff: 4200, q: 0.9 },
    vibrato: { rate: 6, depthCents: 10 },
    sustained: true,
  },
  flute: {
    oscs: [{ type: "sine" }, { type: "triangle", gain: 0.2 }],
    amp: { attack: 0.06, decay: 0.1, sustain: 0.85, release: 0.18 },
    level: 0.3,
    vibrato: { rate: 5, depthCents: 7 },
    sustained: true,
  },
};

const ALIASES: Record<string, string> = {
  guitar: "acoustic-guitar",
  "electric-guitar": "acoustic-guitar",
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

/**
 * Schedule one synth note into the graph. All nodes are short-lived and stop
 * themselves, so the offline render reclaims them.
 */
export function playSynth(
  ctx: BaseAudioContext,
  dest: AudioNode,
  preset: SynthPreset,
  midi: number,
  startSec: number,
  durSec: number,
  velocity: number,
): void {
  const freq = midiToFreq(midi);
  const peak = preset.level * velocity;
  const a = preset.amp;

  // Amplitude envelope.
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

  // Optional lowpass filter (with its own cutoff decay).
  let chainIn: AudioNode = ampGain;
  if (preset.filter) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = preset.filter.q ?? 0.7;
    if (preset.filter.startCutoff && preset.filter.decay) {
      filter.frequency.setValueAtTime(preset.filter.startCutoff, startSec);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(80, preset.filter.cutoff),
        startSec + preset.filter.decay,
      );
    } else {
      filter.frequency.value = preset.filter.cutoff;
    }
    filter.connect(ampGain);
    chainIn = filter;
  }
  ampGain.connect(dest);

  // Optional vibrato LFO -> detune of all oscillators.
  let lfo: OscillatorNode | undefined;
  let lfoGain: GainNode | undefined;
  if (preset.vibrato) {
    lfo = ctx.createOscillator();
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
