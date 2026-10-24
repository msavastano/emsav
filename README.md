# emsav

The emSav website: a one-page portfolio for five small AI apps, built from the "Marionette Room Hero" design.

- **Hero**: a sunlit farmhouse room with a carved marionette. Drag any of the upper strings (head, shoulders, hands) and the puppet moves with spring physics, then settles back. Works with mouse, pen and touch.
- **The work**: five cards, each linking to a live app. Cards rise in as they scroll into view, and the hero dims as the panel slides over it.

It is a plain static site with no build step and no dependencies.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The page and all copy |
| `styles.css` | Layout, colors and type |
| `main.js` | Marionette physics, scroll fade and card reveal |
| `assets/room.webp` | Hero photo (1920×1080) |
| `assets/marionette/*.webp` | The seven puppet parts |
| `favicon.svg` | Tab icon |

## Run locally

Serve the folder with any static server, for example:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` straight from disk also works.

## Deploy

Any static host works with the repo root as the site root and no build command: Vercel, Netlify, Cloudflare Pages or GitHub Pages.

## Editing

- **Copy** lives in `index.html`.
- **Colors** are CSS variables at the top of `styles.css`.
- **Puppet pose and string placement** are the `G`, `PT`, `J` and `strings` values near the top of `main.js`. They are in the puppet's source-image pixels, so change them together with the part images.
- Motion respects the visitor's reduced-motion setting: the card reveal and hover animations turn off.
