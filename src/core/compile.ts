/**
 * Compiler: JSX element tree -> ScoreIR.
 *
 * Walks the data tree produced by the JSX runtime. Host components (Song/Section/
 * Track/...) are interpreted structurally; user function components are called to
 * expand. Sections lay out sequentially in time; tracks inside a section are layered
 * starting at the section origin and may loop to fill it. Same-named tracks across
 * sections merge into one IR track. Fully deterministic.
 */
import {
  DEFAULT_PPQ,
  DEFAULT_SAMPLE_RATE,
  ticksPerBar,
  ticksToSeconds,
  type EffectSpec,
  type InstrumentSpec,
  type NoteEvent,
  type ScoreIR,
  type SectionIR,
  type TrackIR,
} from "./ir.js";
import { isElement, Fragment, type MusicChild, type MusicElement } from "./jsx-runtime.js";
import { getTag } from "./components.js";
import { resolveHumanize, DEFAULT_HUMANIZE } from "./humanize.js";
import type { HumanizeSettings } from "./ir.js";
import { durationToTicks } from "./time.js";
import { chordToMidi, chordRootMidi, noteNameToMidi } from "./theory.js";

/** GM-style drum token -> MIDI note. */
const DRUM_MAP: Record<string, number> = {
  bd: 36, kick: 36,
  sd: 38, snare: 38,
  rs: 37, rim: 37,
  cp: 39, clap: 39,
  hh: 42, hat: 42,
  oh: 46,
  cr: 49, crash: 49,
  rd: 51, ride: 51,
  lt: 45, mt: 47, ht: 50, // toms
};

const DEFAULT_OCTAVE_BY_INSTRUMENT: Record<string, number> = {
  bass: 2, "acoustic-bass": 2, "electric-bass": 2,
  "acoustic-guitar": 3, "electric-guitar": 3, guitar: 3,
  piano: 4, "electric-piano": 4, keys: 4,
  pad: 3, strings: 3, organ: 3,
  lead: 5, fiddle: 4, flute: 5,
};

interface EmitCtx {
  ppq: number;
  octave: number;
  velocity: number;
  isDrums: boolean;
}

interface Emitted {
  events: NoteEvent[];
  endTick: number;
}

/** Resolve a child: expand user function components; pass host elements through. */
function resolve(node: MusicChild): MusicChild {
  if (!isElement(node)) return node;
  const tag = getTag(node.type);
  if (tag) return node; // host element
  if (typeof node.type === "function") {
    // User component: call it with props+children, then resolve its output.
    const out = (node.type as (p: unknown) => MusicChild)({
      ...node.props,
      children: node.children,
    });
    return resolve(out);
  }
  return node;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}

/**
 * Resolve a child to a flat list of host elements, expanding user components AND
 * flattening <Fragment>/array wrappers. Used where we collect structural children
 * (sections/tracks) so `<>…</>` and components that return fragments work there too.
 */
function resolveToList(node: MusicChild): MusicElement[] {
  const r = resolve(node);
  if (!isElement(r)) return [];
  if (r.type === Fragment) return r.children.flatMap(resolveToList);
  return [r];
}

function makeNote(midi: number, startTick: number, durationTicks: number, velocity: number): NoteEvent {
  return { midi, startTick, durationTicks, velocity };
}

/** Process a list of children sequentially, advancing a cursor. */
function emitSequence(children: MusicChild[], startTick: number, ctx: EmitCtx): Emitted {
  const events: NoteEvent[] = [];
  let cursor = startTick;
  for (const raw of children) {
    const node = resolve(raw);
    if (!isElement(node)) continue;
    const out = emitNode(node, cursor, ctx);
    events.push(...out.events);
    cursor = out.endTick;
  }
  return { events, endTick: cursor };
}

/** Process children in parallel (all at startTick); end = max child end. */
function emitParallel(children: MusicChild[], startTick: number, ctx: EmitCtx): Emitted {
  const events: NoteEvent[] = [];
  let end = startTick;
  for (const raw of children) {
    const node = resolve(raw);
    if (!isElement(node)) continue;
    const out = emitNode(node, startTick, ctx);
    events.push(...out.events);
    end = Math.max(end, out.endTick);
  }
  return { events, endTick: end };
}

