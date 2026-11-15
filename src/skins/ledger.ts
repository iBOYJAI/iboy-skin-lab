// LEDGER (web3). The frame is minted: it is cut into a grid of tiles, and the SHA-256 of the sampled pixels is printed
// as its token, so the hash on screen really is the hash of what you are looking at. The seek bar is a chain of blocks;
// each block fills as it is played and is as tall as that moment was loud. Nothing here touches a blockchain.

import './ledger.css';
import { registerRenderer } from '../engine/frame';
import { registerRailPainter } from '../engine/rail';
import type { RailState, Renderer, Sample, Size, Tokens } from '../engine/types';
import { ease } from '../engine/video';

let tiles: { x: number; y: number; r: number; g: number; b: number }[] = [];
let cols = 0;
let rows = 0;
let token = '0x';
let readable = true;

const renderer: Renderer = {
  ms: { in: 900, out: 450 },
  grid(width) {
    const c = Math.max(20, Math.min(56, Math.round(width / 22)));
    // Square tiles: the height follows the same tile size.
    cols = c;
    const tile = width / c;
    return { cols: c, rows: Math.ceil(heightHint / tile) };
  },
  prepare(sample: Sample) {
    cols = sample.cols;
    rows = sample.rows;
    readable = sample.readable;
    tiles = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const o = (y * cols + x) * 4;
        if (sample.data[o + 3] < 8) continue;
        tiles.push({ x, y, r: sample.data[o], g: sample.data[o + 1], b: sample.data[o + 2] });
      }
    }
    token = '0x' + sha256Hex(sample.data);
  },
  paint(ctx: CanvasRenderingContext2D, size: Size, progress: number, tokens: Tokens) {
    const accent = tokens['--k-accent'] || '#d4ff3a';
    const tile = size.w / cols;
    const gap = Math.max(1.5, tile * 0.1);

    ctx.fillStyle = '#080908';
    ctx.fillRect(0, 0, size.w, size.h);

    const dr = (cols + rows) * 0.5;
    for (const t of tiles) {
      // Tiles confirm in a diagonal wave from the top left.
      const delay = ((t.x + t.y) / (cols + rows)) * 0.6;
      const local = ease((progress - delay) / 0.4);
      if (local <= 0) continue;

      const x = t.x * tile + gap / 2;
      const y = t.y * tile + gap / 2;
      const s = (tile - gap) * (0.6 + 0.4 * local);
      const off = (tile - gap - s) / 2;
      ctx.fillStyle = readable ? `rgb(${t.r} ${t.g} ${t.b})` : '#1e211b';
      ctx.fillRect(x + off, y + off, s, s);

      // A fresh tile flashes its edge, like a block being confirmed.
      if (local < 0.85) {
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 1 - local;
        ctx.lineWidth = Math.max(1, size.dpr);
        ctx.strokeRect(x + off, y + off, s, s);
        ctx.globalAlpha = 1;
      }
    }
    void dr;

    // The token, printed on the tile bed.
    if (progress > 0.5) {
      const a = ease((progress - 0.5) / 0.5);
      const font = Math.max(10, Math.round(11 * size.dpr));
      ctx.font = `700 ${font}px "Space Mono", ui-monospace, monospace`;
      const lines = ['FRAME TOKEN', token.slice(0, 14) + '...' + token.slice(-6), 'SHA-256 OF ' + tiles.length + ' TILES'];
      const widthOf = Math.max(...lines.map((l) => ctx.measureText(l).width)) + font * 1.6;
      const boxX = 14 * size.dpr;
      const boxY = (size.w / size.dpr < 480 ? 10 : 58) * size.dpr;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#080908';
      ctx.fillRect(boxX, boxY, widthOf, font * 4.4);
      ctx.strokeStyle = accent;
      ctx.lineWidth = size.dpr;
      ctx.strokeRect(boxX, boxY, widthOf, font * 4.4);
      ctx.fillStyle = accent;
      ctx.fillText(lines[0], boxX + font * 0.8, boxY + font * 1.4);
      ctx.fillStyle = '#f2f4ee';
      ctx.fillText(lines[1], boxX + font * 0.8, boxY + font * 2.6);
      ctx.fillStyle = '#9aa092';
      ctx.fillText(lines[2], boxX + font * 0.8, boxY + font * 3.7);
      ctx.globalAlpha = 1;
    }
  },
};

// The grid needs the player's height too; the engine passes only the width to grid(), so it is read from the layout.
let heightHint = 540;
const baseGrid = renderer.grid;
renderer.grid = (width: number, height: number) => {
  heightHint = height;
  return baseGrid.call(renderer, width, height);
};

registerRenderer('ledger', renderer);

registerRailPainter('ledger', {
  step: 15,
  paint(ctx: CanvasRenderingContext2D, s: RailState) {
    const step = 15 * s.scale;
    const lime = s.tokens['--k-accent'] || '#d4ff3a';
    const base = s.height - 2 * s.scale;
    const reach = s.height - 6 * s.scale;
    const played = s.played * s.cols;
    const w = step * 0.7;

    for (let c = 0; c < s.cols; c++) {
      const x = c * step + (step - w) / 2;
      const isPlayed = c + 1 <= played;
      const current = c < played && c + 1 > played;
      const heard = s.known[c] ? s.energy[c] : 0.3;
      const h = isPlayed || current ? Math.max(5 * s.scale, heard * reach) : 0.32 * reach;

      // The link to the next block.
      ctx.fillStyle = isPlayed ? lime : 'rgb(212 255 58 / 0.3)';
      ctx.fillRect(x + w, base - h * 0.5, step - w, Math.max(1, s.scale));

      if (isPlayed) {
        ctx.fillStyle = lime;
        ctx.fillRect(x, base - h, w, h);
      } else {
        ctx.strokeStyle = current ? lime : 'rgb(212 255 58 / 0.4)';
        ctx.lineWidth = (current ? 2 : 1) * s.scale;
        ctx.strokeRect(x + 0.5, base - h + 0.5, w - 1, h - 1);
        if (current) {
          // The block being mined fills from the bottom as the position moves through it.
          const fill = (played - c) * h;
          ctx.fillStyle = lime;
          ctx.fillRect(x, base - fill, w, fill);
        }
      }
    }
  },
});

// SHA-256, small and synchronous, so the token is ready the moment the frame is.
function sha256Hex(bytes: Uint8ClampedArray): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74,
    0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d,
    0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e,
    0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const length = bytes.length;
  const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, (length * 8) >>> 0);
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 4294967296));

  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] += a;
    H[1] += b;
    H[2] += c;
    H[3] += d;
    H[4] += e;
    H[5] += f;
    H[6] += g;
    H[7] += h;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
}
