#!/usr/bin/env node
/** Codesong CLI: render a song file to audio + emit an analysis report. */
import { tsImport } from "tsx/esm/api";
import { pathToFileURL } from "node:url";
import { resolve, basename } from "node:path";
import { writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { compile } from "../core/compile.js";
import { renderScore } from "../renderer/render.js";
import { buildReport, formatReport } from "../analyze/report.js";
import { listPresets } from "../instruments/synths.js";
import type { MusicChild } from "../core/jsx-runtime.js";

function parseFlags(args: string[]): { positional: string[]; flags: Record<string, string | boolean> } {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) { flags[key] = next; i++; } else flags[key] = true;
    } else if (a.startsWith("-")) {
      const key = a.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) { flags[key] = next; i++; } else flags[key] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

async function loadSong(file: string): Promise<MusicChild> {
  const abs = resolve(file);
  if (!existsSync(abs)) throw new Error(`Song file not found: ${abs}`);
  // tsImport transpiles .ts/.tsx on the fly, so the compiled CLI runs under plain
  // node yet still loads JSX song files (reading the user's tsconfig jsx settings).
  const mod = await tsImport(pathToFileURL(abs).href, import.meta.url);
  const song = mod.default ?? mod.song;
  if (!song) throw new Error(`${file} must default-export a <Song> element.`);
  return song as MusicChild;
}

async function cmdRender(args: string[]) {
  const { positional, flags } = parseFlags(args);
  const file = positional[0];
  if (!file) throw new Error("Usage: codesong render <song.tsx> [-o out.wav] [--report report.json]");

  const out = (flags.o as string) ?? (flags.out as string) ?? (flags.mp3 ? "out.mp3" : "out.wav");
  console.log(`Compiling ${basename(file)}…`);
  const song = await loadSong(file);
  const score = compile(song);

  console.log(`Rendering → ${out}…`);
  const t0 = Date.now();
  const res = await renderScore(score, { out });
  console.log(`Rendered ${res.durationSec.toFixed(1)}s in ${Date.now() - t0}ms.`);

  const report = buildReport(score, res.buffer);
  const reportPath = (flags.report as string) ?? out.replace(/\.[^.]+$/, "") + ".report.json";
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log("\n" + formatReport(report));
  console.log(`\nReport: ${reportPath}`);
}

function cmdPresets() {
  console.log("Instrument presets:");
  for (const p of [...new Set(listPresets())].sort()) console.log("  " + p);
  console.log('Drums: use instrument="drums" with <Pattern> tokens bd sd hh oh cp rs cr rd lt mt ht (~ = rest).');
}

function cmdInit(args: string[]) {
  const { positional } = parseFlags(args);
  const dir = resolve(positional[0] ?? ".");
  mkdirSync(dir, { recursive: true });
  const starter = resolve(import.meta.dirname, "templates", "starter-song.tsx");
  const guide = resolve(import.meta.dirname, "..", "..", "CODESONG.md");
  if (existsSync(starter)) copyFileSync(starter, resolve(dir, "song.tsx"));
  if (existsSync(guide)) copyFileSync(guide, resolve(dir, "CODESONG.md"));
  console.log(`Initialized Codesong project in ${dir}`);
  console.log("Next: edit song.tsx, then `codesong render song.tsx`.");
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    switch (cmd) {
      case "render": await cmdRender(rest); break;
      case "presets": cmdPresets(); break;
      case "init": cmdInit(rest); break;
      default:
        console.log("Codesong — code songs, render audio.\n");
        console.log("Commands:");
        console.log("  render <song.tsx> [-o out.wav|out.mp3] [--report file]   Render a song");
        console.log("  presets                                                  List instruments");
        console.log("  init [dir]                                               Scaffold a project");
    }
  } catch (e) {
    console.error("Error:", (e as Error).message);
    process.exit(1);
  }
}

main();
