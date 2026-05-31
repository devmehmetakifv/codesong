/**
 * Minimal JSX runtime (TS "react-jsx" automatic runtime, but no React/DOM).
 * `<Song>…</Song>` compiles to jsx(Song, props); we just capture it as plain data
 * `{ type, props, children }`. The compiler (compile.ts) walks this tree: host
 * components (tagged with `codesongTag`) are interpreted structurally, user function
 * components are called to expand into more elements. Pure data in, deterministic.
 */

export type MusicElement = {
  type: unknown;
  props: Record<string, unknown>;
  children: MusicChild[];
};

export type MusicChild = MusicElement | string | number | null | undefined | boolean;

function flatten(children: unknown): MusicChild[] {
  if (children == null || children === false || children === true) return [];
  if (Array.isArray(children)) return children.flatMap(flatten);
  return [children as MusicChild];
}

export function jsx(type: unknown, props: Record<string, unknown> | null, _key?: unknown): MusicElement {
  const { children, ...rest } = props ?? {};
  return { type, props: rest, children: flatten(children) };
}

// jsxs is the multi-child variant; identical behavior for us.
export const jsxs = jsx;

// Dev runtime entry (Vite/esbuild use this in development). Extra trailing args
// (key, isStaticChildren, source, self) are ignored — we only need type+props.
export function jsxDEV(type: unknown, props: Record<string, unknown> | null, key?: unknown): MusicElement {
  return jsx(type, props, key);
}

export const Fragment = Symbol.for("codesong.Fragment");

export function isElement(node: MusicChild): node is MusicElement {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}
