#!/usr/bin/env node
// TV Movies server: streams video files from folders on this computer to the
// Android TV app over the home network, and remembers what was watched.
// No dependencies — only Node.js (v18+) is required.
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const dgram = require('dgram');
const { spawn } = require('child_process');

const DISCOVERY_PORT = 8766;
const DISCOVERY_MESSAGE = 'TVMOVIES_DISCOVER';
const VIDEO_TYPES = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mkv': 'video/x-matroska',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t', '.m2ts': 'video/mp2t', '.wmv': 'video/x-ms-wmv',
};
const IMAGE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const FOLDER_POSTERS = ['poster', 'folder', 'cover'];
const WATCHED_RATIO = 0.92; // past this point a movie counts as watched

// ---------- configuration ----------

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  let config = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  const args = process.argv.slice(2);
  const folders = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') config.port = Number(args[++i]);
    else if (args[i] === '--name') config.name = args[++i];
    else folders.push(args[i]);
  }
  if (folders.length) config.folders = folders;
  config.port = config.port || Number(process.env.PORT) || 8765;
  config.name = config.name || os.hostname();
  config.dataDir = config.dataDir || path.join(__dirname, 'data');
  config.folders = (config.folders || []).map((f) => path.resolve(f));
  return config;
}

const config = loadConfig();
if (!config.folders.length) {
  console.log('Usage: node server.js "D:\\Movies" ["E:\\More movies" ...] [--port 8765]');
  console.log('   or: create config.json next to server.js (see config.example.json)');
  process.exit(1);
}
for (const f of config.folders) {
  if (!fs.existsSync(f)) console.warn(`Warning: folder not found: ${f}`);
}
fs.mkdirSync(path.join(config.dataDir, 'thumbs'), { recursive: true });

// ---------- watched state ----------

const statePath = path.join(config.dataDir, 'state.json');
let state = {};
try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { state = {}; }
let saveTimer = null;

function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = statePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, statePath);
  }, 300);
}

// State is keyed by path relative to its library folder, so moving the whole
// library to another drive keeps the history.
function stateFor(movie) {
  return state[movie.key] || { watched: false, position: 0, duration: 0, updatedAt: 0 };
}

// ---------- library scan ----------

let library = { movies: [], byId: new Map(), scannedAt: 0 };

function cleanTitle(fileName) {
  let name = fileName.replace(/\.[^.]+$/, '');
  let year = null;
  const yearMatch = name.match(/^(.*?)[\s._\-(\[]+((?:19|20)\d{2})(?:[\s._\-)\]]|$)/);
  if (yearMatch && yearMatch[1].length > 0) {
    name = yearMatch[1];
    year = Number(yearMatch[2]);
  } else {
    // Drop typical release tags even without a year.
    name = name.replace(/[\s._\-]+(1080p|720p|2160p|4k|bluray|brrip|web-?dl|webrip|hdtv|x264|x265|hevc|dvdrip).*$/i, '');
  }
  name = name.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { title: name || fileName, year };
}

async function walk(dir, out) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (VIDEO_TYPES[path.extname(e.name).toLowerCase()]) out.push(full);
  }
}

function findSidecar(file, exts, preferSuffixes) {
  const dir = path.dirname(file);
  const base = path.basename(file, path.extname(file));
  let names;
  try { names = fs.readdirSync(dir); } catch { return null; }
  const candidates = names.filter((n) => {
    const lower = n.toLowerCase();
    return lower.startsWith(base.toLowerCase()) && exts.includes(path.extname(lower));
  });
  for (const suffix of preferSuffixes) {
    const hit = candidates.find((n) => n.toLowerCase().includes(suffix));
    if (hit) return path.join(dir, hit);
  }
  return candidates.length ? path.join(dir, candidates[0]) : null;
}

