/** Finds the playing <video>, including inside a media element's shadow root. */
export function findVideo(root: ParentNode | null): HTMLVideoElement | null {
  if (!root) return null;

  const direct = root.querySelector('video');
  if (direct) return direct;

  for (const el of root.querySelectorAll('*')) {
    const inner = el.shadowRoot?.querySelector('video');
    if (inner) return inner;
  }

  return null;
}

/** The custom properties a skin may set for the engine and its effects. */
export const TOKEN_NAMES = [
  '--k-accent',
  '--k-accent-ink',
  '--k-panel',
  '--k-fg',
  '--k-c1',
  '--k-c2',
  '--k-c3',
  '--k-c4',
  '--k-c5',
  '--k-paper',
  '--k-ink',
] as const;

export function readTokens(el: HTMLElement): Record<string, string> {
  const style = getComputedStyle(el);
  const out: Record<string, string> = {};
  for (const name of TOKEN_NAMES) out[name] = style.getPropertyValue(name).trim();
  return out;
}

export const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
