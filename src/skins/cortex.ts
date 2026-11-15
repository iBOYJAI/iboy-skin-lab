// CORTEX (future, AI). The picture is read like a machine would read it: colour regions are found by clustering, the
// largest are boxed, and every box is labelled with what was actually measured (its colour and its share of the
// frame). Nothing is recognised or named: it is colour segmentation, and the label on screen says so. The seek bar is a
// field of fine ticks whose height is the loudness heard, with a single crosshair for the present.

import './cortex.css';
import { registerRenderer } from '../engine/frame';
import { registerRailPainter } from '../engine/rail';
import type { RailState, Renderer, Sample, Size, Tokens } from '../engine/types';
import { ease } from '../engine/video';

type Region = { id: number; hex: string; share: number; x0: number; y0: number; x1: number; y1: number; cells: number[] };

let regions: Region[] = [];
let palette: { hex: string; share: number }[] = [];
let cols = 0;
let rows = 0;
let readable = true;

const K = 6;

const renderer: Renderer = {
  ms: { in: 1000, out: 400 },
  grid(width, height) {
    const cell = Math.max(8, Math.round(width / 100));
    return { cols: Math.ceil(width / cell), rows: Math.ceil(height / cell) };
  },
  prepare(sample: Sample) {
    cols = sample.cols;
    rows = sample.rows;
    readable = sample.readable;
    regions = [];
    palette = [];
    if (!readable) return;

    const n = cols * rows;
    const pts: number[] = [];
    for (let i = 0; i < n; i++) if (sample.data[i * 4 + 3] >= 8) pts.push(i);
    if (!pts.length) return;

    // k-means on colour, seeded from evenly spaced brightness ranks so the result is stable for a given frame.
    const lum = (i: number) => sample.data[i * 4] * 0.3 + sample.data[i * 4 + 1] * 0.59 + sample.data[i * 4 + 2] * 0.11;
    const sorted = [...pts].sort((a, b) => lum(a) - lum(b));
    const centres: number[][] = [];
    for (let k = 0; k < K; k++) {
      const i = sorted[Math.floor(((k + 0.5) / K) * (sorted.length - 1))];
      centres.push([sample.data[i * 4], sample.data[i * 4 + 1], sample.data[i * 4 + 2]]);
    }

    const label = new Int8Array(n).fill(-1);
    for (let iter = 0; iter < 6; iter++) {
      const sum = centres.map(() => [0, 0, 0, 0]);
      for (const i of pts) {
        const r = sample.data[i * 4];
        const g = sample.data[i * 4 + 1];
        const b = sample.data[i * 4 + 2];
        let best = 0;
        let bd = Infinity;
        for (let k = 0; k < K; k++) {
          const d = (r - centres[k][0]) ** 2 + (g - centres[k][1]) ** 2 + (b - centres[k][2]) ** 2;
          if (d < bd) {
            bd = d;
            best = k;
          }
        }
        label[i] = best;
        sum[best][0] += r;
        sum[best][1] += g;
        sum[best][2] += b;
        sum[best][3]++;
      }
      for (let k = 0; k < K; k++) {
        if (sum[k][3]) centres[k] = [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]];
      }
    }

    const counts = new Array(K).fill(0);
    for (const i of pts) counts[label[i]]++;
    const hexOf = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    palette = centres.map((c, k) => ({ hex: hexOf(c), share: counts[k] / pts.length })).sort((a, b) => b.share - a.share);

    // Connected regions of one colour (4-neighbour flood fill), keeping the largest few.
    const seen = new Uint8Array(n);
    const found: Region[] = [];
    for (const start of pts) {
      if (seen[start]) continue;
      const colour = label[start];
      const stack = [start];
      seen[start] = 1;
      const cells: number[] = [];
      let x0 = cols;
      let y0 = rows;
      let x1 = 0;
      let y1 = 0;
      while (stack.length) {
        const i = stack.pop()!;
        cells.push(i);
        const x = i % cols;
        const y = (i / cols) | 0;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
        for (const j of [i - 1, i + 1, i - cols, i + cols]) {
          if (j < 0 || j >= n || seen[j] || label[j] !== colour) continue;
          if ((j === i - 1 && x === 0) || (j === i + 1 && x === cols - 1)) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
      if (cells.length > pts.length * 0.012) {
        found.push({ id: 0, hex: hexOf(centres[colour]), share: cells.length / pts.length, x0, y0, x1: x1 + 1, y1: y1 + 1, cells });
      }
    }
    regions = found.sort((a, b) => b.share - a.share).slice(0, 5);
    regions.forEach((r, i) => (r.id = i + 1));
  },
  paint(ctx: CanvasRenderingContext2D, size: Size, progress: number, tokens: Tokens) {
    const accent = tokens['--k-accent'] || '#ff4f1f';
    const cell = size.w / cols;
    const p = ease(progress);

    // The picture stays visible beneath, dimmed so the annotations read.
    ctx.fillStyle = 'rgb(10 12 14 / ' + 0.5 * p + ')';
    ctx.fillRect(0, 0, size.w, size.h);

    // A scan line sweeps down; regions are marked as it passes.
    const scan = p * (size.h + 20 * size.dpr);
    const font = Math.max(10, Math.round(11 * size.dpr));
    ctx.font = `700 ${font}px "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace`;

    for (const r of regions) {
      const top = r.y0 * cell;
      if (scan < top) continue;
      const a = Math.min(1, (scan - top) / (40 * size.dpr));

      // Tint the region's own cells.
      ctx.globalAlpha = 0.22 * a;
      ctx.fillStyle = r.hex;
      for (const i of r.cells) ctx.fillRect((i % cols) * cell, ((i / cols) | 0) * cell, cell, cell);
      ctx.globalAlpha = a;

      // Box with corner ticks.
      const x = r.x0 * cell;
      const y = r.y0 * cell;
      const w = (r.x1 - r.x0) * cell;
      const h = (r.y1 - r.y0) * cell;
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1, 1.5 * size.dpr);
      ctx.setLineDash([4 * size.dpr, 3 * size.dpr]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      const tick = 9 * size.dpr;
      ctx.lineWidth = 2.5 * size.dpr;
      ctx.beginPath();
      for (const [cx, cy, dx, dy] of [
        [x, y, 1, 1],
        [x + w, y, -1, 1],
        [x, y + h, 1, -1],
        [x + w, y + h, -1, -1],
      ]) {
        ctx.moveTo(cx + dx * tick, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + dy * tick);
      }
      ctx.stroke();

      // Label: region number, colour, share. Measured, not recognised.
      const text = `R${r.id}  ${r.hex.toUpperCase()}  ${(r.share * 100).toFixed(1)}%`;
      const tw = ctx.measureText(text).width + font;
      const ly = y > font * 2.4 ? y - font * 1.9 : y + h + 4 * size.dpr;
      ctx.fillStyle = '#0b0d0f';
      ctx.fillRect(x, ly, tw, font * 1.7);
      ctx.fillStyle = r.hex;
      ctx.fillRect(x, ly, font * 0.5, font * 1.7);
      ctx.fillStyle = '#f2f4f5';
      ctx.fillText(text, x + font * 0.9, ly + font * 1.2);
      ctx.globalAlpha = 1;
    }

    if (progress < 1) {
      ctx.fillStyle = accent;
      ctx.fillRect(0, scan, size.w, 2 * size.dpr);
    }

    // Palette strip and the plain statement of what this is.
    if (p > 0.6) {
      const a = (p - 0.6) / 0.4;
      ctx.globalAlpha = a;
      const sw = 26 * size.dpr;
      const sx = 14 * size.dpr;
      const sy = size.h - 14 * size.dpr - (size.h > 300 * size.dpr ? 108 * size.dpr : 100 * size.dpr);
      palette.forEach((c, i) => {
        ctx.fillStyle = c.hex;
        ctx.fillRect(sx + i * (sw + 4 * size.dpr), sy, sw, 8 * size.dpr);
      });
      ctx.fillStyle = '#f2f4f5';
      ctx.font = `700 ${Math.round(10 * size.dpr)}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.fillText('COLOUR REGIONS  K=6  MEASURED, NOT RECOGNISED', sx, sy - 6 * size.dpr);
      ctx.globalAlpha = 1;
    }
  },
};

registerRenderer('cortex', renderer);

registerRailPainter('cortex', {
  step: 4,
  paint(ctx: CanvasRenderingContext2D, s: RailState) {
    const step = 4 * s.scale;
    const played = s.played * s.cols;
    const ink = s.tokens['--k-fg'] || '#14171a';
    const accent = s.tokens['--k-accent'] || '#ff4f1f';
    const mid = s.height / 2;
    const reach = s.height / 2 - 2 * s.scale;

    for (let c = 0; c < s.cols; c++) {
      const x = (c + 0.5) * step;
      const isPlayed = c < played;
      const heard = s.known[c] ? s.energy[c] : 0.25;
      const h = isPlayed ? Math.max(2 * s.scale, heard * reach) : 2.5 * s.scale;
      ctx.fillStyle = ink;
      ctx.globalAlpha = isPlayed ? 0.9 : 0.28;
      ctx.fillRect(x - 0.7 * s.scale, mid - h, 1.4 * s.scale, h * 2);
    }
    ctx.globalAlpha = 1;

    // The present: a crosshair line.
    const px = Math.min(s.width, played * step);
    ctx.fillStyle = accent;
    ctx.fillRect(px - 1 * s.scale, 0, 2 * s.scale, s.height);
  },
});
