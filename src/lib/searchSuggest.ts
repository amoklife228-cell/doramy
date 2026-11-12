import { isActingHit, localizePeople, toPersonHit, type PersonHit } from './people';
import { fetchJSON, isAsian, localizeTitles, toDrama, type ListItemDTO } from './tmdb';
import { NOT_DRAMA, WORLD, type Drama } from './types';

/* ---------- Подсказки при вводе ---------- */

export type Suggestion = { kind: 'drama'; drama: Drama } | { kind: 'person'; person: PersonHit };

interface MultiDTO extends ListItemDTO {
  media_type?: string;
  profile_path?: string | null;
  known_for_department?: string;
  known_for?: (ListItemDTO & { media_type?: string })[];
  gender?: number;
  popularity?: number;
}

const MAX_TITLES = 6;
const MAX_PEOPLE = 2;
const cache = new Map<string, Suggestion[]>();

/**
 * Порядок подсказок: своя страна первой ('' — азиатские, код — эта страна, потом остальная Азия;
 * «Весь мир» — как отдал TMDB), а аниме, детское и шоу — в конец, как и в каталоге по умолчанию.
 */
function rankDramas(items: { d: Drama; genres: number[] }[], country: string): Drama[] {
  const countryRank = (d: Drama) =>
    country === WORLD ? 0 : country && d.originCountries.includes(country) ? 0 : isAsian(d) ? 1 : 2;
  const showRank = (x: { d: Drama; genres: number[] }) => (x.genres.some((g) => NOT_DRAMA[x.d.mediaType].includes(g)) ? 1 : 0);
  return items
    .map((x, i) => ({ d: x.d, i, r: countryRank(x.d) * 2 + showRank(x) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.d);
}

/**
 * До 6 сериалов и фильмов (только с постером) и до 2 актёров по одному запросу /search/multi.
 * Если TMDB первым поставил человека — актёры идут первыми.
 */
export async function suggest(query: string, country: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const key = `${country}|${query.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = await fetchJSON<{ results?: MultiDTO[] }>(
    '/search/multi',
    { query, page: '1', include_adult: 'false' },
    signal,
  );
  const results = r.results ?? [];
  const dramas = rankDramas(
    results
      .filter((x) => (x.media_type === 'tv' || x.media_type === 'movie') && x.poster_path)
      .map((x) => ({ d: toDrama(x.media_type === 'movie' ? 'movie' : 'tv', x), genres: x.genre_ids ?? [] })),
    country,
  ).slice(0, MAX_TITLES);
  const peopleRaw = results
    .filter((x) => x.media_type === 'person' && isActingHit(x) && x.profile_path)
    .map((x) => toPersonHit({ ...x, name: x.name ?? '' }));
  // Нет ни одного названия — запрос, скорее всего, про актёра: показываем их больше.
  const people = (country === WORLD ? peopleRaw : [...peopleRaw].sort((a, b) => Number(b.asian) - Number(a.asian))).slice(
    0,
    dramas.length ? MAX_PEOPLE : MAX_TITLES,
  );

  const [titled, named] = await Promise.all([
    localizeTitles(dramas, signal, MAX_TITLES),
    localizePeople(people, signal, MAX_TITLES),
  ]);
  const personFirst = results[0]?.media_type === 'person' && named.length > 0;
  const d: Suggestion[] = titled.map((drama) => ({ kind: 'drama', drama }));
  const p: Suggestion[] = named.map((person) => ({ kind: 'person', person }));
  const list = personFirst ? [...p, ...d] : [...d, ...p];
  cache.set(key, list);
  if (cache.size > 60) cache.delete(cache.keys().next().value as string);
  return list;
}

/* ---------- Недавние запросы ---------- */

const RECENT_KEY = 'doramy.search.recent';
const RECENT_MAX = 8;

export function loadRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function store(list: string[]): string[] {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // приватный режим: история живёт до перезагрузки
  }
  return list;
}

/** Запомнить запрос первым; такой же без учёта регистра уходит из середины списка. */
export function saveRecent(query: string): string[] {
  const q = query.trim().replace(/\s+/g, ' ');
  if (q.length < 2) return loadRecent();
  const rest = loadRecent().filter((x) => x.toLowerCase() !== q.toLowerCase());
  return store([q, ...rest].slice(0, RECENT_MAX));
}

export function removeRecent(query: string): string[] {
  return store(loadRecent().filter((x) => x !== query));
}

export function clearRecent(): string[] {
  return store([]);
}
