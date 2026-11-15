import type { Sample } from '../engine/types';

/**
 * Brightness per cell, auto-levelled: the picture's own 4th to 98th percentile is stretched across 0 to 1, so a white
 * scene does not fill solid and a dark one does not vanish. `inside` marks cells that hold picture (not letterbox).
 */
export function lumaMap(sample: Sample, gamma = 1.1): { luma: Float32Array<ArrayBuffer>; inside: Uint8Array<ArrayBuffer> } {
  const n = sample.cols * sample.rows;
  const luma = new Float32Array(n);
  const inside = new Uint8Array(n);
  const bins = new Uint32Array(64);
  let counted = 0;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (sample.data[o + 3] < 8) continue;
    const l = (0.2126 * sample.data[o] + 0.7152 * sample.data[o + 1] + 0.0722 * sample.data[o + 2]) / 255;
    luma[i] = l;
    inside[i] = 1;
    bins[Math.min(63, Math.floor(l * 64))]++;
    counted++;
  }

  if (!sample.readable) {
    // Unreadable picture: a calm mid-grey over the letterbox rectangle.
    for (let cy = 0; cy < sample.rows; cy++) {
      for (let cx = 0; cx < sample.cols; cx++) {
        const i = cy * sample.cols + cx;
        const r = sample.rect;
        const inRect = cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h;
        inside[i] = inRect ? 1 : 0;
        luma[i] = inRect ? 0.45 : 0;
      }
    }
    return { luma, inside };
  }

  let low = 0;
  let high = 1;
  let running = 0;
  for (let b = 0; b < 64; b++) {
    running += bins[b];
    if (running >= counted * 0.04) {
      low = b / 64;
      break;
    }
  }
  running = 0;
  for (let b = 0; b < 64; b++) {
    running += bins[b];
    if (running >= counted * 0.98) {
      high = (b + 1) / 64;
      break;
    }
  }
  const span = Math.max(0.12, high - low);

  for (let i = 0; i < n; i++) {
    if (!inside[i]) continue;
    luma[i] = Math.pow(Math.min(1, Math.max(0, (luma[i] - low) / span)), gamma);
  }
  return { luma, inside };
}

export function hexToRgb(value: string, fallback: [number, number, number] = [255, 255, 255]): [number, number, number] {
  const hex = value.trim().replace('#', '');
  if (hex.length === 6) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  if (hex.length === 3) return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
  return fallback;
}

/** A tiny deterministic random number generator, so textures do not shimmer between frames. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
