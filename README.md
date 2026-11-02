# emsav

The emSav website: a one-page portfolio for six small AI apps, built from the "Marionette Room Hero" design.

- **Hero**: a sunlit farmhouse room with a carved marionette. Drag any of the upper strings (head, shoulders, hands) and the puppet moves with spring physics, then settles back. The strings tie onto a wooden control bar hanging above the puppet; drag the bar left or right and the puppet walks after it, a step at a time, up to four steps each way. It stops short of the screen edge and, on wide screens, of the headline. Works with mouse, pen and touch.
- **The work**: six cards, each linking to a live app. Cards rise in as they scroll into view, and the hero dims as the panel slides over it.
- **Films** (`/films/`): motion graphics films in a grid, plus a page for each film. The MP4s live in Vercel Blob, not in this repo. See [Films](#films) below.
- **Design, About, Booking and Quote**: placeholder sections the nav links and "Get a quote" button scroll to. Their copy is a first draft, and the booking calendar and quote form are marked "coming soon" until the real ones exist.

It is a plain static site with no build step and no dependencies. The films pages are plain HTML too: a small script writes them from a config file, and the result is committed.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The page and all copy |
| `styles.css` | Layout, colors and type |
| `main.js` | Marionette physics, scroll fade, card reveal and logo swing |
| `assets/room.webp` | Hero photo (1920×1080) |
| `assets/marionette/*.webp` | The seven puppet parts |
| `favicon.svg` | Tab icon: the hanging m on its own |
| `film-player.js`, `film-player.css` | The video player used on the films pages |
| `films/films.json` | The list of films: title, slug, video URL, poster, length, and the models and tools used |
| `films/index.html`, `films/<slug>/index.html` | The films pages, written by `scripts/build-films.mjs`. Don't edit by hand |
| `scripts/` | The film upload and page-building scripts. Not deployed |

## Run locally

Serve the folder with any static server, for example:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` straight from disk also works for the home page; the films pages need a server.

## Deploy

Any static host works with the repo root as the site root and no build command: Vercel, Netlify, Cloudflare Pages or GitHub Pages.

Don't add a `public/` folder. On Vercel, a project with no framework serves `public/` instead of the repo root when that folder exists, which would take the whole site down. `.vercelignore` keeps `scripts/` and this README out of the deploy.

## Editing

- **Copy** lives in `index.html`.
- **Logo** is the inline SVG in the header's `.brand` link: the emSav wordmark with its m hanging from a marionette control bar by three strings. The letters are Schibsted Grotesk Bold outlines, colored by `currentColor`. Pointing at it swings the m once (`setupBrand` in `main.js`), except with reduced motion.
- **Colors** are CSS variables at the top of `styles.css`.
- **Puppet pose and string placement** are the `G`, `PT`, `J` and `strings` values near the top of `main.js`. They are in the puppet's source-image pixels, so change them together with the part images.
- **Walking** is tuned by `STEP`, `MAX_STEPS` and `STEP_TIME` near the top of `main.js`. The control bar's shape is in `index.html`; where each string ties on is the `b` value in `strings`.
- Motion respects the visitor's reduced-motion setting: the card reveal and hover animations turn off.

## Films

Each film is an MP4 (H.264 video, AAC audio) and a poster image, both stored in Vercel Blob so the repo and the deploys stay small. `films/films.json` lists them, and `scripts/build-films.mjs` turns that list into the films pages.

### The player

Each film is a native `<video>` with `controls`, `playsinline`, `preload="none"` and the poster. Nothing autoplays and the sound is on. `film-player.js` adds the rest:

- The poster shows one big play button. The native controls appear once the film starts, so there aren't two play buttons on the poster.
- Starting any film pauses every other video on the page.
- The play button is a real button, so Tab and Enter (or Space) start the film, and focus then moves to the video, where Space pauses it. The video and button are labeled with the film's title.
- If the MP4 can't load, the player says so.
- Without JavaScript it is a plain video with native controls.

The frame is a fixed 16:9 box with rounded corners, so nothing moves while the poster and film load.

### One-time setup: a Blob store

1. In Vercel, open your team's Storage page, choose Create, then **Blob**, and pick **Public** access. (Public matters: the browser loads the MP4 straight from its Blob URL.)
2. Connect the store to the **emsav** project. That adds a `BLOB_READ_WRITE_TOKEN` environment variable.
3. For the upload script, copy that token into `.env.local` at the repo root (`BLOB_READ_WRITE_TOKEN=...`), or run `vercel env pull .env.local`. `.env.local` is git-ignored.

From a terminal, `vercel link` then `vercel blob create-store emsav-films --access public --yes` does steps 1 and 2.

### Add a film with the script

```sh
npm install --prefix scripts      # once
node scripts/upload-film.mjs --title "Paper Moon" --video ~/Films/paper-moon.mp4 --poster ~/Films/paper-moon.png
```

The script checks the MP4 first (H.264 and AAC, whether it can start playing before it has fully downloaded, and its length), uploads the MP4 and poster to Blob under `films/<slug>/`, adds the film to `films/films.json` and rebuilds the pages. Then commit and push. Useful options:

- `--description "..."`: a sentence or two for the page and link previews
- `--contact-sheet sheet.png`: an image for link previews instead of the poster
- `--captions paper-moon.en.vtt`: a WebVTT captions file, copied into `films/<slug>/` (add `--captions-lang` and `--captions-label` for other languages)
- `--models "Opus 5.5, Lyria 3"` and `--tools "Blender, Claude Desktop Projects"`: what the film was made with, separated by commas
- `--dry-run`: check the files without uploading anything

Run `node scripts/upload-film.mjs --help` for the full list. If the script warns that the index is at the end of the MP4, fix it without re-encoding using the `ffmpeg ... -movflags +faststart` command it prints, then upload the fixed file.

### Add a film by hand

Upload the MP4 and poster in the Blob store's Browser tab in the Vercel dashboard, add an entry to `films/films.json`, then run `node scripts/build-films.mjs` (no install needed) and commit.

```json
{
  "title": "Paper Moon",
  "slug": "paper-moon",
  "video": "https://<store>.public.blob.vercel-storage.com/films/paper-moon/paper-moon-AbC123.mp4",
  "poster": "https://<store>.public.blob.vercel-storage.com/films/paper-moon/poster-AbC123.png",
  "duration": "2:41",
  "description": "Optional. One or two sentences.",
  "ogImage": "Optional. A contact sheet URL for link previews; the poster is used if this is left out.",
  "captions": [{ "src": "/films/paper-moon/captions.en.vtt", "srclang": "en", "label": "English" }],
  "models": ["Opus 5.5", "Lyria 3"],
  "tools": ["Blender", "Claude Desktop Projects"],
  "date": "2026-11-01"
}
```

`title`, `slug`, `video`, `poster` and `duration` are required. The slug becomes the page address, `/films/<slug>/`. Films appear in the order they're listed. `models` and `tools` are optional lists of names: each film's page shows them as tags under the title, and the films grid shows a smaller version under each film. Leave one out and that row doesn't appear. Captions must be files in this repo, not Blob URLs, so the browser can load them without extra CORS setup. The page heading and intro, and the site address used in share links (`siteUrl`), are at the top of `films/films.json`.

`node scripts/build-films.mjs --check` reports whether the committed pages match `films/films.json`.

### Link previews

Each film page has Open Graph and Twitter tags using the film's contact sheet (`ogImage`) or, failing that, its poster, plus a schema.org `VideoObject`. The films grid uses the first film's image. Share images work best at 1200×630 or larger, as PNG or JPEG.

Posters load straight from Blob. This isn't a Next.js site, so there's no `next/image`; with `preload="none"` the poster is the only file a film loads until someone presses play.