function emitChord(
  symbol: string,
  startTick: number,
  durTicks: number,
  octave: number,
  velocity: number,
  strum: string,
  inversion: number,
  voicing: string,
): NoteEvent[] {
  // Bass-style voicings: single notes instead of full triads.
  if (voicing === "root") {
    return [makeNote(chordRootMidi(symbol, octave), startTick, durTicks, velocity)];
  }
  if (voicing === "octaves") {
    const r = chordRootMidi(symbol, octave);
    return [makeNote(r, startTick, durTicks, velocity), makeNote(r + 12, startTick, durTicks, velocity)];
  }
  if (voicing === "root5") {
    // Boom-chick: root for the first half, fifth for the second half.
    const r = chordRootMidi(symbol, octave);
    const half = Math.max(1, Math.round(durTicks / 2));
    return [
      makeNote(r, startTick, half, velocity),
      makeNote(r + 7, startTick + half, durTicks - half, velocity),
    ];
  }

  const midis = chordToMidi(symbol, octave, inversion);
  const strumStep = strum === "none" ? 0 : Math.round(durTicks * 0.03);
  const ordered = strum === "up" ? [...midis].reverse() : midis;
  return ordered.map((midi, i) => {
    const offset = strumStep * i;
    return makeNote(midi, startTick + offset, Math.max(1, durTicks - offset), velocity);
  });
}

/**
 * Quarter-note walking bass over a chord sequence. Per chord: root, fifth, third,
 * then a chromatic approach to the NEXT chord's root — the classic jazz/blues motion.
 */
function emitWalkingBass(
  chords: string[],
  startTick: number,
  durTicks: number,
  octave: number,
  velocity: number,
  ppq: number,
): NoteEvent[] {
  const beatTicks = ppq; // quarter note
  const beatsPerChord = Math.max(1, Math.round(durTicks / beatTicks));
  const events: NoteEvent[] = [];
  let cursor = startTick;
  for (let i = 0; i < chords.length; i++) {
    const tones = chordToMidi(chords[i], octave, 0); // [root, 3rd, 5th, ...]
    const root = tones[0];
    const third = tones[1] ?? root + 4;
    const fifth = tones[2] ?? root + 7;
    const nextRoot = chordRootMidi(chords[(i + 1) % chords.length], octave);
    // Pattern of scale degrees, last beat is a half-step approach into the next root.
    const line = [root, fifth, third, nextRoot + (nextRoot >= third ? -1 : 1)];
    for (let b = 0; b < beatsPerChord; b++) {
      const midi = line[b % line.length];
      // Slightly detached (legato but not overlapping) for a relaxed feel.
      events.push(makeNote(midi, cursor, Math.round(beatTicks * 0.92), velocity));
      cursor += beatTicks;
    }
  }
  return events;
}

function emitNode(node: MusicElement, startTick: number, ctx: EmitCtx): Emitted {
  const tag = getTag(node.type);
  const p = node.props;
  const ppq = ctx.ppq;

  switch (tag) {
    case "seq":
      return emitSequence(node.children, startTick, ctx);
    case "stack":
      return emitParallel(node.children, startTick, ctx);

    case "rest": {
      const dur = durationToTicks((p.dur as string | number) ?? "4n", ppq);
      return { events: [], endTick: startTick + dur };
    }

    case "note": {
      const dur = durationToTicks((p.dur as string | number) ?? "4n", ppq);
      const pitch = p.pitch as string | number;
      const midi = typeof pitch === "number" ? pitch : noteNameToMidi(pitch);
      const vel = num(p.velocity, ctx.velocity);
      return { events: [makeNote(midi, startTick, dur, vel)], endTick: startTick + dur };
    }

    case "chord": {
      const dur = durationToTicks((p.dur as string | number) ?? "1n", ppq);
      const octave = num(p.octave, ctx.octave);
      const vel = num(p.velocity, ctx.velocity);
      const strum = (p.strum as string) ?? "down";
      const inv = num(p.inversion, 0);
      const voicing = (p.voicing as string) ?? "full";
      const events = emitChord(p.name as string, startTick, dur, octave, vel, strum, inv, voicing);
      return { events, endTick: startTick + dur };
    }

    case "progression": {
      const chords = p.chords as string[];
      const dur = durationToTicks((p.dur as string | number) ?? "1n", ppq);
      const octave = num(p.octave, ctx.octave);
      const vel = num(p.velocity, ctx.velocity);
      const strum = (p.strum as string) ?? "down";
      const voicing = (p.voicing as string) ?? "full";
      if (voicing === "walk") {
        const events = emitWalkingBass(chords, startTick, dur, octave, vel, ppq);
        return { events, endTick: startTick + dur * chords.length };
      }
      const events: NoteEvent[] = [];
      let cursor = startTick;
      for (const sym of chords) {
        events.push(...emitChord(sym, cursor, dur, octave, vel, strum, 0, voicing));
        cursor += dur;
      }
      return { events, endTick: cursor };
    }

    case "arp": {
      const step = durationToTicks((p.step as string | number) ?? "8n", ppq);
      const octave = num(p.octave, ctx.octave);
      const vel = num(p.velocity, ctx.velocity);
      const dir = (p.pattern as string) ?? "up";
      let tones = chordToMidi(p.chord as string, octave, 0);
      if (dir === "down") tones = [...tones].reverse();
      else if (dir === "updown") tones = [...tones, ...[...tones].reverse().slice(1, -1)];
      const total = p.length != null ? durationToTicks(p.length as string | number, ppq) : tones.length * step;
      const events: NoteEvent[] = [];
      let cursor = startTick;
      let i = 0;
      while (cursor < startTick + total) {
        events.push(makeNote(tones[i % tones.length], cursor, step, vel));
        cursor += step;
        i++;
      }
      return { events, endTick: startTick + total };
    }

    case "pattern": {
      const stepDur = durationToTicks((p.dur as string | number) ?? "8n", ppq);
      const vel = num(p.velocity, ctx.velocity);
      const tokens = String(p.steps).trim().split(/\s+/);
      const events: NoteEvent[] = [];
      let cursor = startTick;
      for (const tok of tokens) {
        if (tok !== "~" && tok !== ".") {
          if (ctx.isDrums) {
            const midi = DRUM_MAP[tok.toLowerCase()];
            if (midi != null) events.push(makeNote(midi, cursor, Math.round(ppq / 4), vel));
          } else {
            const midi = noteNameToMidi(tok);
            events.push(makeNote(midi, cursor, stepDur, vel));
          }
        }
        cursor += stepDur;
      }
      return { events, endTick: cursor };
    }

    default:
      // Unknown element: treat children as a sequence (transparent).
      return emitSequence(node.children, startTick, ctx);
  }
}

