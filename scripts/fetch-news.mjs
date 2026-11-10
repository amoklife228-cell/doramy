// Собирает новости о дорамах из RSS Google News в public/news.json.
// Запускается на CI перед сборкой (раз в час по расписанию). При ошибке сети
// оставляет прежний файл, чтобы сборка не ломалась.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

const QUERIES = [
  { q: 'дорамы', tag: 'Дорамы' },
  { q: 'корейские сериалы', tag: 'Корея' },
  { q: 'k-drama', tag: 'K-drama' },
  { q: 'китайские дорамы OR тайские дорамы OR японские дорамы', tag: 'Азия' },
  { q: 'корейское кино OR корейский фильм', tag: 'Фильмы' },
];

const OUT = 'public/news.json';
const MAX_ITEMS = 80;
const MAX_AGE_DAYS = 21;

function feedUrl(q) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ru&gl=RU&ceid=RU:ru`;
}

function stripSource(title, source) {
  // Google News приписывает « - Источник» в конец заголовка.
  if (source && title.endsWith(` - ${source}`)) return title.slice(0, -(source.length + 3)).trim();
  const i = title.lastIndexOf(' - ');
  return i > 20 ? title.slice(0, i).trim() : title;
}

function decode(s) {
  return String(s ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

async function fetchFeed({ q, tag }) {
  const res = await fetch(feedUrl(q), {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; doramy-news/1.0)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${q}`);
  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xml);
  const items = doc?.rss?.channel?.item ?? [];
  return (Array.isArray(items) ? items : [items]).map((it) => {
    const source = typeof it.source === 'object' ? it.source['#text'] : it.source;
    const title = decode(typeof it.title === 'object' ? it.title['#text'] : it.title);
    return {
      id: String(it.guid?.['#text'] ?? it.guid ?? it.link),
      title: stripSource(title, source),
      link: String(it.link ?? ''),
      source: decode(source ?? ''),
      publishedAt: new Date(it.pubDate).toISOString(),
      tag,
    };
  });
}

function loadExisting() {
  try {
    return existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
  } catch {
    return null;
  }
}

const results = await Promise.allSettled(QUERIES.map(fetchFeed));
const fetched = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
const failed = results.filter((r) => r.status === 'rejected').map((r) => String(r.reason));
if (failed.length) console.warn('news: some feeds failed:', failed);

const existing = loadExisting();
if (fetched.length === 0) {
  if (existing) {
    console.warn('news: nothing fetched, keeping previous file');
    process.exit(0);
  }
  mkdirSync('public', { recursive: true });
  writeFileSync(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), items: [] }));
  console.warn('news: nothing fetched, wrote empty file');
  process.exit(0);
}

// Объединяем со старыми (на случай, если какая-то лента временно пустая), убираем дубли по ссылке/заголовку.
const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
const all = [...fetched, ...(existing?.items ?? [])].filter((i) => Date.parse(i.publishedAt) > cutoff && i.title && i.link);
const seen = new Set();
const unique = [];
for (const it of all.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))) {
  const key = it.title.toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
  if (seen.has(it.link) || seen.has(key)) continue;
  seen.add(it.link);
  seen.add(key);
  unique.push(it);
  if (unique.length >= MAX_ITEMS) break;
}

mkdirSync('public', { recursive: true });
writeFileSync(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), items: unique }));
console.log(`news: ${unique.length} items written (${fetched.length} fetched)`);
