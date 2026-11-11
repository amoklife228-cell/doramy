import { useCallback, useEffect, useRef, useState } from 'react';
import { remember, type Page } from './tmdb';
import type { Drama } from './types';

export interface PagedList {
  items: Drama[];
  loading: boolean;
  error: string | null;
  /** Есть ещё страницы и автодогрузка не остановлена ошибкой. */
  hasMore: boolean;
  /** Сколько страниц уже загружено. */
  pagesLoaded: number;
  loadMore: () => void;
  /** Повторить страницу, на которой случилась ошибка (или первую). */
  retry: () => void;
  reload: () => void;
}

/**
 * Постраничная загрузка с защитой от устаревших ответов.
 * `key` — строка, при изменении которой список сбрасывается; `fetcher` получает номер страницы.
 */
export function usePagedList(
  key: string,
  fetcher: ((page: number, signal: AbortSignal) => Promise<Page<Drama>>) | null,
): PagedList {
  const [items, setItems] = useState<Drama[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPage, setNextPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [version, setVersion] = useState(0);

  const generation = useRef(0);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async (page: number) => {
    const fetch = fetcherRef.current;
    if (!fetch || inFlight.current) return;
    const gen = generation.current;
    inFlight.current = true;
    controller.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const result = await fetch(page, controller.current.signal);
      if (gen !== generation.current) return;
      remember(result.items);
      setItems((prev) => {
        if (page === 1) return result.items;
        const known = new Set(prev.map((d) => d.id));
        return [...prev, ...result.items.filter((d) => !known.has(d.id))];
      });
      setTotalPages(result.totalPages);
      setNextPage(page + 1);
    } catch (e) {
      if (gen !== generation.current || (e as Error).name === 'AbortError') return;
      if (page === 1) setItems([]);
      setError((e as Error).message || 'Ошибка загрузки');
    } finally {
      if (gen === generation.current) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }, []);

  // Сброс при смене ключа (фильтры, запрос) или принудительной перезагрузке.
  useEffect(() => {
    generation.current += 1;
    controller.current?.abort();
    inFlight.current = false;
    setNextPage(1);
    setTotalPages(1);
    setError(null);
    if (!fetcherRef.current) {
      setItems([]);
      setLoading(false);
      return;
    }
    void load(1);
  }, [key, version, load]);

  // После ошибки автодогрузка останавливается, иначе сторож снова виден и запросы идут по кругу.
  const hasMore = nextPage <= totalPages && !error;

  const loadMore = useCallback(() => {
    if (hasMore && !inFlight.current) void load(nextPage);
  }, [hasMore, nextPage, load]);

  const retry = useCallback(() => {
    if (!inFlight.current) void load(nextPage);
  }, [nextPage, load]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { items, loading, error, hasMore, pagesLoaded: nextPage - 1, loadMore, retry, reload };
}
