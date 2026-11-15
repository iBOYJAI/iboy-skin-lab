// TUI (text-based tech). Nothing is drawn that a terminal could not print. The paused frame is ASCII art, decrypting from
// noise into the picture. The seek bar is a row of text: block characters sized by the sound heard so far. A small log
// prints every player event with its timestamp, the way a process reports to a console. Buttons are bracketed words.

import './tui.css';
import { registerRenderer } from '../engine/frame';
import { registerRailPainter } from '../engine/rail';
import type { RailState, Renderer, Sample, Size, Tokens } from '../engine/types';
import { ease, findVideo } from '../engine/video';
import { lumaMap, seeded } from './util';

const RAMP = ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';

let luma = new Float32Array(0);
let inside = new Uint8Array(0);
let cols = 0;
let rows = 0;
let cw = 10;
let ch = 18;

const renderer: Renderer = {
  ms: { in: 900, out: 350 },
  grid(width, height) {
    cw = Math.max(7, Math.min(12, Math.round(width / 96)));
    ch = Math.round(cw * 1.8);
    return { cols: Math.ceil(width / cw), rows: Math.ceil(height / ch) };
  },
  prepare(sample: Sample) {
    ({ luma, inside } = lumaMap(sample, 0.95));
    cols = sample.cols;
    rows = sample.rows;
  },
  paint(ctx: CanvasRenderingContext2D, size: Size, progress: number, tokens: Tokens) {
    const fg = tokens['--k-fg'] || '#e8e8e8';
    const x0 = cw * size.dpr;
    const y0 = ch * size.dpr;

    ctx.fillStyle = tokens['--k-paper'] || '#0a0a0a';
    ctx.fillRect(0, 0, size.w, size.h);

    ctx.font = `${Math.round(ch * 0.82 * size.dpr)}px "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // The frame resolves out of noise in a wave: each character scrambles until the wave reaches it.
    const frameTick = Math.floor(progress * 40);
    const random = seeded(frameTick * 977 + 13);
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        if (!inside[i]) continue;
        const l = luma[i];
        if (l < 0.04 && progress >= 1) continue;

        const delay = (cx / cols) * 0.45 + (cy / rows) * 0.2;
        const local = ease((progress - delay) / 0.35);
        if (local <= 0) continue;

        const settled = local >= 1;
        const glyph = settled ? RAMP[Math.min(RAMP.length - 1, Math.floor(l * (RAMP.length - 1)))] : RAMP[Math.floor(random() * RAMP.length)];
        if (glyph === ' ') continue;

        const tone = settled ? 70 + l * 185 : 120;
        ctx.fillStyle = settled ? `rgb(${tone} ${tone} ${tone})` : fg;
        ctx.globalAlpha = settled ? 1 : 0.55;
        ctx.fillText(glyph, (cx + 0.5) * x0, (cy + 0.5) * y0);
      }
    }
    ctx.globalAlpha = 1;
  },
};

registerRenderer('tui', renderer);

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

registerRailPainter('tui', {
  step: 9,
  paint(ctx: CanvasRenderingContext2D, s: RailState) {
    const step = 9 * s.scale;
    const played = s.played * s.cols;
    const amber = s.tokens['--k-accent'] || '#ffb000';
    const fg = s.tokens['--k-fg'] || '#e8e8e8';

    ctx.font = `${Math.round(s.height * 0.8)}px "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    for (let c = 0; c < s.cols; c++) {
      const x = (c + 0.5) * step;
      const y = s.height / 2;
      if (c + 1 <= played) {
        const heard = s.known[c] ? s.energy[c] : 0.25;
        ctx.fillStyle = fg;
        ctx.fillText(BLOCKS[Math.min(7, Math.floor(heard * 8))], x, y);
      } else if (c < played) {
        ctx.fillStyle = amber;
        ctx.fillText('█', x, y);
      } else {
        ctx.fillStyle = 'rgb(232 232 232 / 0.35)';
        ctx.fillText('·', x, y);
      }
    }
  },
});

// <media-log>: the console. Prints each player event as a timestamped line, newest last, the oldest fading out.
class MediaLog extends HTMLElement {
  #video: HTMLVideoElement | null = null;
  #lines: HTMLElement[] = [];
  #watch: MutationObserver | null = null;
  static events = ['play', 'pause', 'seeked', 'ended', 'waiting', 'volumechange', 'ratechange'] as const;

  connectedCallback() {
    this.setAttribute('aria-hidden', 'true');
    const container = this.closest<HTMLElement>('.media-skin');
    const play = container?.querySelector('media-play-button');
    const bind = () => {
      const v = findVideo(container ?? null);
      if (v && v !== this.#video) {
        this.#unbind();
        this.#video = v;
        for (const type of MediaLog.events) v.addEventListener(type, this.#on);
        this.#print('session open', 'ok');
      }
    };
    bind();
    if (play) {
      this.#watch = new MutationObserver(bind);
      this.#watch.observe(play, { attributes: true });
    }
  }

  disconnectedCallback() {
    this.#unbind();
    this.#watch?.disconnect();
  }

  #unbind() {
    for (const type of MediaLog.events) this.#video?.removeEventListener(type, this.#on);
  }

  #on = (event: Event) => {
    const v = this.#video;
    if (!v) return;
    const detail: Record<string, string> = {
      play: 'play',
      pause: 'pause',
      seeked: `seek to ${stamp(v.currentTime)}`,
      ended: 'end of stream',
      waiting: 'buffering',
      volumechange: v.muted ? 'volume muted' : `volume ${Math.round(v.volume * 100)}%`,
      ratechange: `speed ${v.playbackRate}x`,
    };
    this.#print(detail[event.type] ?? event.type, event.type === 'waiting' ? 'warn' : 'ok');
  };

  #print(text: string, level: 'ok' | 'warn') {
    if (this.closest<HTMLElement>('.media-skin')?.dataset.skin !== 'tui') return;
    const line = document.createElement('div');
    line.className = level === 'warn' ? 'log-line warn' : 'log-line';
    const t = this.#video ? stamp(this.#video.currentTime) : '00:00.0';
    line.textContent = `[${t}] ${text}`;
    this.append(line);
    this.#lines.push(line);
    while (this.#lines.length > 6) this.#lines.shift()?.remove();
    // Each line is gone after a while, so the log never builds up over the picture.
    window.setTimeout(() => {
      line.remove();
      this.#lines = this.#lines.filter((l) => l !== line);
    }, 7000);
  }
}

function stamp(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

if (!customElements.get('media-log')) customElements.define('media-log', MediaLog);
