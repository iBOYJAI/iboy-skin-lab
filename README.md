# iBOY Skin Lab

Seven [Video.js v10](https://videojs.org) skins from [iBOY Innovation Hub](https://www.iboyhub.com), each a different world. Pause the film and the frame is rebuilt in the skin's own material; the seek bar is drawn from the sound you have heard.

| Skin | Style | The paused frame | The seek bar |
| --- | --- | --- | --- |
| `pinart` | 3D | a pin-art toy of steel pins pushed up by brightness, lit from the top left | a row of pins the sound pushes up |
| `riso` | 2D | a two-ink print, pink and blue halftone plates printed out of register | a bar chart in the same two inks |
| `cel` | cartoon | a comic panel: flat tones, thick ink outlines, speed lines | a bouncing rope with a mascot that hops along it |
| `ledger` | web3 | tiles with the real SHA-256 of the sampled pixels as the frame's token | a chain of blocks, tall where it was loud |
| `origami` | paper | folded paper facets that flip open | an accordion fold, with a paper plane as the playhead |
| `tui` | text tech | ASCII art decrypting out of noise, plus a live event console | block characters sized by the sound, an amber cursor |
| `cortex` | future, AI | colour regions found by clustering and boxed, labelled with measured colour and share | fine ticks, one crosshair |

Cortex measures colour regions only. It does not recognise or name anything, and says so on screen. Ledger touches no blockchain.

## How it works

One small engine, one skin per stylesheet of tokens and a short renderer.

- `src/engine/frame.ts`: `<media-frame>` samples the poster or the paused frame into a grid and hands it to the skin's renderer. It owns timing, the poster and the lifecycle. The canvas loop runs only during a transition and never while the page is hidden.
- `src/engine/rail.ts`: `<media-rail>` samples loudness against position and hands it to the skin's seek-bar painter. The audio is read from a captured copy of the stream and never routed to the speakers; browsers without `captureStream`, or media without CORS headers, get an even bar.
- `src/video/structure.css`: the layout, sizes, states and accessibility every skin shares, driven by `--k-*` custom properties.
- `src/skins/<name>.ts` and `<name>.css`: the skin.

Switch skins with `data-skin` on the player container.

## Accessibility

Controls sit on a solid panel in every skin. Keyboard order matches the layout, focus rings are thick and always visible, buttons are 44px on touch screens (never below 40px elsewhere), forced-colors and high-contrast modes swap each material for system colours, and reduced motion removes transitions, bouncing and hopping. I checked keyboard order, focus and layout by hand; an automated axe run was not completed.

## Run it

```bash
npm install
npm run dev
```

The public page is `apps/preview/index.html`; the Video.js workbench is `/workbench.html`; the bare player is `/preview.html`.

Query options: `?theme=pinart|riso|cel|ledger|origami|tui|cortex`, `?footage=sample|bright|dark|vertical`, `?id=<mux playback id>`.

## Licence

Apache 2.0 (see `LICENSE` and `NOTICE`). Fonts are used under the SIL Open Font License 1.1. Footage: the Mux sample film, and iBOY's own clips in `apps/preview/public/media`.
