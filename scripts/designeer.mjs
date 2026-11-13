#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const BASE = 'https://designeer.xyz';
const UA = 'designeer-skill/1.0 (+https://designeer.xyz/ai.txt)';

function resolveCacheDir() {
  const preferred = process.env.DESIGNEER_CACHE_DIR || path.join(os.homedir(), '.cache', 'designeer');
  try {
    fs.mkdirSync(preferred, { recursive: true });
    return preferred;
  } catch {
    return path.join(os.tmpdir(), 'designeer-skill-cache');
  }
}

const CACHE_DIR = resolveCacheDir();
const HTTP_DIR = path.join(CACHE_DIR, 'http');
const INDEX_FILE = path.join(CACHE_DIR, 'index.json');
const TTL = 7 * 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = Number(process.env.DESIGNEER_INTERVAL_MS || 1000);
const MAX_LIMIT = 20;

const COLLECTIONS = ['inspiration', 'resources', 'tools', 'portfolios'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastRequestAt = 0;
async function throttle() {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function request(url, headers = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await throttle();
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, ...headers }, redirect: 'follow' });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after')) * 1000;
        lastError = new Error(`${res.status} ${res.statusText} for ${url}`);
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1000 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (error) {
      lastError = error;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastError || new Error(`request failed: ${url}`);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function cachePath(url) {
  return path.join(HTTP_DIR, `${crypto.createHash('sha256').update(url).digest('hex')}.json`);
}

async function fetchText(url, { accept, force = false } = {}) {
  const file = cachePath(url);
  const entry = readJson(file);
  if (!force && entry && Date.now() - entry.ts < TTL) {
    return { text: entry.text, url, cached: true };
  }

  const headers = {};
  if (accept) headers.accept = accept;
  if (entry?.etag) headers['if-none-match'] = entry.etag;

  const res = await request(url, headers);
  if (res.status === 304 && entry) {
    writeJson(file, { ...entry, ts: Date.now() });
    return { text: entry.text, url, cached: true };
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);

  const text = await res.text();
  writeJson(file, { url, etag: res.headers.get('etag'), ts: Date.now(), text });
  return { text, url, cached: false };
}

async function fetchJson(url, opts) {
  const { text } = await fetchText(url, opts);
  return JSON.parse(text);
}

function normalizeInput(input) {
  if (!input) throw new Error('missing page path or URL');
  let value = input.trim();
  if (value.startsWith('http://') || value.startsWith('https://')) {
    value = new URL(value).pathname;
  }
  value = value.split('?')[0].split('#')[0];
  if (!value.startsWith('/')) value = `/${value}`;
  return value.replace(/\/+$/, '') || '/';
}

function mdUrlFor(input) {
  const p = normalizeInput(input);
  if (p === '/' || p === '') return `${BASE}/index.md`;
  if (p.endsWith('.md')) return `${BASE}${p}`;
  return `${BASE}${p}.md`;
}

function canonicalFor(input) {
  const p = normalizeInput(input);
  if (p === '/' || p === '') return `${BASE}/`;
  return `${BASE}${p.replace(/\.md$/, '')}`;
}

function cleanMd(value) {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/\*\*/g, '')
    .trim();
}