function instrumentSpec(instrument: string): InstrumentSpec {
  if (instrument === "drums" || instrument === "drumkit") {
    return { kind: "drums", kit: "default" };
  }
  return { kind: "synth", preset: instrument };
}

/** Parse `<Effect>` host elements into renderer-ready specs (with musical defaults). */
function parseEffects(els: MusicElement[], ppq: number, tempo: number): EffectSpec[] {
  const out: EffectSpec[] = [];
  for (const el of els) {
    const p = el.props;
    switch (p.type as string) {
      case "delay": {
        const t = (p.time as string | number) ?? "8n";
        const timeSec = typeof t === "number" ? t : ticksToSeconds(durationToTicks(t, ppq), tempo, ppq);
        out.push({ type: "delay", timeSec, feedback: num(p.feedback, 0.3), mix: num(p.mix, 0.3) });
        break;
      }
      case "chorus":
        out.push({ type: "chorus", rate: num(p.rate, 1.2), depthMs: num(p.depth, 4), mix: num(p.mix, 0.4) });
        break;
      case "drive":
        out.push({ type: "drive", amount: num(p.amount, 0.4), mix: num(p.mix, 0.6) });
        break;
      case "tremolo":
        out.push({ type: "tremolo", rate: num(p.rate, 5), depth: num(p.depth, 0.5) });
        break;
      case "filter":
        out.push({
          type: "filter",
          mode: (p.mode as "lowpass" | "highpass") ?? "lowpass",
          cutoff: num(p.cutoff, 1200),
          q: num(p.q, 1),
        });
        break;
      default:
        // Fail loud, not silent: a typo'd type would otherwise vanish with no sound.
        console.warn(`codesong: unknown <Effect type="${String(p.type)}">, ignored`);
    }
  }
  return out;
}

