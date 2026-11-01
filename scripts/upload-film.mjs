#!/usr/bin/env node
// Uploads one film to Vercel Blob, adds it to films/films.json and rebuilds the films pages.
//
//   node scripts/upload-film.mjs --title "Paper Moon" --video ~/Films/paper-moon.mp4 --poster ~/Films/paper-moon.png
//
// Options:
//   --title          The film's title (required)
//   --video          The MP4 file, H.264 video with AAC audio (required)
//   --poster         The poster image, PNG or JPEG (required)
//   --slug           The page address, /films/<slug>/. Made from the title if left out
//   --description    One or two sentences for the page and for link previews
//   --contact-sheet  An image used for link previews (Open Graph) instead of the poster
//   --captions       A WebVTT (.vtt) captions file. Copied into the repo, not Blob
//   --captions-lang  The captions' language code (default: en)
//   --captions-label The captions' name in the player menu (default: English)
//   --date           The release date, YYYY-MM-DD (default: today)
//   --duration       Override the length read from the MP4, like 2:41
//   --dry-run        Check the files and show what would happen, without uploading
//
// Credentials: set BLOB_READ_WRITE_TOKEN, or put it in .env.local at the repo root
// (`vercel env pull` writes that file once the Blob store is connected to the project).

import { closeSync, copyFileSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { CONFIG_PATH, FILMS_DIR, ROOT, build, formatDuration, readConfig } from './build-films.mjs';

const MB = 1024 * 1024;

// ---------- Reading the MP4 ----------

// Walks the MP4's boxes to find its length, its codecs, and whether it can start playing
// before it has fully downloaded ("faststart": the index box, moov, comes before the media, mdat).
export function inspectMp4(file) {
  const fd = openSync(file, 'r');
  const size = statSync(file).size;
  const header = Buffer.alloc(16);
  const top = [];
  let moov = null;
  try {
    let pos = 0;
    while (pos + 8 <= size) {
      readSync(fd, header, 0, 16, pos);
      let boxSize = header.readUInt32BE(0);
      const type = header.toString('latin1', 4, 8);
      let headerSize = 8;
      if (boxSize === 1) { boxSize = Number(header.readBigUInt64BE(8)); headerSize = 16; }
      else if (boxSize === 0) boxSize = size - pos;
      if (boxSize < headerSize) throw new Error(`${file} doesn't look like an MP4 (bad box at byte ${pos})`);
      top.push(type);
      if (type === 'moov') {
        if (boxSize > 256 * MB) throw new Error('The MP4 index (moov) is unexpectedly large');
        moov = Buffer.alloc(boxSize - headerSize);
        readSync(fd, moov, 0, moov.length, pos + headerSize);
      }
      pos += boxSize;
    }
  } finally {
    closeSync(fd);
  }
  if (top[0] !== 'ftyp') throw new Error(`${file} doesn't look like an MP4 (it should start with an ftyp box)`);
  if (!moov) throw new Error(`${file} has no moov box, so it isn't a playable MP4`);

  const info = { size, faststart: top.indexOf('moov') < top.indexOf('mdat') || top.indexOf('mdat') === -1, duration: null, video: null, audio: null };
  const mvhd = child(moov, 'mvhd');
  if (mvhd) {
    const v = mvhd[0];
    const timescale = v === 1 ? mvhd.readUInt32BE(20) : mvhd.readUInt32BE(12);
    const duration = v === 1 ? Number(mvhd.readBigUInt64BE(24)) : mvhd.readUInt32BE(16);
    if (timescale) info.duration = duration / timescale;
  }
  for (const trak of children(moov, 'trak')) {
    const mdia = child(trak, 'mdia');
    const hdlr = mdia && child(mdia, 'hdlr');
    const stsd = mdia && path(mdia, ['minf', 'stbl', 'stsd']);
    if (!hdlr || !stsd || stsd.length < 16) continue;
    const kind = hdlr.toString('latin1', 8, 12);
    const codec = stsd.toString('latin1', 12, 16);
    if (kind === 'vide' && !info.video) info.video = codec;
    if (kind === 'soun' && !info.audio) info.audio = codec;
  }
  return info;
}

function* boxes(buf) {
  let pos = 0;
  while (pos + 8 <= buf.length) {
    let size = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    let head = 8;
    if (size === 1) { size = Number(buf.readBigUInt64BE(pos + 8)); head = 16; }
    else if (size === 0) size = buf.length - pos;
    if (size < head || pos + size > buf.length) return;
    yield { type, body: buf.subarray(pos + head, pos + size) };
    pos += size;
  }
}
function children(buf, type) { return [...boxes(buf)].filter((b) => b.type === type).map((b) => b.body); }
function child(buf, type) { return children(buf, type)[0] || null; }
function path(buf, types) { return types.reduce((b, t) => b && child(b, t), buf); }

// ---------- Helpers ----------

export function slugify(title) {
  return title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function loadEnv() {
  for (const file of [join(ROOT, '.env.local'), join(ROOT, '.env')]) {
    if (existsSync(file) && typeof process.loadEnvFile === 'function') {
      try { process.loadEnvFile(file); } catch { /* ignore a file Node can't read */ }
    }
  }
}

function home(p) { return p && p.startsWith('~/') ? join(process.env.HOME || '', p.slice(2)) : p; }

function needFile(p, label, exts) {
  if (!p) fail(`Missing --${label}. Run with no options to see them all.`);
  const file = resolve(home(p));
  if (!existsSync(file)) fail(`--${label}: ${file} doesn't exist`);
  if (exts && !exts.includes(extname(file).toLowerCase())) fail(`--${label} must be a ${exts.join(' or ')} file`);
  return file;
}

async function upload(pathname, file, contentType) {
  const { put } = await import('@vercel/blob').catch(() => fail('The Blob package is missing. Run this first:\n  npm install --prefix scripts'));
  const size = statSync(file).size;
  let last = -1;
  const blob = await put(pathname, createReadStream(file), {
    access: 'public',
    contentType,
    // A fresh URL for every upload, so a re-upload never shows a stale cached copy.
    addRandomSuffix: true,
    multipart: size > 8 * MB,
    onUploadProgress: ({ percentage }) => {
      const pct = Math.floor(percentage / 10) * 10;
      if (pct !== last) { last = pct; process.stdout.write(`  ${pathname}: ${pct}%\r`); }
    },
  });
  process.stdout.write(`  ${pathname}: done   \n`);
  return blob.url;
}

// ---------- Main ----------

async function main() {
  const { values: o } = parseArgs({
    options: {
      title: { type: 'string' },
      video: { type: 'string' },
      poster: { type: 'string' },
      slug: { type: 'string' },
      description: { type: 'string' },
      'contact-sheet': { type: 'string' },
      captions: { type: 'string' },
      'captions-lang': { type: 'string', default: 'en' },
      'captions-label': { type: 'string', default: 'English' },
      date: { type: 'string' },
      duration: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (o.help || !o.title) {
    const lines = readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1);
    console.log(lines.slice(0, lines.findIndex((l) => !l.startsWith('//'))).map((l) => l.slice(3)).join('\n'));
    process.exit(o.help ? 0 : 1);
  }

  const video = needFile(o.video, 'video', ['.mp4']);
  const poster = needFile(o.poster, 'poster', ['.png', '.jpg', '.jpeg', '.webp']);
  const sheet = o['contact-sheet'] ? needFile(o['contact-sheet'], 'contact-sheet', ['.png', '.jpg', '.jpeg', '.webp']) : null;
  const captions = o.captions ? needFile(o.captions, 'captions', ['.vtt']) : null;
  const slug = o.slug || slugify(o.title);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(`--slug "${slug}" must be lowercase words joined by dashes`);
  const date = o.date || new Date().toISOString().slice(0, 10);

  // Check the film before spending time on the upload.
  let info;
  try { info = inspectMp4(video); } catch (e) { fail(e.message); }
  console.log(`\n${o.title} (${slug})`);
  console.log(`  ${(info.size / MB).toFixed(1)} MB, video ${info.video || 'none'}, audio ${info.audio || 'none'}, ${info.duration ? formatDuration(info.duration) : 'unknown length'}`);
  if (!info.video) fail('That MP4 has no video track.');
  if (!['avc1', 'avc3'].includes(info.video)) console.log(`  warning: the video is ${info.video}, not H.264 (avc1), so some browsers won't play it. Re-export as H.264.`);
  if (info.audio && info.audio !== 'mp4a') console.log(`  warning: the audio is ${info.audio}, not AAC (mp4a), so some browsers won't play it.`);
  if (!info.audio) console.log('  note: no audio track.');
  if (!info.faststart) {
    console.log('  warning: this MP4 keeps its index at the end, so playback waits longer to start. Fix it without re-encoding:');
    console.log(`    ffmpeg -i "${video}" -c copy -movflags +faststart "${video.replace(/\.mp4$/i, '-faststart.mp4')}"`);
  }
  if (info.size > 200 * MB) console.log('  note: that is a large file for the web; 20 to 50 MB is a good target.');
  if (captions && !readFileSync(captions, 'utf8').replace(/^\uFEFF/, '').startsWith('WEBVTT')) fail('--captions must be a WebVTT file (it should start with WEBVTT)');

  const duration = o.duration || (info.duration ? formatDuration(info.duration) : null);
  if (!duration) fail('Couldn\'t read the film\'s length. Pass it with --duration, like --duration 2:41');

  const config = readConfig();
  const existing = config.films.find((f) => f.slug === slug);

  if (o['dry-run']) {
    console.log(`\nDry run: would upload to films/${slug}/ in Blob, ${existing ? 'replace' : 'add'} the "${slug}" entry in films/films.json and rebuild the pages.\n`);
    return;
  }

  loadEnv();
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
    fail('No Blob credentials. Set BLOB_READ_WRITE_TOKEN (Vercel: Storage, your Blob store, .env.local tab),\nor run `vercel env pull .env.local` at the repo root once the store is connected to the project.');
  }

  console.log('\nUploading to Vercel Blob…');
  const ext = (f) => extname(f).toLowerCase();
  const type = (f) => ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' })[ext(f)];
  let videoUrl, posterUrl, sheetUrl;
  try {
    videoUrl = await upload(`films/${slug}/${slug}.mp4`, video, 'video/mp4');
    posterUrl = await upload(`films/${slug}/poster${ext(poster)}`, poster, type(poster));
    if (sheet) sheetUrl = await upload(`films/${slug}/contact-sheet${ext(sheet)}`, sheet, type(sheet));
  } catch (e) {
    fail(`Upload failed: ${e.message}`);
  }

  // Captions stay on the site, next to the film's page, so the browser can load them without CORS.
  let captionsEntry = existing && existing.captions;
  if (captions) {
    const name = `captions.${o['captions-lang']}.vtt`;
    mkdirSync(join(FILMS_DIR, slug), { recursive: true });
    copyFileSync(captions, join(FILMS_DIR, slug, name));
    captionsEntry = [{ src: `/films/${slug}/${name}`, srclang: o['captions-lang'], label: o['captions-label'] }];
  }

  const film = {
    title: o.title,
    slug,
    video: videoUrl,
    poster: posterUrl,
    duration,
    ...(o.description || (existing && existing.description) ? { description: o.description || existing.description } : {}),
    ...(sheetUrl || (existing && existing.ogImage) ? { ogImage: sheetUrl || existing.ogImage } : {}),
    ...(captionsEntry ? { captions: captionsEntry } : {}),
    date: (existing && existing.date && !o.date) ? existing.date : date,
  };
  if (existing) config.films[config.films.indexOf(existing)] = film;
  else config.films.push(film);
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  console.log(`\n${existing ? 'Updated' : 'Added'} "${slug}" in films/films.json`);

  build();
  if (existing) console.log('\nThe old upload is still in Blob. Delete it in the Vercel dashboard (Storage, Browser) if you no longer need it.');
  console.log(`\nNext: commit and push the films folder. The film's page will be /films/${slug}/\n`);
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch((e) => fail(e.code === 'FILMS_CONFIG' ? e.message : (e.stack || String(e))));
}
