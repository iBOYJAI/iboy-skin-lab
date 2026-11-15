// RISO (2D). A two-ink print. The frame is separated into a pink plate and a blue plate, each a halftone screen at its
// own angle, printed slightly out of register on cream paper, the way a risograph does it. The seek bar is a bar chart
// printed in the same two inks, the sound drawn in pink with a blue ghost beside it.

import './riso.css';
import { registerRenderer } from '../engine/frame';
import { registerRailPainter } from '../engine/rail';
import type { RailState, Renderer, Sample, Size, Tokens } from '../engine/types';
import { ease } from '../engine/video';
import { lumaMap, seeded } from './util';

let luma = new Float32Array(0);
let inside = new Uint8Array(0);
let cols = 0;
let rows = 0;
let cell = 4;

const renderer: Renderer = {
  ms: { in: 1000, out: 550 },
  grid(width, height) {
    cell = 4;
    return { cols: Math.ceil(width / cell), rows: Math.ceil(height / cell) };
  },
  prepare(sample: Sample) {
    ({ luma, inside } = lumaMap(sample, 1.0));
    cols = sample.cols;
    rows = sample.rows;
  },
  paint(ctx: CanvasRenderingContext2D, size: Size, progress: number, tokens: Tokens) {
    const paper = tokens['--k-paper'] || '#f3eedd';
    const pink = tokens['--k-c1'] || '#ff48b0';
    const blue = tokens['--k-c2'] || '#0078bf';
    const wipe = ease(progress) * (size.w + 80 * size.dpr);

    // The paper, with its grain.
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, size.w, size.h);
    const random = seeded(7);
    ctx.fillStyle = 'rgb(90 70 30 / 0.07)';
    for (let n = 0; n < 500; n++) ctx.fillRect(random() * size.w, random() * size.h, 1.2 * size.dpr, 1.2 * size.dpr);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, wipe, size.h);
    ctx.clip();
    ctx.globalCompositeOperation = 'multiply';

    // Each plate: a rotated lattice of dots, each sized by how much ink that spot of the picture needs. The blue plate
    // is printed three pixels off, which is where the print gets its character.
    const pitch = 7 * size.dpr;
    screen(ctx, size, pitch, (15 * Math.PI) / 180, 0, 0, pink, (l) => Math.pow(1 - l, 0.9));
    screen(ctx, size, pitch, (75 * Math.PI) / 180, 3 * size.dpr, 2 * size.dpr, blue, (l) => Math.pow(1 - l, 1.5) * 0.95);
    ctx.restore();

    // The roller edge: a thin line of ink where the print is being laid down.
    if (progress > 0 && progress < 1) {
      ctx.fillStyle = tokens['--k-ink'] || '#1a1a2e';
      ctx.fillRect(wipe - 2 * size.dpr, 0, 3 * size.dpr, size.h);
    }
  },
};

function screen(
  ctx: CanvasRenderingContext2D,
  size: Size,
  pitch: number,
  angle: number,
  dx: number,
  dy: number,
  colour: string,
  coverage: (l: number) => number
) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const diag = Math.hypot(size.w, size.h);
  const count = Math.ceil(diag / pitch);
  const cellPx = cell * size.dpr;

  ctx.fillStyle = colour;
  ctx.beginPath();
  for (let u = -count; u <= count; u++) {
    for (let v = -count; v <= count; v++) {
      const x = size.w / 2 + u * pitch * cos - v * pitch * sin + dx;
      const y = size.h / 2 + u * pitch * sin + v * pitch * cos + dy;
      if (x < -pitch || y < -pitch || x > size.w + pitch || y > size.h + pitch) continue;

      const cx = Math.min(cols - 1, Math.max(0, Math.floor((x - dx) / cellPx)));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor((y - dy) / cellPx)));
      const i = cy * cols + cx;
      if (!inside[i]) continue;

      const c = coverage(luma[i]);
      if (c < 0.04) continue;
      const r = pitch * 0.62 * Math.sqrt(c);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

registerRenderer('riso', renderer);

registerRailPainter('riso', {
  step: 6,
  paint(ctx: CanvasRenderingContext2D, s: RailState) {
    const step = 6 * s.scale;
    const pink = s.tokens['--k-c1'] || '#ff48b0';
    const blue = s.tokens['--k-c2'] || '#0078bf';
    const ink = s.tokens['--k-ink'] || '#1a1a2e';
    const played = s.played * s.cols;
    const base = s.height - 3 * s.scale;
    const reach = s.height - 8 * s.scale;

    // Unplayed: fine ink ticks, like the registration marks on a print sheet.
    ctx.fillStyle = ink;
    for (let c = Math.floor(played); c < s.cols; c++) {
      ctx.globalAlpha = c % 5 === 0 ? 0.7 : 0.35;
      ctx.fillRect(c * step + step * 0.35, base - (c % 5 === 0 ? 8 : 4) * s.scale, 1.4 * s.scale, (c % 5 === 0 ? 8 : 4) * s.scale);
    }
    ctx.globalAlpha = 1;

    // Played: pink bars, with a blue ghost printed off to the side.
    ctx.globalCompositeOperation = 'multiply';
    for (let c = 0; c < Math.min(s.cols, Math.ceil(played)); c++) {
      const heard = s.known[c] ? s.energy[c] : 0.3;
      const h = Math.max(3 * s.scale, heard * reach);
      const w = step * 0.72;
      ctx.fillStyle = blue;
      ctx.fillRect(c * step + 2 * s.scale, base - h * 0.8 + 1.5 * s.scale, w, h * 0.8);
      ctx.fillStyle = pink;
      ctx.fillRect(c * step, base - h, w, h);
    }
    ctx.globalCompositeOperation = 'source-over';
  },
});
