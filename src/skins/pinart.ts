// PIN ART (3D). The frame becomes a pin-art toy: a bed of steel pins, each pushed up by the brightness of the picture
// beneath it, lit from the top left so every raised pin throws a shadow and shifts toward the light. The seek bar is
// a row of pins that the sound pushes up as it plays.

import './pinart.css';
import { registerRenderer } from '../engine/frame';
import { registerRailPainter } from '../engine/rail';
import type { RailState, Renderer, Sample, Size, Tokens } from '../engine/types';
import { ease } from '../engine/video';
import { lumaMap } from './util';

const TONES = 10;
let sprites: HTMLCanvasElement[] = [];
let spriteSize = 0;

// Pre-renders the pin heads: a steel sphere, brighter the higher the pin sits.
function ensureSprites(diameter: number) {
  const d = Math.max(4, Math.round(diameter));
  if (d === spriteSize && sprites.length) return;
  spriteSize = d;
  sprites = [];
  for (let b = 0; b < TONES; b++) {
    const c = document.createElement('canvas');
    c.width = c.height = d;
    const g = c.getContext('2d')!;
    const tone = 58 + b * 18;
    const grad = g.createRadialGradient(d * 0.36, d * 0.3, d * 0.04, d * 0.5, d * 0.5, d * 0.54);
    grad.addColorStop(0, `rgb(${tone + 70} ${tone + 74} ${tone + 82})`);
    grad.addColorStop(0.45, `rgb(${tone} ${tone + 3} ${tone + 10})`);
    grad.addColorStop(1, `rgb(${tone * 0.45} ${tone * 0.46} ${tone * 0.52})`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(d / 2, d / 2, d / 2 - 0.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgb(255 255 255 / 0.55)';
    g.beginPath();
    g.arc(d * 0.34, d * 0.3, d * 0.09, 0, Math.PI * 2);
    g.fill();
    sprites.push(c);
  }
}

let luma = new Float32Array(0);
let inside = new Uint8Array(0);
let cols = 0;
let rows = 0;
let pitchCss = 12;

const renderer: Renderer = {
  ms: { in: 1100, out: 600 },
  grid(width, height) {
    pitchCss = Math.min(16, Math.max(9, Math.round(width / 72)));
    return { cols: Math.ceil(width / pitchCss), rows: Math.ceil(height / pitchCss) };
  },
  prepare(sample: Sample) {
    ({ luma, inside } = lumaMap(sample, 1.0));
    cols = sample.cols;
    rows = sample.rows;
  },
  paint(ctx: CanvasRenderingContext2D, size: Size, progress: number, tokens: Tokens) {
    const p = pitchCss * size.dpr;
    ensureSprites(p * 0.92);

    // The bed the pins stand in.
    ctx.globalAlpha = Math.min(1, progress * 5);
    ctx.fillStyle = tokens['--k-paper'] || '#16181c';
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.globalAlpha = 1;

    // Pin holes.
    ctx.fillStyle = 'rgb(0 0 0 / 0.55)';
    ctx.beginPath();
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        ctx.moveTo((cx + 0.5) * p + p * 0.12, (cy + 0.5) * p);
        ctx.arc((cx + 0.5) * p, (cy + 0.5) * p, p * 0.12, 0, Math.PI * 2);
      }
    }
    ctx.fill();

    const midX = cols / 2;
    const midY = rows / 2;
    const reach = Math.hypot(midX, midY);

    // Shadows first, then stems, then heads, so a raised pin never hides its neighbour's shadow.
    ctx.fillStyle = 'rgb(0 0 0 / 0.4)';
    ctx.beginPath();
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        if (!inside[i]) continue;
        const h = height(i, cx, cy, midX, midY, reach, progress);
        if (h < 0.02) continue;
        const x = (cx + 0.5) * p + h * p * 0.55;
        const y = (cy + 0.5) * p + h * p * 0.7;
        ctx.moveTo(x + p * 0.4, y);
        ctx.ellipse(x, y, p * 0.4, p * 0.3, 0, 0, Math.PI * 2);
      }
    }
    ctx.fill();

    ctx.strokeStyle = 'rgb(20 22 26 / 0.9)';
    ctx.lineWidth = Math.max(1, p * 0.2);
    ctx.beginPath();
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        if (!inside[i]) continue;
        const h = height(i, cx, cy, midX, midY, reach, progress);
        if (h < 0.05) continue;
        const bx = (cx + 0.5) * p;
        const by = (cy + 0.5) * p;
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - h * p * 0.45, by - h * p * 0.55);
      }
    }
    ctx.stroke();

    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        if (!inside[i]) continue;
        const h = height(i, cx, cy, midX, midY, reach, progress);
        const x = (cx + 0.5) * p - h * p * 0.45;
        const y = (cy + 0.5) * p - h * p * 0.55;
        const tone = Math.min(TONES - 1, Math.floor(h * TONES));
        ctx.drawImage(sprites[tone], x - spriteSize / 2, y - spriteSize / 2);
      }
    }
  },
};

// Pins rise from the middle outward, in a ripple, and fall back the same way.
function height(i: number, cx: number, cy: number, midX: number, midY: number, reach: number, progress: number) {
  const delay = (Math.hypot(cx - midX, cy - midY) / reach) * 0.55;
  const local = ease((progress - delay) / 0.45);
  return luma[i] * local;
}

registerRenderer('pinart', renderer);

registerRailPainter('pinart', {
  step: 9,
  paint(ctx: CanvasRenderingContext2D, s: RailState) {
    const step = 9 * s.scale;
    const baseY = s.height - 4 * s.scale;
    const reach = s.height - 12 * s.scale;
    const played = s.played * s.cols;

    for (let c = 0; c < s.cols; c++) {
      const x = (c + 0.5) * step;
      const isPlayed = c < played;
      const heard = s.known[c] ? s.energy[c] : 0.35;
      // The pin under the playhead breathes with the live sound.
      const live = Math.floor(played) === c && s.playing ? s.level * 0.5 : 0;
      const lift = isPlayed ? Math.min(1, 0.22 + heard * 0.78 + live) : 0.08;
      const headY = baseY - lift * reach;
      const r = step * 0.36;

      // Shadow on the bed.
      ctx.fillStyle = 'rgb(0 0 0 / 0.4)';
      ctx.beginPath();
      ctx.ellipse(x + lift * step * 0.3, baseY + 1 * s.scale, r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      // Stem.
      ctx.strokeStyle = isPlayed ? 'rgb(150 156 168)' : 'rgb(70 74 84)';
      ctx.lineWidth = Math.max(1, r * 0.4);
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, headY);
      ctx.stroke();

      // Head: a lit sphere.
      const g = ctx.createRadialGradient(x - r * 0.35, headY - r * 0.35, r * 0.1, x, headY, r);
      if (isPlayed) {
        g.addColorStop(0, s.tokens['--k-accent'] ? '#ffe2cf' : '#fff');
        g.addColorStop(0.5, s.tokens['--k-accent'] || '#ff6a2b');
        g.addColorStop(1, '#5a1c04');
      } else {
        g.addColorStop(0, '#9aa0ac');
        g.addColorStop(0.55, '#5a5f6a');
        g.addColorStop(1, '#23262c');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, headY, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
});