function parseMarkdown(md) {
  const lines = md.split('\n');
  const title = (md.match(/^# (.+)$/m) || [])[1]?.trim() || '';
  const summary = (md.match(/^> (.+)$/m) || [])[1]?.trim() || '';
  const canonical = (md.match(/^Canonical: (\S+)/m) || [])[1] || '';
  const updated = (md.match(/^Last updated: (\S+)/m) || [])[1] || '';

  const fields = {};
  for (const line of lines) {
    const match = line.match(/^\| ([^|]+?) \| (.+?) \|$/);
    if (!match) continue;
    const key = match[1].trim();
    if (key === 'Field' || /^-+$/.test(key)) continue;
    fields[key] = cleanMd(match[2]);
  }

  const colours = [...new Set((fields.Colours || '').match(/#[0-9a-fA-F]{3,8}/g) || [])];
  const related = [];
  for (const line of lines) {
    const match = line.match(/^- \[(.+?)\]\((\S+?)\)(?: - (.+))?$/);
    if (match) related.push({ title: match[1], url: match[2], note: match[3] || '' });
  }

  return { title, summary, canonical, updated, fields, colours, related };
}

async function loadPage(input) {
  const url = mdUrlFor(input);
  const { text } = await fetchText(url, { accept: 'text/markdown' });
  const parsed = parseMarkdown(text);
  return { ...parsed, canonical: parsed.canonical || canonicalFor(input) };
}

function attributionFor(page) {
  return {
    name: 'Designeer',
    canonical: page.canonical,
    creator: page.fields.Creator || '',
    original: page.fields['Original post'] || page.fields.Website || '',
  };
}

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(n)));
}

function indexAge() {
  const index = readJson(INDEX_FILE);
  if (!index?.syncedAt) return null;
  return { index, age: Date.now() - index.syncedAt };
}

function scoreItem(item, tokens) {
  const name = (item.name || '').toLowerCase();
  const tagline = (item.tagline || '').toLowerCase();
  const category = (item.category?.name || '').toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (name === token) score += 12;
    else if (name.startsWith(token)) score += 8;
    else if (name.includes(token)) score += 5;
    else if (category.includes(token)) score += 3;
    else if (tagline.includes(token)) score += 2;
    else score -= 4;
  }
  return score;
}

function searchIndex(index, query, collection, limit) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const pool = index.items.filter((item) => !collection || item.collectionSlug === collection);
  return pool
    .map((item) => ({ item, score: scoreItem(item, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map(({ item }) => item);
}

async function remoteSearch(query, collection, limit) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (collection) params.set('collection', collection);
  params.set('limit', String(limit));
  const data = await fetchJson(`${BASE}/api/catalog?${params}`);
  const items = (data.results || data.items || []).slice(0, limit);
  return items.map((item) => ({
    ...item,
    collectionSlug: item.collectionSlug || collection || '',
    collectionName: item.collectionName || '',
  }));
}

function toItem(raw, collection) {
  const collectionSlug = raw.collectionSlug || collection || '';
  return {
    name: raw.name,
    slug: raw.slug,
    tagline: raw.tagline,
    url: raw.url,
    collection: collectionSlug,
    category: raw.category?.name || '',
    pricing: raw.pricing || '',
    canonical: `${BASE}/${collectionSlug}/${raw.slug}`,
  };
}

async function commandSearch(args, flags) {
  const query = args.join(' ').trim();
  const limit = clampLimit(flags.limit);
  const collection = flags.collection || '';
  if (collection && !COLLECTIONS.includes(collection)) {
    throw new Error(`unknown collection "${collection}"; use ${COLLECTIONS.join(', ')}`);
  }
  if (!query && !collection) throw new Error('search needs a query, a collection, or both');

  let items = [];
  let fromIndex = false;
  const cachedIndex = flags.live ? null : indexAge();
  if (cachedIndex && cachedIndex.age < TTL && query) {
    const local = searchIndex(cachedIndex.index, query, collection, limit);
    if (local.length) {
      items = local.map((item) => toItem(item, item.collectionSlug));
      fromIndex = true;
    }
  }
  if (!items.length) {
    items = (await remoteSearch(query, collection, limit)).map((item) => toItem(item, collection));
  }

  if (flags.json) {
    console.log(JSON.stringify({ query, collection: collection || 'all', count: items.length, fromIndex, items, source: { name: 'Designeer', url: BASE } }, null, 2));
    return;
  }

  const label = collection ? ` in ${collection}` : '';
  console.log(`${items.length} reference${items.length === 1 ? '' : 's'} for "${query || 'curated'}"${label}${fromIndex ? ' (local index)' : ''}\n`);
  items.forEach((item, i) => {
    console.log(`${i + 1}. ${item.name}${item.category ? ` — ${item.category}` : ''}`);
    if (item.tagline) console.log(`   ${item.tagline}`);
    console.log(`   ${item.canonical}`);
  });
  console.log(`\nSource: Designeer (${BASE}). Cite each item's own URL and its creator.`);
}

async function commandGet(args, flags) {
  const input = args[0];
  if (!input) throw new Error('get needs a slug, path or URL');
  const page = await loadPage(input);
  if (flags.json) {
    console.log(JSON.stringify({ ...page, attribution: attributionFor(page) }, null, 2));
    return;
  }
  console.log(page.title);
  if (page.summary) console.log(page.summary);
  console.log(`\nCanonical: ${page.canonical}`);
  for (const [key, value] of Object.entries(page.fields)) {
    console.log(`${key}: ${value}`);
  }
  if (page.colours.length) console.log(`Palette: ${page.colours.join(', ')}`);
  if (page.related.length) console.log(`Related: ${page.related.length}`);
  console.log(`\nSource: Designeer — ${page.title} (${page.canonical})`);
  const creator = page.fields.Creator || '';
  const original = page.fields['Original post'] || page.fields.Website || '';
  if (creator || original) {
    console.log(`Creator / original: ${[creator, original].filter(Boolean).join(' — ')}`);
  }
}

async function commandPalette(args, flags) {
  const input = args[0];
  if (!input) throw new Error('palette needs a slug, path or URL');
  const page = await loadPage(input);
  if (!page.colours.length) {
    console.error(`No colour field on ${page.canonical}`);
    process.exitCode = 1;
    return;
  }
  if (flags.json) {
    console.log(JSON.stringify({ title: page.title, canonical: page.canonical, colours: page.colours, attribution: attributionFor(page) }, null, 2));
    return;
  }
  console.log(`${page.title}\n`);
  page.colours.forEach((hex, i) => console.log(`${String(i + 1).padStart(2)}. ${hex}`));
  console.log(`\nSource: Designeer — ${page.title} (${page.canonical})`);
}

async function commandLatest(args, flags) {
  const collection = flags.collection || 'inspiration';
  if (!COLLECTIONS.includes(collection)) throw new Error(`unknown collection "${collection}"`);
  const limit = clampLimit(flags.limit);
  const data = await fetchJson(`${BASE}/api/catalog?collection=${collection}&limit=${limit}`);
  const items = (data.items || []).map((item) => toItem(item, collection));
  if (flags.json) {
    console.log(JSON.stringify({ collection, count: items.length, items, source: { name: 'Designeer', url: BASE } }, null, 2));
    return;
  }
  console.log(`${items.length} in ${collection}, curated order\n`);
  items.forEach((item, i) => {
    console.log(`${i + 1}. ${item.name}${item.category ? ` — ${item.category}` : ''}`);
    if (item.tagline) console.log(`   ${item.tagline}`);
    console.log(`   ${item.canonical}`);
  });
  console.log(`\nSource: Designeer (${BASE}).`);
}

async function commandSync(flags) {
  const maxPages = Math.max(1, Number(flags['max-pages']) || 10);
  const items = [];
  for (const collection of COLLECTIONS) {
    let cursor = '';
    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({ collection, limit: '20' });
      if (cursor) params.set('cursor', cursor);
      const data = await fetchJson(`${BASE}/api/catalog?${params}`);
      for (const raw of data.items || []) {
        items.push({
          ...raw,
          collectionSlug: collection,
          collectionName: collection,
        });
      }
      cursor = data.nextCursor || '';
      if (!cursor) break;
    }
  }
  const seen = new Set();
  const unique = items.filter((item) => {
    const key = `${item.collectionSlug}/${item.slug}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  writeJson(INDEX_FILE, { syncedAt: Date.now(), items: unique });
  console.log(`Indexed ${unique.length} listings across ${COLLECTIONS.length} collections.`);
  console.log(INDEX_FILE);
}

async function commandHealth() {
  const checks = [];
  async function check(label, fn) {
    try {
      const detail = await fn();
      checks.push({ label, ok: true, detail });
    } catch (error) {
      checks.push({ label, ok: false, detail: error.message });
    }
  }

  await check('llms.txt', async () => {
    const { text } = await fetchText(`${BASE}/llms.txt`);
    if (!text.includes('Designeer')) throw new Error('unexpected content');
    return '200';
  });
  await check('catalogue API', async () => {
    const data = await fetchJson(`${BASE}/api/catalog?collection=inspiration&limit=1`);
    if (!Array.isArray(data.items)) throw new Error('missing items[]');
    return `${data.items.length} item`;
  });
  await check('home Markdown', async () => {
    const { text } = await fetchText(`${BASE}/index.md`, { accept: 'text/markdown' });
    if (!text.startsWith('# Designeer')) throw new Error('unexpected title');
    return '200';
  });
  await check('detail Markdown', async () => {
    const page = await loadPage('resources/fontshare');
    if (!page.fields.Collection) throw new Error('missing Collection field');
    return `${page.colours.length} colours`;
  });

  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label} — ${c.detail}`);
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}

function parseArgs(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (['json', 'live'].includes(key)) flags[key] = true;
      else flags[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    } else {
      args.push(arg);
    }
  }
  return { args, flags };
}

function usage() {
  console.log(`designeer — curated frontend design references

  search <query> [--collection <c>] [--limit 1-20] [--live] [--json]
  get <slug|path|url> [--json]
  palette <slug|path|url> [--json]
  latest [--collection <c>] [--limit 1-20] [--json]
  sync [--max-pages N]
  health

Collections: ${COLLECTIONS.join(', ')}
Cache: ${CACHE_DIR} (7 days, ETag revalidation)`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { args, flags } = parseArgs(rest);
  switch (command) {
    case 'search':
      return commandSearch(args, flags);
    case 'get':
      return commandGet(args, flags);
    case 'palette':
      return commandPalette(args, flags);
    case 'latest':
      return commandLatest(args, flags);
    case 'sync':
      return commandSync(flags);
    case 'health':
      return commandHealth();
    case undefined:
    case '--help':
    case '-h':
      return usage();
    default:
      usage();
      throw new Error(`unknown command "${command}"`);
  }
}

main().catch((error) => {
  console.error(`designeer: ${error.message}`);
  process.exitCode = 1;
});