function findPoster(file, root) {
  const own = findSidecar(file, Object.keys(IMAGE_TYPES), []);
  if (own) return own;
  const dir = path.dirname(file);
  if (dir === root) return null; // a poster.jpg at the root would apply to every movie
  for (const n of FOLDER_POSTERS) {
    for (const ext of Object.keys(IMAGE_TYPES)) {
      const p = path.join(dir, n + ext);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

async function scan() {
  const movies = [];
  for (const root of config.folders) {
    const files = [];
    await walk(root, files);
    for (const file of files) {
      const rel = path.relative(root, file);
      const key = `${path.basename(root)}/${rel.split(path.sep).join('/')}`;
      const id = crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
      const relDir = path.dirname(rel);
      const stat = await fsp.stat(file).catch(() => null);
      if (!stat) continue;
      const { title, year } = cleanTitle(path.basename(file));
      movies.push({
        id, key, file, root, title, year,
        folder: relDir === '.' ? '' : relDir.split(path.sep).join(' / '),
        size: stat.size,
        addedAt: stat.mtimeMs,
        poster: findPoster(file, root),
        subtitles: findSidecar(file, ['.srt', '.vtt'], ['.he.', '.heb', 'hebrew', '.iw.']),
      });
    }
  }
  movies.sort((a, b) => a.title.localeCompare(b.title, 'he'));
  library = { movies, byId: new Map(movies.map((m) => [m.id, m])), scannedAt: Date.now() };
  return library;
}

async function getLibrary(force) {
  if (force || Date.now() - library.scannedAt > 30_000) await scan();
  return library;
}

function publicMovie(m) {
  const s = stateFor(m);
  return {
    id: m.id, title: m.title, year: m.year, folder: m.folder, size: m.size, addedAt: m.addedAt,
    container: path.extname(m.file).slice(1).toLowerCase(),
    hasSubtitles: !!m.subtitles,
    subtitleFormat: m.subtitles ? path.extname(m.subtitles).slice(1).toLowerCase() : null,
    watched: !!s.watched, position: s.position || 0, duration: s.duration || 0,
    updatedAt: s.updatedAt || 0, watchedAt: s.watchedAt || null,
  };
}

// ---------- thumbnails (optional, needs ffmpeg) ----------

let ffmpegAvailable = null;
const thumbJobs = new Map();

function hasFfmpeg() {
  if (ffmpegAvailable !== null) return Promise.resolve(ffmpegAvailable);
  return new Promise((resolve) => {
    const p = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    p.on('error', () => resolve((ffmpegAvailable = false)));
    p.on('exit', (code) => resolve((ffmpegAvailable = code === 0)));
  });
}

function makeThumb(movie) {
  const out = path.join(config.dataDir, 'thumbs', movie.id + '.jpg');
  if (fs.existsSync(out)) return Promise.resolve(out);
  if (thumbJobs.has(movie.id)) return thumbJobs.get(movie.id);
  const job = hasFfmpeg().then((ok) => {
    if (!ok) return null;
    return new Promise((resolve) => {
      // Seek ~5 minutes in (or less for short clips) and grab one frame.
      const p = spawn('ffmpeg', ['-y', '-ss', '300', '-i', movie.file, '-frames:v', '1',
        '-vf', 'scale=480:-2', '-q:v', '4', out], { stdio: 'ignore' });
      p.on('error', () => resolve(null));
      p.on('exit', () => {
        if (fs.existsSync(out)) return resolve(out);
        const retry = spawn('ffmpeg', ['-y', '-i', movie.file, '-frames:v', '1', '-vf', 'scale=480:-2', out], { stdio: 'ignore' });
        retry.on('error', () => resolve(null));
        retry.on('exit', () => resolve(fs.existsSync(out) ? out : null));
      });
    });
  }).finally(() => thumbJobs.delete(movie.id));
  thumbJobs.set(movie.id, job);
  return job;
}

// ---------- HTTP ----------

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function sendFile(req, res, file, contentType) {
  fs.stat(file, (err, stat) => {
    if (err) return sendJson(res, 404, { error: 'not found' });
    const total = stat.size;
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    const headers = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes' };
    let start = 0, end = total - 1, status = 200;
    if (range) {
      if (range[1] === '') { start = Math.max(0, total - Number(range[2])); }
      else { start = Number(range[1]); if (range[2] !== '') end = Math.min(Number(range[2]), total - 1); }
      if (start >= total || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` });
        return res.end();
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file, { start, end });
    stream.pipe(res);
    res.on('close', () => stream.destroy());
  });
}

// Hebrew .srt files are often saved as Windows-1255; the player expects UTF-8.
function readSubtitlesUtf8(file) {
  let buf = fs.readFileSync(file);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) buf = buf.subarray(3);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { /* not UTF-8 */ }
  try { return new TextDecoder('windows-1255').decode(buf); } catch { return buf.toString('latin1'); }
}

const routes = [
  ['GET', /^\/api\/info$/, async (req, res) => {
    sendJson(res, 200, { name: config.name, app: 'tv-movies', version: 1 });
  }],
  ['GET', /^\/api\/movies$/, async (req, res, m, url) => {
    const lib = await getLibrary(url.searchParams.get('refresh') === '1');
    sendJson(res, 200, { name: config.name, movies: lib.movies.map(publicMovie) });
  }],
  ['POST', /^\/api\/movies\/([0-9a-f]+)\/progress$/, async (req, res, m) => {
    const movie = (await getLibrary()).byId.get(m[1]);
    if (!movie) return sendJson(res, 404, { error: 'not found' });
    const body = await readBody(req);
    const s = { ...stateFor(movie) };
    s.position = Math.max(0, Math.round(Number(body.position) || 0));
    if (Number(body.duration) > 0) s.duration = Math.round(Number(body.duration));
    s.updatedAt = Date.now();
    if (s.duration > 0 && s.position / s.duration >= WATCHED_RATIO) {
      s.watched = true; s.watchedAt = s.watchedAt || Date.now(); s.position = 0;
    }
    state[movie.key] = s; saveState();
    sendJson(res, 200, publicMovie(movie));
  }],
  ['POST', /^\/api\/movies\/([0-9a-f]+)\/watched$/, async (req, res, m) => {
    const movie = (await getLibrary()).byId.get(m[1]);
    if (!movie) return sendJson(res, 404, { error: 'not found' });
    const body = await readBody(req);
    const s = { ...stateFor(movie) };
    s.watched = body.watched !== false;
    s.watchedAt = s.watched ? Date.now() : null;
    s.position = 0;
    s.updatedAt = Date.now();
    state[movie.key] = s; saveState();
    sendJson(res, 200, publicMovie(movie));
  }],
  ['GET', /^\/stream\/([0-9a-f]+)$/, async (req, res, m) => {
    const movie = (await getLibrary()).byId.get(m[1]);
    if (!movie) return sendJson(res, 404, { error: 'not found' });
    sendFile(req, res, movie.file, VIDEO_TYPES[path.extname(movie.file).toLowerCase()]);
  }],
  ['GET', /^\/poster\/([0-9a-f]+)$/, async (req, res, m) => {
    const movie = (await getLibrary()).byId.get(m[1]);
    if (!movie) return sendJson(res, 404, { error: 'not found' });
    const file = movie.poster || await makeThumb(movie);
    if (!file) return sendJson(res, 404, { error: 'no poster' });
    res.setHeader('Cache-Control', 'max-age=86400');
    sendFile(req, res, file, IMAGE_TYPES[path.extname(file).toLowerCase()] || 'image/jpeg');
  }],
  ['GET', /^\/subtitles\/([0-9a-f]+)$/, async (req, res, m) => {
    const movie = (await getLibrary()).byId.get(m[1]);
    if (!movie || !movie.subtitles) return sendJson(res, 404, { error: 'no subtitles' });
    const text = readSubtitlesUtf8(movie.subtitles);
    const type = movie.subtitles.toLowerCase().endsWith('.vtt') ? 'text/vtt' : 'application/x-subrip';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Content-Length': Buffer.byteLength(text) });
    res.end(text);
  }],
  ['GET', /^\/$/, async (req, res) => {
    const lib = await getLibrary();
    const rows = lib.movies.map((mv) => {
      const s = publicMovie(mv);
      const status = s.watched ? '✓ נצפה' : s.position > 0 ? `באמצע (${Math.round(s.position / 60000)} דק')` : '';
      return `<tr><td>${escapeHtml(s.title)}${s.year ? ` (${s.year})` : ''}</td><td>${escapeHtml(s.folder)}</td><td>${status}</td></tr>`;
    }).join('');
    const html = `<!doctype html><html dir="rtl" lang="he"><meta charset="utf-8"><title>TV Movies</title>
<style>body{font-family:system-ui;background:#111;color:#eee;padding:16px}td{padding:4px 12px;border-bottom:1px solid #333}</style>
<h1>TV Movies — ${escapeHtml(config.name)}</h1><p>השרת פועל. כתובות לחיבור מהטלוויזיה: ${lanAddresses().map((a) => `<b>${a}:${config.port}</b>`).join(', ')}</p>
<p>${lib.movies.length} סרטים</p><table>${rows}</table></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }],
];

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  for (const [routeMethod, pattern, handler] of routes) {
    const m = routeMethod === method && pattern.exec(url.pathname);
    if (m) {
      try { await handler(req, res, m, url); } catch (e) {
        console.error(e);
        if (!res.headersSent) sendJson(res, 500, { error: String(e.message || e) });
      }
      return;
    }
  }
  sendJson(res, 404, { error: 'not found' });
});

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
}

// ---------- discovery: lets the TV app find this computer automatically ----------

const discovery = dgram.createSocket({ type: 'udp4', reuseAddr: true });
discovery.on('message', (msg, rinfo) => {
  if (msg.toString().trim() !== DISCOVERY_MESSAGE) return;
  const reply = Buffer.from(JSON.stringify({ app: 'tv-movies', name: config.name, port: config.port }));
  discovery.send(reply, rinfo.port, rinfo.address);
});
discovery.on('error', (e) => console.warn(`Auto-discovery disabled (${e.message}). Enter the address manually on the TV.`));
discovery.bind(DISCOVERY_PORT);

scan().then((lib) => {
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`TV Movies server "${config.name}" — ${lib.movies.length} movies in:`);
    config.folders.forEach((f) => console.log(`  ${f}`));
    console.log('\nOn the TV app, choose this computer or type one of these addresses:');
    lanAddresses().forEach((a) => console.log(`  ${a}:${config.port}`));
    console.log(`\nWeb view: http://localhost:${config.port}/`);
  });
});
