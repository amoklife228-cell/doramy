import { credits } from './tmdb';
import type { WrappedTitle } from './wrapped';
import type { SavedDrama } from './types';

/**
 * «Актёр года» для «Итогов»: чаще всех встречается в просмотренных и текущих записях года.
 * Состав берётся из TMDB (credits) для первых 15 записей по числу серий и кэшируется на 30 дней,
 * чтобы повторный просмотр итогов не делал запросов.
 */

interface CastLite {
  id: number;
  name: string;
  profilePath: string | null;
}

interface CacheRow {
  t: number;
  cast: CastLite[];
}

export interface FavouriteActor {
  id: number;
  name: string;
  profilePath: string | null;
  /** Записи года, где он играет. */
  titles: SavedDrama[];
}

const STORE = 'doramy.wrapped.cast.v1';
const TTL = 30 * 24 * 3600 * 1000;
const LIMIT = 15;

function loadCache(): Record<string, CacheRow> {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Record<string, CacheRow>) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, CacheRow>) {
  try {
    localStorage.setItem(STORE, JSON.stringify(cache));
  } catch {
    // переполнено или запрещено — просто без кэша
  }
}

async function castOf(item: SavedDrama, cache: Record<string, CacheRow>, signal?: AbortSignal): Promise<CastLite[]> {
  const hit = cache[item.key];
  if (hit && Date.now() - hit.t < TTL) return hit.cast;
  const list = await credits(item.mediaType, item.tmdbId, signal);
  const cast = list.slice(0, 15).map((c) => ({ id: c.id, name: c.name, profilePath: c.profilePath }));
  cache[item.key] = { t: Date.now(), cast };
  return cast;
}

/** Записи, по которым ищем актёра: «Просмотрено» и «Смотрю», первые 15 по числу серий. */
export function actorCandidates(titles: WrappedTitle[]): WrappedTitle[] {
  return titles.filter((t) => t.item.status === 'completed' || t.item.status === 'watching').slice(0, LIMIT);
}

export async function favouriteActor(titles: WrappedTitle[], signal?: AbortSignal): Promise<FavouriteActor | null> {
  const pool = actorCandidates(titles);
  if (pool.length === 0) return null;
  const cache = loadCache();
  const results = await Promise.allSettled(pool.map((t) => castOf(t.item, cache, signal)));
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (results.every((r) => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;
  saveCache(cache);

  const score = new Map<number, { actor: CastLite; titles: SavedDrama[]; weight: number; order: number }>();
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    r.value.forEach((c, order) => {
      const row = score.get(c.id) ?? { actor: c, titles: [], weight: 0, order: 0 };
      row.titles.push(pool[i].item);
      row.weight += pool[i].units;
      row.order += order;
      if (!row.actor.profilePath && c.profilePath) row.actor = c;
      score.set(c.id, row);
    });
  });
  // Больше записей → больше серий с ним → выше в титрах.
  const best = [...score.values()].sort(
    (a, b) => b.titles.length - a.titles.length || b.weight - a.weight || a.order / a.titles.length - b.order / b.titles.length,
  )[0];
  if (!best) return null;
  return { id: best.actor.id, name: best.actor.name, profilePath: best.actor.profilePath, titles: best.titles };
}
