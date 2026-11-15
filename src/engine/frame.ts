// <media-frame>: the picture, redrawn in the skin's own material.
//
// Before the first play the poster is shown through the effect. Pressing play dissolves it away to reveal the film.
// Whenever playback pauses or ends the frozen frame is rebuilt through the effect, and resuming dissolves it again.
// The engine does the sampling, the timing and the lifecycle. The skin's renderer (see ../skins) decides how the
// picture looks, which is what makes pin art, a riso print or a block of ASCII.
//
// The canvas loop runs only during a transition (about a second) and never while the page is hidden. If the browser
// will not let the page read the picture (media without CORS headers), renderers receive an unreadable sample and draw
// their own plain fallback.

import type { Renderer, Sample, Tokens } from './types';
import { findVideo, readTokens } from './video';

const renderers = new Map<string, Renderer>();

export function registerRenderer(skin: string, renderer: Renderer) {
  renderers.set(skin, renderer);
}

export class MediaFrame extends HTMLElement {
  #canvas = document.createElement('canvas');
  #ctx = this.#canvas.getContext('2d')!;
  #sampler = document.createElement('canvas');
  #samplerCtx = this.#sampler.getContext('2d', { willReadFrequently: true })!;

  #container: HTMLElement | null = null;
  #video: HTMLVideoElement | null = null;
  #poster: HTMLImageElement | null = null;
  #posterUrl = '';
  #watchers: MutationObserver[] = [];
  #resize: ResizeObserver | null = null;
  #motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  #skin = '';
  #renderer: Renderer | null = null;
  #tokens: Tokens = {};
  #dpr = 1;
  #box = { w: 0, h: 0 };
  #sample: Sample | null = null;

  #progress = 0;
  #target = 0;
  #span = 600;
  #wasStarted = false;
  #raf = 0;
  #retry = 0;
  #lastTick = 0;

