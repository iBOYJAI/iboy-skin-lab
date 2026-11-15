import '@videojs/html/video/player';
import '@videojs/html/media/mux-video';
import '@/video/skin';
import skinTemplate from '@/video/skin.html?raw';

// What the preview plays. Add your own entry below, or set ?id=<mux playback id> in the URL for a one-off.

export type Footage =
  | { kind: 'mux'; id: string; label: string; posterTime?: number; chapters?: string }
  | { kind: 'file'; src: string; poster: string; label: string };

const SAMPLE_PLAYBACK_ID = '83EzHOvVzVN01AsrD01BCpiH02Pj3S8mfzBOu101w2nHC5s';

export const FOOTAGE: Record<string, Footage> = {
  // Mux's sample film: mixed light, real soundtrack, with chapters.
  sample: { kind: 'mux', id: SAMPLE_PLAYBACK_ID, label: 'Mixed light, with sound', posterTime: 69, chapters: './cosmic-dawn-chapters.vtt' },
  // iBOY's own footage, hosted next to the page so the dot dissolve can always read the frame.
  bright: { kind: 'file', src: './media/iboy-hero-bright.mp4', poster: './media/iboy-hero-bright.jpg', label: 'Bright footage' },
  dark: { kind: 'file', src: './media/iboy-dark.mp4', poster: './media/iboy-dark.jpg', label: 'Dark footage' },
  vertical: { kind: 'file', src: './media/iboy-vertical.mp4', poster: './media/iboy-vertical.jpg', label: 'Vertical' },
};

export const THEMES = ['pinart', 'riso', 'cel', 'ledger', 'origami', 'tui', 'cortex'] as const;
export type Theme = (typeof THEMES)[number];

const MEDIA_PLACEHOLDER = '<!-- Add a compatible media component here. -->';

/** Reads ?footage=<key>, ?id=<mux playback id> and ?theme=<name>, ignoring anything that does not validate. */
export function optionsFromUrl(): { footage: Footage; theme: Theme } {
  const params = new URLSearchParams(window.location.search);

  const id = params.get('id');
  // Playback IDs are letters and digits only; anything else is ignored rather than put in a URL.
  const custom: Footage | null =
    id && /^[A-Za-z0-9]{10,80}$/.test(id) ? { kind: 'mux', id, label: 'Your video' } : null;

  const key = params.get('footage') ?? '';
  const footage = custom ?? FOOTAGE[key] ?? FOOTAGE.sample;

  const theme = THEMES.find((name) => name === params.get('theme')) ?? 'pinart';
  return { footage, theme };
}

export function createPlayer(footage: Footage = optionsFromUrl().footage, theme: Theme = optionsFromUrl().theme): HTMLElement {
  const player = document.createElement('video-player');

  let media: string;
  if (footage.kind === 'mux') {
    const time = footage.posterTime ? `?time=${footage.posterTime}` : '';
    player.setAttribute('poster', `https://image.mux.com/${footage.id}/thumbnail.webp${time}`);
    const chapters = footage.chapters
      ? `<track kind="chapters" label="English" srclang="en" src="${footage.chapters}" default>`
      : '';
    media = `<mux-video src="https://stream.mux.com/${footage.id}.m3u8" playsinline crossorigin>${chapters}</mux-video>`;
  } else {
    player.setAttribute('poster', footage.poster);
    media = `<video src="${footage.src}" playsinline crossorigin="anonymous" preload="metadata"></video>`;
  }

  player.innerHTML = skinTemplate
    .replace(MEDIA_PLACEHOLDER, media)
    .replace('data-preset="video"', `data-preset="video" data-skin="${theme}"`);

  return player;
}
