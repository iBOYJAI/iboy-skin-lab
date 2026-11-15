// ORIGAMI (paper). The frame is folded from paper: a sheet cut into triangular facets, each facet one flat colour taken
// from the picture, lit from the top left so the folds catch light and shade. Facets flip into place like a fold being
// made. The seek bar is an accordion-folded strip whose peaks are as tall as the sound was loud.

import './origami.css';
import { registerRenderer } from '../engine/frame';
import { registerRailPainter } from '../engine/rail';
import type { RailState, Renderer, Sample, Size, Tokens } from '../engine/types';
import { ease } from '../engine/video';
import { seeded } from './util';

type Facet = { pts: [number, number][]; cx: number; cy: number; r: number; g: number; b: number; delay: number; light: number };

let facets: Facet[] = [];
let pitchCss = 30;
let cols = 0;
let rows = 0;

const renderer: Renderer = {
  ms: { in: 1100, out: 600 },
  grid(width, height) {
    pitchCss = Math.min(40, Math.max(22, Math.round(width / 26)));
    cols = Math.ceil(width / pitchCss) + 1;
    rows = Math.ceil(height / pitchCss) + 1;
    return { cols, rows };
  },
  prepare(sample: Sample) {
    cols = sample.cols;
    rows = sample.rows;

    // Vertices, nudged off the grid by a fixed amount so the cut looks made by hand and never shimmers.
    const random = seeded(11);
    const jitter = 0.2;
    const vx: number[] = [];
    const vy: number[] = [];
    for (let y = 0; y <= rows; y++) {
      for (let x = 0; x <= cols; x++) {
        const edge = x === 0 || y === 0 || x === cols || y === rows;
        vx.push(x + (edge ? 0 : (random() - 0.5) * jitter * 2));
        vy.push(y + (edge ? 0 : (random() - 0.5) * jitter * 2));
      }
    }
    const V = (x: number, y: number): [number, number] => [vx[y * (cols + 1) + x], vy[y * (cols + 1) + x]];

    facets = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const o = (y * cols + x) * 4;
        if (sample.data[o + 3] < 8) continue;
        const r = sample.data[o];
        const g = sample.data[o + 1];
        const b = sample.data[o + 2];
        const flip = (x + y) % 2 === 0;
        // Two triangles per cell. The split alternates, and the two halves catch the light differently.
        const a = V(x, y);
        const bb = V(x + 1, y);
        const c = V(x, y + 1);
        const d = V(x + 1, y + 1);
        const t1: [number, number][] = flip ? [a, bb, c] : [a, bb, d];
        const t2: [number, number][] = flip ? [bb, d, c] : [a, d, c];
        const delay = ((x + y) / (cols + rows)) * 0.55;
        for (const [i, pts] of [t1, t2].entries()) {
          const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
          const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
          facets.push({ pts, cx, cy, r, g, b, delay, light: i === 0 ? 1.1 : 0.88 });
        }
      }
    }
  },
  paint(ctx: CanvasRenderingContext2D, size: Size, progress: number, tokens: Tokens) {
    const sx = size.w / cols;
    const sy = size.h / rows;

    ctx.fillStyle = tokens['--k-paper'] || '#e9e1d3';
    ctx.fillRect(0, 0, size.w, size.h);

    for (const f of facets) {
      const local = ease((progress - f.delay) / 0.45);
      if (local <= 0) continue;

      // The facet unfolds: it grows from a line along its own centre, like a fold opening.
      const k = local;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const x = (f.cx + (f.pts[i][0] - f.cx)) * sx;
        const y = (f.cy + (f.pts[i][1] - f.cy) * k) * sy;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      const shade = f.light;
      ctx.fillStyle = `rgb(${Math.min(255, f.r * shade)} ${Math.min(255, f.g * shade)} ${Math.min(255, f.b * shade)})`;
      ctx.fill();
      ctx.lineWidth = Math.max(0.6, size.dpr * 0.7);
      ctx.strokeStyle = 'rgb(255 255 255 / 0.28)';
      ctx.stroke();
    }

    // A faint paper grain over the whole sheet.
    ctx.globalAlpha = 0.5 * Math.min(1, progress * 2);
    ctx.fillStyle = 'rgb(120 95 60 / 0.06)';
    const random = seeded(3);
    for (let n = 0; n < 260; n++) ctx.fillRect(random() * size.w, random() * size.h, 1.5 * size.dpr, 1.5 * size.dpr);
    ctx.globalAlpha = 1;
  },
};

registerRenderer('origami', renderer);

registerRailPainter('origami', {
  step: 11,
  paint(ctx: CanvasRenderingContext2D, s: RailState) {
    const step = 11 * s.scale;
    const mid = s.height / 2;
    const reach = s.height / 2 - 3 * s.scale;
    const played = s.played * s.cols;
    const coral = s.tokens['--k-c1'] || '#ff7a59';
    const ribbon = 3.2 * s.scale;

    // Unplayed: the crease line the strip will be folded along.
    ctx.strokeStyle = 'rgb(120 100 70 / 0.55)';
    ctx.lineWidth = 1.4 * s.scale;
    ctx.setLineDash([5 * s.scale, 5 * s.scale]);
    ctx.beginPath();
    ctx.moveTo(Math.max(0, played * step), mid);
    ctx.lineTo(s.width, mid);
    ctx.stroke();
    ctx.setLineDash([]);

    // Played: an accordion fold. Each segment is a flat panel between a peak and a valley, alternately lit and shaded.
    let px = 0;
    let py = mid;
    for (let c = 0; c < s.cols && c < played; c++) {
      const heard = s.known[c] ? s.energy[c] : 0.3;
      const amp = Math.max(3 * s.scale, heard * reach);
      const x = (c + 1) * step;
      const y = mid + (c % 2 === 0 ? -amp : amp);
      ctx.beginPath();
      ctx.moveTo(px, py - ribbon);
      ctx.lineTo(x, y - ribbon);
      ctx.lineTo(x, y + ribbon);
      ctx.lineTo(px, py + ribbon);
      ctx.closePath();
      ctx.fillStyle = c % 2 === 0 ? coral : shade(coral, 0.78);
      ctx.fill();
      ctx.strokeStyle = 'rgb(255 255 255 / 0.4)';
      ctx.lineWidth = 0.8 * s.scale;
      ctx.stroke();
      px = x;
      py = y;
    }
  },
});

function shade(hex: string, k: number): string {
  const h = hex.replace('#', '');
  const r = Math.round(parseInt(h.slice(0, 2), 16) * k);
  const g = Math.round(parseInt(h.slice(2, 4), 16) * k);
  const b = Math.round(parseInt(h.slice(4, 6), 16) * k);
  return `rgb(${r} ${g} ${b})`;
}