  connectedCallback() {
    this.setAttribute('aria-hidden', 'true');
    this.#canvas.className = 'frame-canvas';
    this.append(this.#canvas);

    this.#container = this.closest<HTMLElement>('.media-skin');
    if (!this.#container) return;

    const play = this.#container.querySelector('media-play-button');
    if (play) {
      const watcher = new MutationObserver(() => this.#sync());
      watcher.observe(play, { attributes: true, attributeFilter: ['data-paused', 'data-started', 'data-ended'] });
      this.#watchers.push(watcher);
    }

    // A skin or theme change swaps the renderer and restyles it without a reload.
    const skin = new MutationObserver(() => this.#adopt());
    skin.observe(this.#container, { attributes: true, attributeFilter: ['data-skin', 'data-theme-variant', 'style'] });
    this.#watchers.push(skin);

    const poster = this.#container.querySelector('media-poster');
    if (poster) {
      const watcher = new MutationObserver(() => this.#loadPoster());
      watcher.observe(poster, { attributes: true, subtree: true, attributeFilter: ['src', 'data-visible'] });
      this.#watchers.push(watcher);
    }

    this.#resize = new ResizeObserver(() => this.#layout());
    this.#resize.observe(this.#container);

    document.addEventListener('visibilitychange', this.#onVisibility);
    this.#adopt();
    this.#loadPoster();
    this.#sync();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.#raf);
    clearTimeout(this.#retry);
    this.#watchers.forEach((watcher) => watcher.disconnect());
    this.#watchers = [];
    this.#resize?.disconnect();
    document.removeEventListener('visibilitychange', this.#onVisibility);
    this.#unbindVideo();
    this.#renderer?.dispose?.();
  }

  // Picks up the container's current skin and tokens.
  #adopt() {
    if (!this.#container) return;
    const name = this.#container.dataset.skin ?? '';
    this.#tokens = readTokens(this.#container);

    if (name !== this.#skin) {
      this.#renderer?.dispose?.();
      this.#skin = name;
      this.#renderer = renderers.get(name) ?? null;
      this.#sample = null;
    }

    this.#layout();
  }

  #onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.#raf);
      this.#raf = 0;
      this.#progress = this.#target;
      this.#paint();
    }
  };

  #loadPoster() {
    const img = this.#container?.querySelector<HTMLImageElement>('media-poster img');
    const url = img?.currentSrc || img?.src || this.closest('video-player')?.getAttribute('poster') || '';
    if (!url || url === this.#posterUrl) return;

    this.#posterUrl = url;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      this.#poster = image;
      if (this.#target === 1 && !this.#wasStarted) this.#sampleWhenReady();
    };
    image.onerror = () => {
      this.#poster = null;
    };
    image.src = url;
  }

  #bindVideo(): HTMLVideoElement | null {
    const video = findVideo(this.#container);
    if (video === this.#video) return video;

    this.#unbindVideo();
    this.#video = video;
    for (const type of ['seeked', 'loadeddata', 'canplay']) video?.addEventListener(type, this.#onFrameChange);
    return video;
  }

  #unbindVideo() {
    for (const type of ['seeked', 'loadeddata', 'canplay']) this.#video?.removeEventListener(type, this.#onFrameChange);
    this.#video = null;
  }

  // Scrubbing while paused lands on a new frame, so it is rebuilt at once.
  #onFrameChange = () => {
    if (this.#target === 1 && this.#wasStarted) {
      this.#sampleWhenReady();
      this.#progress = 1;
      this.#paint();
    }
  };

  #sync() {
    const play = this.#container?.querySelector('media-play-button');
    if (!play) return;

    const started = play.hasAttribute('data-started');
    const showing = !started || play.hasAttribute('data-paused') || play.hasAttribute('data-ended');
    const next = showing ? 1 : 0;
    this.#wasStarted = started;

    if (next === this.#target) return;

    this.#target = next;
    this.#span = next === 1 ? (this.#renderer?.ms?.in ?? 900) : (this.#renderer?.ms?.out ?? 500);
    this.#container?.toggleAttribute('data-framed', showing);

    if (showing) {
      this.#bindVideo();
      this.#sampleWhenReady();
    }

    if (this.#motion.matches || document.hidden) {
      this.#progress = next;
      this.#paint();
      return;
    }

    this.#lastTick = performance.now();
    cancelAnimationFrame(this.#raf);
    this.#raf = requestAnimationFrame(this.#tick);
  }

  // A seek or a stalled decode can leave the frame unreadable at the instant of pausing, so try again briefly.
  #sampleWhenReady(attempt = 0) {
    clearTimeout(this.#retry);
    if (this.#capture() || attempt >= 12 || this.#target !== 1) {
      this.#paint();
      return;
    }
    this.#retry = window.setTimeout(() => this.#sampleWhenReady(attempt + 1), 160);
  }

  #layout() {
    const box = this.#container?.getBoundingClientRect();
    if (!box || box.width === 0) return;

    this.#dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.#box = { w: box.width, h: box.height };
    this.#canvas.width = Math.round(box.width * this.#dpr);
    this.#canvas.height = Math.round(box.height * this.#dpr);

    if (this.#target === 1) this.#sampleWhenReady();
    else this.#paint();
  }

  // Reads the current picture (the poster before play, the frame after) into the renderer's grid.
  #capture(): boolean {
    const renderer = this.#renderer;
    if (!renderer || !this.#box.w) return false;

    const { cols, rows } = renderer.grid(this.#box.w, this.#box.h);
    const video = this.#bindVideo();
    const useVideo = this.#wasStarted;
    const source: CanvasImageSource | null = useVideo ? video : this.#poster;
    const sw = useVideo ? (video?.videoWidth ?? 0) : (this.#poster?.naturalWidth ?? 0);
    const sh = useVideo ? (video?.videoHeight ?? 0) : (this.#poster?.naturalHeight ?? 0);

    if (!source || !sw || (useVideo && (video?.readyState ?? 0) < 2)) return false;

    const fit = Math.min(cols / sw, rows / sh);
    const w = sw * fit;
    const h = sh * fit;
    const rect = { x: (cols - w) / 2, y: (rows - h) / 2, w, h };

    this.#sampler.width = cols;
    this.#sampler.height = rows;

    try {
      this.#samplerCtx.clearRect(0, 0, cols, rows);
      this.#samplerCtx.drawImage(source, rect.x, rect.y, w, h);
      const { data } = this.#samplerCtx.getImageData(0, 0, cols, rows);
      this.#sample = { data, cols, rows, rect, readable: true };
    } catch {
      // Cross-origin and unreadable: hand the renderer an empty sample so it can draw its fallback.
      this.#sample = { data: new Uint8ClampedArray(cols * rows * 4), cols, rows, rect, readable: false };
    }

    renderer.prepare(this.#sample, this.#tokens);
    return true;
  }

  #tick = (now: number) => {
    const elapsed = now - this.#lastTick;
    this.#lastTick = now;

    const step = elapsed / this.#span;
    this.#progress = this.#target === 1 ? Math.min(1, this.#progress + step) : Math.max(0, this.#progress - step);
    this.#paint();

    if (this.#progress !== this.#target && !document.hidden) {
      this.#raf = requestAnimationFrame(this.#tick);
    } else {
      this.#raf = 0;
      this.#progress = this.#target;
      this.#paint();
    }
  };

  #paint() {
    const ctx = this.#ctx;
    const { width, height } = this.#canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);

    if (this.#progress <= 0 || !this.#renderer || !this.#sample) return;
    this.#renderer.paint(ctx, { w: width, h: height, dpr: this.#dpr }, this.#progress, this.#tokens);
  }
}

if (!customElements.get('media-frame')) customElements.define('media-frame', MediaFrame);