export function compile(root: MusicChild): ScoreIR {
  const songEl = resolve(root);
  if (!isElement(songEl) || getTag(songEl.type) !== "song") {
    throw new Error("Root element must be a <Song>.");
  }
  const sp = songEl.props;
  const ppq = num(sp.ppq, DEFAULT_PPQ);
  const timeSignature = (sp.timeSignature as [number, number]) ?? [4, 4];
  // Song-level feel: a `swing` prop seeds the base swing before humanize resolution.
  const baseFeel: HumanizeSettings =
    sp.swing != null ? { ...DEFAULT_HUMANIZE, swing: num(sp.swing, 0) } : DEFAULT_HUMANIZE;
  const songHumanize = resolveHumanize(sp.humanize, baseFeel);
  const meta = {
    title: (sp.title as string) ?? "Untitled",
    tempo: num(sp.tempo, 120),
    timeSignature,
    key: sp.keySignature as string | undefined,
    ppq,
    sampleRate: num(sp.sampleRate, DEFAULT_SAMPLE_RATE),
    seed: num(sp.seed, 1),
    humanize: songHumanize,
    room: sp.room as string | undefined,
  };
  const barTicks = ticksPerBar(ppq, timeSignature);

  const tracksByName = new Map<string, TrackIR>();
  const sections: SectionIR[] = [];

  // Normalize: top-level children may be Sections or Tracks directly (and wrapped
  // in fragments/components).
  const children = songEl.children.flatMap(resolveToList);
  const sectionEls = children.filter((c) => getTag(c.type) === "section");
  const directTracks = children.filter((c) => getTag(c.type) === "track");

  const sectionList: { props: Record<string, unknown>; tracks: MusicElement[] }[] = [];
  if (sectionEls.length > 0) {
    for (const sec of sectionEls) {
      const tracks = sec.children.flatMap(resolveToList).filter((c) => getTag(c.type) === "track");
      sectionList.push({ props: sec.props, tracks });
    }
  } else {
    // No explicit sections: whole song is one implicit section.
    sectionList.push({ props: { name: "main" }, tracks: directTracks });
  }

  let sectionStart = 0;
  for (const sec of sectionList) {
    // Pass 1: emit each track's content once to learn its length. `<Effect>` children
    // are structural (not notes), so split them out before emitting music.
    const perTrack = sec.tracks.map((trackEl) => {
      const instrument = trackEl.props.instrument as string;
      const isDrums = instrument === "drums" || instrument === "drumkit";
      const octave =
        num(trackEl.props.octave, DEFAULT_OCTAVE_BY_INSTRUMENT[instrument] ?? 4);
      const ctx: EmitCtx = { ppq, octave, velocity: num(trackEl.props.velocity, 0.8), isDrums };
      const flat = trackEl.children.flatMap(resolveToList);
      const effectEls = flat.filter((c) => getTag(c.type) === "effect");
      const musicEls = flat.filter((c) => getTag(c.type) !== "effect");
      const emitted = emitSequence(musicEls, 0, ctx);
      return { trackEl, emitted, instrument, effectEls };
    });

    const explicitBars = sec.props.bars as number | undefined;
    const contentLen = perTrack.reduce((m, t) => Math.max(m, t.emitted.endTick), 0);
    const sectionLen = explicitBars != null
      ? explicitBars * barTicks
      : Math.max(barTicks, Math.ceil(contentLen / barTicks) * barTicks);

    sections.push({
      name: (sec.props.name as string) ?? `section-${sections.length + 1}`,
      startTick: sectionStart,
      lengthTicks: sectionLen,
    });

    // Pass 2: place (and loop) content, merge into named tracks.
    for (const { trackEl, emitted, instrument, effectEls } of perTrack) {
      const name = (trackEl.props.name as string) ?? instrument;
      let track = tracksByName.get(name);
      if (!track) {
        // Track feel: inherits the song's, with `swing`/`humanize` props overriding.
        const trackBase =
          trackEl.props.swing != null
            ? { ...songHumanize, swing: num(trackEl.props.swing, songHumanize.swing) }
            : songHumanize;
        const effects = parseEffects(effectEls, ppq, meta.tempo);
        track = {
          id: name,
          name,
          instrument: instrumentSpec(instrument),
          events: [],
          gain: num(trackEl.props.gain, 0.8),
          pan: num(trackEl.props.pan, 0),
          reverbSend: num(trackEl.props.reverb, 0),
          effects: effects.length > 0 ? effects : undefined,
          bus: trackEl.props.bus as string | undefined,
          humanize: resolveHumanize(trackEl.props.humanize, trackBase),
        };
        tracksByName.set(name, track);
      }
      const loop = trackEl.props.loop === true;
      const contentLength = emitted.endTick;
      if (contentLength <= 0) continue;
      const repeats = loop ? Math.ceil(sectionLen / contentLength) : 1;
      for (let r = 0; r < repeats; r++) {
        const offset = sectionStart + r * contentLength;
        for (const e of emitted.events) {
          const start = e.startTick + offset;
          if (start >= sectionStart + sectionLen) break;
          track.events.push({ ...e, startTick: start });
        }
      }
    }

    sectionStart += sectionLen;
  }

  return { meta, tracks: [...tracksByName.values()], sections };
}
