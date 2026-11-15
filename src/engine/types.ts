// The contract between the shared engine and a skin's own effects.

/** The picture, sampled into a grid of RGBA cells the renderer chose the size of. */
export type Sample = {
  data: Uint8ClampedArray;
  cols: number;
  rows: number;
  /** Where the picture sits inside the grid, in cells (the rest is letterboxing). */
  rect: { x: number; y: number; w: number; h: number };
  /** False when the browser would not let the page read the picture (media without CORS headers). */
  readable: boolean;
};

/** Values a skin exposes as CSS custom properties, read once per skin or theme change. */
export type Tokens = Record<string, string>;

export type Size = { w: number; h: number; dpr: number };

/** A skin's paused-frame (and poster) effect. */
export interface Renderer {
  /** How many cells to sample the picture into for a player of this size, in CSS pixels. */
  grid(width: number, height: number): { cols: number; rows: number };
  /** Called whenever there is a new sample to build from. */
  prepare(sample: Sample, tokens: Tokens): void;
  /** Draws the effect. progress runs 0 (gone) to 1 (fully shown). Everything is drawn in device pixels. */
  paint(ctx: CanvasRenderingContext2D, size: Size, progress: number, tokens: Tokens): void;
  /** Durations in milliseconds. */
  ms?: { in?: number; out?: number };
  /** Called when the effect is switched away from, to drop any cached work. */
  dispose?(): void;
}

export type RailState = {
  width: number;
  height: number;
  /** Device pixels per CSS pixel. */
  scale: number;
  /** How much of the film has played, 0 to 1. */
  played: number;
  cols: number;
  /** Loudness heard at each column, 0 to 1, valid where known[c] is 1. */
  energy: Float32Array;
  known: Uint8Array;
  tokens: Tokens;
  /** 1 while the film is playing. */
  playing: boolean;
  /** Smoothed instantaneous loudness, 0 to 1. */
  level: number;
};

/** A skin's seek bar drawing. */
export interface RailPainter {
  /** Column width in CSS pixels. */
  step: number;
  paint(ctx: CanvasRenderingContext2D, state: RailState): void;
}
