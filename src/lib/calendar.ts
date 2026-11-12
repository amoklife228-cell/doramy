import { fetchOutline, fetchSeason, forgetShow, isGenericName } from './episodes';
import { todayKey, type SavedDrama } from './types';

/*
 * Календарь выхода серий: сериалы из библиотеки со статусом «Смотрю», «Хочу посмотреть» и избранные.
 * На каждый сериал — /tv/{id} (ближайшая и последняя серии) и нужный сезон целиком (все даты в диапазоне).
 * Результат по каждому сериалу хранится 6 часов в localStorage, одновременных запросов не больше 8
 * (ограничитель fetchJSON).
 */

export interface CalendarEpisode {
  key: string;
  tmdbId: number;
  season: number;
  episode: number;
  /** Пусто, если у серии нет настоящего названия. */
  name: string;
  airDate: string;
}

type StoredEpisode = Pick<CalendarEpisode, 'season' | 'episode' | 'name' | 'airDate'>;

interface Stored {
  v: 1;
  shows: Record<string, { at: number; eps: StoredEpisode[] }>;
}

const STORAGE = 'doramy.calendar.v1';
const TTL = 6 * 3600_000;
export const PAST_DAYS = 7;
export const FUTURE_DAYS = 60;

export function trackedShows(items: SavedDrama[]): SavedDrama[] {
  return items.filter(
    (s) => s.mediaType === 'tv' && (s.status === 'watching' || s.status === 'planned' || s.isFavorite),
  );
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d + n));
}

export function calendarRange(today = todayKey()): { from: string; to: string } {
  return { from: addDays(today, -PAST_DAYS), to: addDays(today, FUTURE_DAYS) };
}

function readStore(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE);
    const parsed = raw ? (JSON.parse(raw) as Stored) : null;
    if (parsed && parsed.v === 1 && parsed.shows && typeof parsed.shows === 'object') return parsed;
  } catch {
    // повреждённый кэш — начинаем заново
  }
  return { v: 1, shows: {} };
}

function writeStore(store: Stored) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(store));
  } catch {
    // нет места или приватный режим — работаем без кэша
  }
}

const expand = (s: SavedDrama, eps: StoredEpisode[]): CalendarEpisode[] =>
  eps.map((e) => ({ ...e, key: s.key, tmdbId: s.tmdbId }));

/** Что уже лежит в кэше (даже устаревшее) — чтобы показать календарь сразу, пока идёт обновление. */
export function cachedCalendar(items: SavedDrama[]): { episodes: CalendarEpisode[]; at: number | null; complete: boolean } {
  const store = readStore();
  const shows = trackedShows(items);
  const episodes: CalendarEpisode[] = [];
  let at: number | null = null;
  let complete = true;
  for (const s of shows) {
    const c = store.shows[s.key];
    if (!c) {
      complete = false;
      continue;
    }
    if (Date.now() - c.at > TTL) complete = false;
    at = at === null ? c.at : Math.min(at, c.at);
    episodes.push(...expand(s, c.eps));
  }
  return { episodes, at, complete };
}

async function fetchShow(s: SavedDrama, from: string): Promise<StoredEpisode[]> {
  const outline = await fetchOutline(s.tmdbId);
  const seasons = new Set<number>();
  if (outline.next) seasons.add(outline.next.season);
  if (outline.last && outline.last.airDate >= from) seasons.add(outline.last.season);
  const out = new Map<string, StoredEpisode>();
  const put = (e: StoredEpisode) => {
    if (e.airDate >= from) out.set(`${e.season}:${e.episode}`, e);
  };
  for (const n of seasons) {
    try {
      const data = await fetchSeason(s.tmdbId, n);
      for (const e of data.episodes) {
        if (!e.airDate) continue;
        const generic = isGenericName(e.name) || e.name === `Серия ${e.number}`;
        put({ season: n, episode: e.number, name: generic ? '' : e.name, airDate: e.airDate });
      }
    } catch {
      // сезон не загрузился — останутся хотя бы ближайшая и последняя серии из сводки
    }
  }
  for (const b of [outline.next, outline.last]) {
    if (b && !out.has(`${b.season}:${b.episode}`)) put({ season: b.season, episode: b.episode, name: b.name, airDate: b.airDate });
  }
  return [...out.values()].sort((a, b) => (a.airDate < b.airDate ? -1 : a.airDate > b.airDate ? 1 : a.episode - b.episode));
}

/**
 * Серии всех отслеживаемых сериалов. Свежие (моложе 6 часов) берутся из кэша, остальные запрашиваются.
 * force — запросить всё заново. failed — сколько сериалов не удалось обновить (для них — старый кэш).
 */
export async function loadCalendar(
  items: SavedDrama[],
  opts: { force?: boolean } = {},
): Promise<{ episodes: CalendarEpisode[]; failed: number; at: number }> {
  const store = readStore();
  const shows = trackedShows(items);
  const { from } = calendarRange();
  const now = Date.now();
  let failed = 0;
  const next: Stored = { v: 1, shows: {} };

  const results = await Promise.all(
    shows.map(async (s) => {
      const cached = store.shows[s.key];
      if (cached && !opts.force && now - cached.at < TTL) {
        next.shows[s.key] = cached;
        return expand(s, cached.eps);
      }
      if (opts.force) forgetShow(s.tmdbId);
      try {
        const eps = await fetchShow(s, from);
        next.shows[s.key] = { at: Date.now(), eps };
        return expand(s, eps);
      } catch {
        failed++;
        if (cached) next.shows[s.key] = cached;
        return cached ? expand(s, cached.eps) : [];
      }
    }),
  );
  // Сериалы, которые убрали из библиотеки или перестали отслеживать, из кэша выпадают.
  writeStore(next);
  const ats = Object.values(next.shows).map((c) => c.at);
  return { episodes: results.flat(), failed, at: ats.length ? Math.min(...ats) : now };
}
