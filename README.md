# emsav

The emSav website: a one-page portfolio for six small AI apps, built from the "Marionette Room Hero" design.

- **Hero**: a sunlit farmhouse room with a carved marionette. Drag any of the upper strings (head, shoulders, hands) and the puppet moves with spring physics, then settles back. The strings tie onto a wooden control bar hanging above the puppet; drag the bar left or right and the puppet walks after it, a step at a time, up to four steps each way. It stops short of the screen edge and, on wide screens, of the headline. Works with mouse, pen and touch.
- **The work**: six cards, each linking to a live app. Cards rise in as they scroll into view, and the hero dims as the panel slides over it.
- **Design, About, Booking and Quote**: placeholder sections the nav links and "Get a quote" button scroll to. Their copy is a first draft, and the booking calendar and quote form are marked "coming soon" until the real ones exist.

It is a plain static site with no build step and no dependencies.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The page and all copy |
| `styles.css` | Layout, colors and type |
| `main.js` | Marionette physics, scroll fade, card reveal and logo swing |
| `assets/room.webp` | Hero photo (1920×1080) |
| `assets/marionette/*.webp` | The seven puppet parts |
| `favicon.svg` | Tab icon: the hanging m on its own |

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
- **Logo** is the inline SVG in the header's `.brand` link: the emSav wordmark with its m hanging from a marionette control bar by three strings. The letters are Schibsted Grotesk Bold outlines, colored by `currentColor`. Pointing at it swings the m once (`setupBrand` in `main.js`), except with reduced motion.
- **Colors** are CSS variables at the top of `styles.css`.
- **Puppet pose and string placement** are the `G`, `PT`, `J` and `strings` values near the top of `main.js`. They are in the puppet's source-image pixels, so change them together with the part images.
- **Walking** is tuned by `STEP`, `MAX_STEPS` and `STEP_TIME` near the top of `main.js`. The control bar's shape is in `index.html`; where each string ties on is the `b` value in `strings`.
- Motion respects the visitor's reduced-motion setting: the card reveal and hover animations turn off.
