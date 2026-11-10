import { useCallback, useEffect, useRef, useState } from 'react';
import { details } from './tmdb';
import type { SavedDrama } from './types';

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  tag: string;
}

export interface NewsFeed {
  updatedAt: string;
  items: NewsItem[];
}

const NEWS_URL = `${import.meta.env.BASE_URL}news.json`;

export async function fetchNews(signal?: AbortSignal): Promise<NewsFeed> {
  const res = await fetch(`${NEWS_URL}?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`Лента недоступна (HTTP ${res.status})`);
  const data = (await res.json()) as NewsFeed;
  return { updatedAt: data.updatedAt, items: Array.isArray(data.items) ? data.items : [] };
}

/** Лента новостей с автообновлением: при открытии, при возврате на вкладку и раз в 10 минут. */
export function useNews(active: boolean) {
  const [feed, setFeed] = useState<NewsFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const inflight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setLoading(true);
    try {
      const f = await fetchNews(controller.signal);
      setFeed(f);
      setError(null);
      setCheckedAt(Date.now());
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      if (inflight.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => document.visibilityState === 'visible' && void refresh(), 10 * 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [active, refresh]);

  return { feed, error, loading, checkedAt, refresh };
}

export interface UpcomingEpisode {
  item: SavedDrama;
  airDate: string;
  number: number;
  season: number;
  name: string;
}

/** Ближайшие серии для сериалов, которые пользователь смотрит или собирается. */
export async function fetchUpcoming(items: SavedDrama[], signal?: AbortSignal): Promise<UpcomingEpisode[]> {
  const candidates = items
    .filter((s) => s.mediaType === 'tv' && (s.status === 'watching' || s.status === 'planned' || s.status === 'onHold'))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12);
  const results = await Promise.all(
    candidates.map(async (item) => {
      try {
        const d = await details('tv', item.tmdbId, signal);
        return d.nextEpisode ? { item, ...d.nextEpisode } : null;
      } catch {
        return null;
      }
    }),
  );
  return results
    .filter((r): r is UpcomingEpisode => r !== null)
    .sort((a, b) => (a.airDate < b.airDate ? -1 : 1));
}

export function timeAgo(iso: string | number): string {
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'вчера';
  if (d < 7) return `${d} дн. назад`;
  return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function formatAirDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days > 1 && days < 7) return date.toLocaleDateString('ru-RU', { weekday: 'long' });
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
