/** Note-value parsing: musical durations ("4n", "8n.", "4t") -> ticks. */
import type { Ticks } from "./ir.js";

const BASE: Record<string, number> = {
  "1n": 4, // whole note = 4 quarter notes
  "2n": 2,
  "4n": 1,
  "8n": 0.5,
  "16n": 0.25,
  "32n": 0.125,
};

/**
 * Parse a duration token to ticks.
 * Supports: 1n,2n,4n,8n,16n,32n; trailing "." = dotted (x1.5); "t" suffix = triplet (x2/3).
 * Also accepts a raw number = quarter-note multiples (1 = a quarter).
 * Multiple tokens summed with "+": "4n+8n".
 */
export function durationToTicks(value: string | number, ppq: number): Ticks {
  if (typeof value === "number") return Math.round(value * ppq);
  return value
    .split("+")
    .reduce((sum, tok) => sum + singleToTicks(tok.trim(), ppq), 0);
}

function singleToTicks(tok: string, ppq: number): Ticks {
  let triplet = false;
  let dotted = false;
  let core = tok;
  if (core.endsWith(".")) {
    dotted = true;
    core = core.slice(0, -1);
  }
  if (core.endsWith("t")) {
    triplet = true;
    core = core.slice(0, -1) + "n";
  }
  const quarters = BASE[core];
  if (quarters === undefined) {
    throw new Error(`Unknown duration "${tok}". Use 1n/2n/4n/8n/16n/32n, optional "." or "t".`);
  }
  let ticks = quarters * ppq;
  if (dotted) ticks *= 1.5;
  if (triplet) ticks *= 2 / 3;
  return Math.round(ticks);
}
