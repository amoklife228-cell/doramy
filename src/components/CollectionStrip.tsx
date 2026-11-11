import { useEffect, useRef, useState } from 'react';
import { COLLECTIONS, type CollectionId } from '../lib/collections';
import { openCollection, openDrama } from '../lib/router';
import { remember } from '../lib/tmdb';
import { itemKey, yearOf, type Drama, type MediaType } from '../lib/types';
import { Poster } from './Poster';

const STRIP_COUNT = 15;
const STRIP_TTL = 30 * 60 * 1000;
const stripCache = new Map<string, { items: Drama[]; at: number }>();

/**
 * Горизонтальная лента подборки на главной каталога: заголовок с «Все ›» и постеры.
 * Грузится, только когда подъезжает к экрану, и держит результат 30 минут.
 */
export function CollectionStrip({
  id,
  mediaType,
  refreshKey,
  libraryKeys,
}: {
  id: CollectionId;
  mediaType: MediaType;
  refreshKey: number;
  libraryKeys: Set<string>;
}) {
  const collection = COLLECTIONS[id];
  const cacheKey = `${mediaType}:${id}`;
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [items, setItems] = useState<Drama[] | null>(() => stripCache.get(cacheKey)?.items ?? null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lastRefresh = useRef(refreshKey);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setVisible(true), {
      rootMargin: '300px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const forced = lastRefresh.current !== refreshKey;
    lastRefresh.current = refreshKey;
    const cached = stripCache.get(cacheKey);
    if (cached && !forced && attempt === 0 && Date.now() - cached.at < STRIP_TTL) {
      setItems(cached.items);
      return;
    }
    if (!cached) setItems(null);
    setError(false);
    const controller = new AbortController();
    collection
      .fetchPage(mediaType, 1, controller.signal)
      .then((r) => {
        const list = r.items.slice(0, STRIP_COUNT);
        remember(list);
        stripCache.set(cacheKey, { items: list, at: Date.now() });
        setItems(list);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(true);
      });
    return () => controller.abort();
  }, [visible, cacheKey, collection, mediaType, refreshKey, attempt]);

  const title = collection.title[mediaType];
  // Для рейтинга место считаем по исходному списку, остальное — без того, что уже в библиотеке.
  const shown = (items ?? [])
    .map((d, i) => ({ d, rank: i + 1 }))
    .filter(({ d }) => collection.ranked || !libraryKeys.has(itemKey(d.mediaType, d.id)));

  return (
    <section className="pblock" ref={ref}>
      <button className="pblock-head pblock-link" onClick={() => openCollection(mediaType, id)}>
        <h2>{title}</h2>
        <span className="strip-all">
          Все
          <svg viewBox="0 0 8 14" fill="none" aria-hidden="true">
            <path d="M1 1l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {error && !items ? (
        <div className="strip-error">
          <span className="muted small">Не удалось загрузить</span>
          <button className="btn" onClick={() => setAttempt((n) => n + 1)}>
            Повторить
          </button>
        </div>
      ) : items === null ? (
        <div className="strip" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="strip-item" aria-hidden="true">
              <div className="strip-poster skeleton" />
              <div className="skeleton skeleton-line" style={{ width: '80%' }} />
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="muted small">Пока пусто, загляните позже.</p>
      ) : (
        <div className="strip">
          {shown.map(({ d, rank }) => {
            const note = collection.notes?.get(itemKey(d.mediaType, d.id));
            return (
              <button key={itemKey(d.mediaType, d.id)} className="strip-item" onClick={() => openDrama(d.mediaType, d.id)}>
                <span className="strip-poster-wrap">
                  <Poster path={d.posterPath} alt={d.title} size="w342" className="strip-poster" />
                  {collection.ranked && <span className="rank-badge">{rank}</span>}
                  {d.voteAverage > 0 && <span className="badge">★ {d.voteAverage.toFixed(1)}</span>}
                </span>
                <span className="strip-title">{d.title}</span>
                {note ? (
                  <span className="strip-note">{note}</span>
                ) : (
                  <span className="strip-year">{yearOf(d.firstAirDate) ?? ''}</span>
                )}
              </button>
            );
          })}
          <button className="strip-item" onClick={() => openCollection(mediaType, id)}>
            <span className="strip-poster strip-more-box">Все</span>
          </button>
        </div>
      )}
    </section>
  );
}
