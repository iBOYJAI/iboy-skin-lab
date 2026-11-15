// CEL (cartoon). The frame is redrawn as a comic panel: colours flattened to a few bold tones, with a thick ink line
// wherever the picture changes sharply, and a burst of speed lines as it pops in. The seek bar is a rope that bounces to
// the sound, and a small mascot rides it (see cel.css).

import './cel.css';
import { registerRenderer } from '../engine/frame';
import { registerRailPainter } from '../engine/rail';
import type { RailState, Renderer, Sample, Size, Tokens } from '../engine/types';
import { ease } from '../engine/video';

let art: HTMLCanvasElement | null = null;
let ratio = { x: 0, y: 0, w: 1, h: 1 };

const renderer: Renderer = {
  ms: { in: 700, out: 380 },
  grid(width, height) {
    const cell = 3;
    return { cols: Math.ceil(width / cell), rows: Math.ceil(height / cell) };
  },
  prepare(sample: Sample) {
    const { cols, rows, data } = sample;
    const out = new ImageData(cols, rows);
    const luma = new Float32Array(cols * rows);

    for (let i = 0; i < cols * rows; i++) {
      const o = i * 4;
      luma[i] = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255;
    }

    const levels = 4;
    for (let i = 0; i < cols * rows; i++) {
      const o = i * 4;
      if (data[o + 3] < 8) continue;
      const mean = (data[o] + data[o + 1] + data[o + 2]) / 3;
      // Punchier colour, then flatten each channel to a few tones, like a painted cel.
      for (let k = 0; k < 3; k++) {
        const v = Math.min(255, Math.max(0, mean + (data[o + k] - mean) * 1.5));
        out.data[o + k] = Math.round((v / 255) * (levels - 1)) * (255 / (levels - 1));
      }
      out.data[o + 3] = 255;
    }

    // Ink: a Sobel edge on brightness, thickened by one cell.
    const edge = new Uint8Array(cols * rows);
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x;
        if (data[i * 4 + 3] < 8) continue;
        const gx = -luma[i - cols - 1] - 2 * luma[i - 1] - luma[i + cols - 1] + luma[i - cols + 1] + 2 * luma[i + 1] + luma[i + cols + 1];
        const gy = -luma[i - cols - 1] - 2 * luma[i - cols] - luma[i - cols + 1] + luma[i + cols - 1] + 2 * luma[i + cols] + luma[i + cols + 1];
        if (Math.hypot(gx, gy) > 0.42) edge[i] = 1;
      }
    }
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x;
        if (edge[i] || edge[i - 1] || edge[i - cols]) {
          if (data[i * 4 + 3] < 8) continue;
          out.data[i * 4] = 24;
          out.data[i * 4 + 1] = 22;
          out.data[i * 4 + 2] = 30;
        }
      }
    }

    art ??= document.createElement('canvas');
    art.width = cols;
    art.height = rows;
    art.getContext('2d')!.putImageData(out, 0, 0);
    ratio = { x: 0, y: 0, w: cols, h: rows };
  },
  paint(ctx: CanvasRenderingContext2D, size: Size, progress: number, tokens: Tokens) {
    if (!art) return;
    const sky = tokens['--k-paper'] || '#8fd8ff';
    const p = ease(progress);

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, size.w, size.h);

    // The art pops in: it overshoots a little, then settles.
    const pop = 0.9 + 0.1 * p + Math.sin(p * Math.PI) * 0.04;
    ctx.save();
    ctx.translate(size.w / 2, size.h / 2);
    ctx.scale(pop, pop);
    ctx.globalAlpha = Math.min(1, progress * 3);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(art, ratio.x, ratio.y, ratio.w, ratio.h, -size.w / 2, -size.h / 2, size.w, size.h);
    ctx.restore();
    ctx.globalAlpha = 1;

    // Speed lines, radiating from the middle while it pops.
    if (progress > 0 && progress < 1) {
      const rays = 26;
      const fade = 1 - progress;
      ctx.fillStyle = `rgb(255 255 255 / ${0.55 * fade})`;
      for (let r = 0; r < rays; r++) {
        const a = (r / rays) * Math.PI * 2;
        const inner = Math.min(size.w, size.h) * (0.2 + 0.5 * p);
        const outer = Math.hypot(size.w, size.h);
        const spread = 0.035;
        ctx.beginPath();
        ctx.moveTo(size.w / 2 + Math.cos(a - spread) * inner, size.h / 2 + Math.sin(a - spread) * inner);
        ctx.lineTo(size.w / 2 + Math.cos(a) * outer, size.h / 2 + Math.sin(a) * outer);
        ctx.lineTo(size.w / 2 + Math.cos(a + spread) * inner, size.h / 2 + Math.sin(a + spread) * inner);
        ctx.fill();
      }
    }
  },
};

registerRenderer('cel', renderer);

registerRailPainter('cel', {
  step: 6,
  paint(ctx: CanvasRenderingContext2D, s: RailState) {
    const step = 6 * s.scale;
    const mid = s.height / 2;
    const reach = s.height / 2 - 6 * s.scale;
    const ink = '#1b1b24';
    const rope = s.tokens['--k-c1'] || '#ff5d5d';
    const playedCols = s.played * s.cols;

    // Unplayed: a flat dashed line the rope has yet to reach.
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3 * s.scale;
    ctx.lineCap = 'round';
    ctx.setLineDash([6 * s.scale, 7 * s.scale]);
    ctx.beginPath();
    ctx.moveTo(playedCols * step, mid);
    ctx.lineTo(s.width, mid);
    ctx.stroke();
    ctx.setLineDash([]);

    if (playedCols <= 0) return;

    // Played: a rope that bounces higher where it was louder.
    const path = new Path2D();
    path.moveTo(0, mid);
    const end = Math.min(s.width, playedCols * step);
    for (let x = 0; x <= end; x += 2 * s.scale) {
      const c = Math.min(s.cols - 1, Math.floor(x / step));
      const heard = s.known[c] ? s.energy[c] : 0.3;
      const amp = Math.max(2 * s.scale, heard * reach);
      path.lineTo(x, mid + Math.sin(x / (9 * s.scale)) * amp);
    }

    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 8 * s.scale;
    ctx.stroke(path);
    ctx.strokeStyle = rope;
    ctx.lineWidth = 4.5 * s.scale;
    ctx.stroke(path);
    ctx.strokeStyle = 'rgb(255 255 255 / 0.55)';
    ctx.lineWidth = 1.3 * s.scale;
    ctx.save();
    ctx.translate(0, -1.4 * s.scale);
    ctx.stroke(path);
    ctx.restore();
  },
});
