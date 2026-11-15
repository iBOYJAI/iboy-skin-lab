import '@videojs/html/i18n';
import '@/skin.css';
import './showcase.css';
import { createPlayer, FOOTAGE, optionsFromUrl, THEMES, type Footage, type Theme } from '../frame/player';

// The public page. ?theme=pinart|riso|cel|ledger|origami|tui|cortex, ?footage=sample|bright|dark|vertical and
// ?id=<mux playback id> are honoured, so a link can open on any combination.

type Info = { name: string; tag: string; backdrop: string; frame: string; rail: string; controls: string; note?: string };

const INFO: Record<Theme, Info> = {
  pinart: {
    name: 'Pin Art',
    tag: '3D',
    backdrop: '#1a1c21',
    frame:
      'Pause, and the frame becomes a pin-art toy: a bed of steel pins, each pushed up by the brightness of the picture, lit from the top left so every raised pin throws a shadow.',
    rail: 'The seek bar is a row of pins. The sound pushes them up as it plays.',
    controls: 'Machined keys with real depth that sink when pressed, on a slab leaning toward you.',
  },
  riso: {
    name: 'Riso',
    tag: '2D',
    backdrop: '#e6dfc9',
    frame:
      'A two-ink print. The frame is split into a pink plate and a blue plate, each a halftone screen at its own angle, printed slightly out of register on cream paper.',
    rail: 'A bar chart printed in the same two inks, with a blue ghost beside each pink bar.',
    controls: 'Flat shapes with hard offset shadows that you press into.',
  },
  cel: {
    name: 'Cel',
    tag: 'CARTOON',
    backdrop: '#6ec3ee',
    frame:
      'The frame pops in as a comic panel: colours flattened to bold tones, thick ink wherever the picture changes sharply, and a burst of speed lines.',
    rail: 'A rope that bounces to the sound, with a small mascot who hops along it while the film plays.',
    controls: 'Buttons that squash and stretch, and speech-bubble tooltips.',
  },
  ledger: {
    name: 'Ledger',
    tag: 'WEB3',
    backdrop: '#0d0f0b',
    frame:
      'The frame is minted. It is cut into tiles, and the SHA-256 of the sampled pixels is printed as its token, so the hash on screen really is the hash of what you are looking at.',
    rail: 'A chain of blocks. Each block fills as it plays and is as tall as that moment was loud.',
    controls: 'Hairlines, square corners and one acid-lime accent.',
    note: 'Nothing here touches a blockchain.',
  },
  origami: {
    name: 'Origami',
    tag: 'PAPER',
    backdrop: '#d9cfbc',
    frame:
      'The frame is folded from paper: triangular facets, each one flat colour from the picture, flipping open like a fold being made.',
    rail: 'An accordion-folded strip whose peaks are as tall as the sound was loud, with a paper plane as the playhead.',
    controls: 'Folded paper keys, a kraft tag for the title and a dog-eared panel.',
  },
  tui: {
    name: 'TUI',
    tag: 'TEXT TECH',
    backdrop: '#141414',
    frame:
      'The frame is ASCII art, decrypting out of noise. A console in the corner prints every player event with its timestamp.',
    rail: 'A row of text: block characters sized by the sound heard so far, and an amber cursor for now.',
    controls: 'Bracketed words instead of icons.',
  },
  cortex: {
    name: 'Cortex',
    tag: 'FUTURE AND AI',
    backdrop: '#1b1e21',
    frame:
      'The picture is read the way a machine would read it: colour regions are found by clustering, the largest are boxed, and each box is labelled with what was measured, its colour and its share of the frame.',
    rail: 'Fine ticks whose height is the loudness heard, and one crosshair for the present.',
    controls: 'Hairline controls on a pale instrument panel.',
    note: 'It measures colour regions. It does not recognise or name anything, and says so on screen.',
  },
};

const initial = optionsFromUrl();
let footage: Footage = initial.footage;
let theme: Theme = initial.theme;

const host = document.getElementById('player')!;
const backdrop = document.getElementById('backdrop')!;
const notes = document.getElementById('notes')!;

function mount(target: HTMLElement, f: Footage, t: Theme) {
  target.replaceChildren();
  const i18n = document.createElement('media-i18n');
  i18n.append(createPlayer(f, t));
  target.append(i18n);
}

function describe(t: Theme) {
  const info = INFO[t];
  backdrop.style.setProperty('--backdrop', info.backdrop);

  const block = (label: string, text: string) => {
    const wrap = document.createElement('div');
    const l = document.createElement('p');
    l.className = 'label';
    l.textContent = label;
    const p = document.createElement('p');
    p.textContent = text;
    wrap.append(l, p);
    return wrap;
  };

  const head = document.createElement('h2');
  head.textContent = info.name;
  const tag = document.createElement('p');
  tag.className = 'label';
  tag.textContent = info.tag;
  const grid = document.createElement('div');
  grid.className = 'notes-grid';
  grid.append(block('THE FRAME', info.frame), block('THE SEEK BAR', info.rail), block('THE CONTROLS', info.controls));
  notes.replaceChildren(tag, head, grid);
  if (info.note) {
    const n = document.createElement('p');
    n.className = 'fine';
    n.textContent = info.note;
    notes.append(n);
  }
}

// ---- Skin tabs ------------------------------------------------------------------------------------------------------

const tabs = document.getElementById('skins')!;
function renderTabs() {
  tabs.replaceChildren(
    ...THEMES.map((name) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tab';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(name === theme));
      button.tabIndex = name === theme ? 0 : -1;
      const tag = document.createElement('span');
      tag.className = 'tab-tag';
      tag.textContent = INFO[name].tag;
      const label = document.createElement('span');
      label.className = 'tab-name';
      label.textContent = INFO[name].name;
      button.append(tag, label);
      button.addEventListener('click', () => choose(name));
      button.addEventListener('keydown', (event) => {
        const i = THEMES.indexOf(name);
        const next = event.key === 'ArrowRight' ? THEMES[(i + 1) % THEMES.length] : event.key === 'ArrowLeft' ? THEMES[(i + THEMES.length - 1) % THEMES.length] : null;
        if (next) {
          event.preventDefault();
          choose(next);
          (tabs.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus();
        }
      });
      return button;
    })
  );
}

function choose(name: Theme) {
  theme = name;
  // A skin is only tokens and a renderer, so it changes in place without reloading the film.
  for (const target of [host, ...document.querySelectorAll<HTMLElement>('.size-player')]) {
    target.querySelector<HTMLElement>('.media-skin')?.setAttribute('data-skin', name);
  }
  describe(name);
  renderTabs();
}

// ---- Footage chips --------------------------------------------------------------------------------------------------

const picks = document.getElementById('footage-picks')!;
const footageKeys = Object.keys(FOOTAGE);
function renderPicks() {
  picks.replaceChildren(
    ...footageKeys.map((key) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      button.setAttribute('aria-pressed', String(FOOTAGE[key] === footage));
      button.textContent = FOOTAGE[key].label;
      button.addEventListener('click', () => {
        footage = FOOTAGE[key];
        mount(host, footage, theme);
        renderPicks();
      });
      return button;
    })
  );
}

// ---- Go -------------------------------------------------------------------------------------------------------------

mount(host, footage, theme);
for (const id of ['size-tablet', 'size-phone']) mount(document.getElementById(id)!, FOOTAGE.bright, theme);
describe(theme);
renderTabs();
renderPicks();
