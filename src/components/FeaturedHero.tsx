import { useEffect, useRef, useState } from 'react';
import { addToLibrary } from '../lib/db';
import { openDrama } from '../lib/router';
import { countryLabel, itemKey, yearOf, type Drama, type MediaType } from '../lib/types';
import { loadCollectionItems } from './CollectionStrip';

const SLIDES = 6;
const INTERVAL = 7000;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Большой баннер наверху каталога на компьютере: кадры того, что сейчас в тренде,
 * с названием, оценкой, описанием и кнопками. Листается сам раз в 7 секунд,
 * замирает под курсором и при «уменьшении движения»; точки внизу переключают слайды.
 */
export function FeaturedHero({
  mediaType,
  libraryKeys,
  refreshKey,
  onBackdrop,
}: {
  mediaType: MediaType;
  libraryKeys: Set<string>;
  refreshKey: number;
  onBackdrop?: (path: string | null) => void;
}) {
  const [items, setItems] = useState<Drama[] | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const c = new AbortController();
    setItems(null);
    setIndex(0);
    loadCollectionItems('trending', mediaType, c.signal)
      .then((list) => {
        // Нужны кадры; с описанием — вперёд, без него — в конец.
        const withArt = list.filter((d) => d.backdropPath);
        const sorted = [...withArt.filter((d) => d.overview), ...withArt.filter((d) => !d.overview)];
        setItems(sorted.slice(0, SLIDES));
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setItems([]);
      });
    return () => c.abort();
  }, [mediaType, refreshKey]);

  const count = items?.length ?? 0;
  const current = items && count ? items[index % count] : null;

  useEffect(() => {
    onBackdrop?.(current?.backdropPath ?? null);
  }, [current, onBackdrop]);

  // Автопрокрутка: не под курсором, не в фоне, не при «уменьшении движения».
  useEffect(() => {
    if (count < 2 || paused || reducedMotion()) return;
    const t = window.setTimeout(() => {
      if (document.visibilityState === 'visible') setIndex((i) => (i + 1) % count);
    }, INTERVAL);
    return () => window.clearTimeout(t);
  }, [count, paused, index]);

  if (items === null) {
    return <section className="feature feature-skeleton skeleton" aria-busy="true" aria-label="Загружаем" />;
  }
  if (!current) return null;

  const go = (n: number) => setIndex(((n % count) + count) % count);
  const inLibrary = libraryKeys.has(itemKey(current.mediaType, current.id));
  const year = yearOf(current.firstAirDate);
  const country = countryLabel(current.originCountries);

  return (
    <section
      ref={rootRef}
      className="feature"
      aria-roledescription="карусель"
      aria-label={mediaType === 'movie' ? 'Фильмы в тренде' : 'Сериалы в тренде'}
      data-paused={paused}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(index + 1);
        if (e.key === 'ArrowLeft') go(index - 1);
      }}
    >
      {items.map((d, i) => (
        <img
          key={itemKey(d.mediaType, d.id)}
          className="feature-img"
          src={`https://image.tmdb.org/t/p/w1280${d.backdropPath}`}
          alt=""
          decoding="async"
          draggable={false}
          data-active={i === index % count}
        />
      ))}
      <div className="feature-shade" aria-hidden="true" />

      <div className="feature-body" key={itemKey(current.mediaType, current.id)}>
        <div className="feature-kicker">
          <span className="feature-rank">№{(index % count) + 1}</span>
          {mediaType === 'movie' ? 'Фильмы в тренде' : 'В тренде на неделе'}
        </div>
        <h2 className="feature-title">{current.title}</h2>
        <div className="feature-meta">
          {current.voteAverage > 0 && <span className="feature-rating">★ {current.voteAverage.toFixed(1)}</span>}
          {year && <span>{year}</span>}
          {country && <span>{country}</span>}
        </div>
        {current.overview && <p className="feature-overview">{current.overview}</p>}
        <div className="feature-actions">
          <button className="btn btn-primary" onClick={() => openDrama(current.mediaType, current.id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
            Подробнее
          </button>
          {inLibrary ? (
            <span className="btn feature-in-library">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              В библиотеке
            </span>
          ) : (
            <button
              className="btn feature-add"
              disabled={busy === itemKey(current.mediaType, current.id)}
              onClick={() => {
                const k = itemKey(current.mediaType, current.id);
                setBusy(k);
                void addToLibrary(current, 'planned').finally(() => setBusy(null));
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Добавить в библиотеку
            </button>
          )}
        </div>
      </div>

      {count > 1 && (
        <div className="feature-dots" role="tablist" aria-label="Слайды">
          {items.map((d, i) => (
            <button
              key={itemKey(d.mediaType, d.id)}
              role="tab"
              className="feature-dot"
              aria-selected={i === index % count}
              aria-label={`${i + 1}: ${d.title}`}
              data-active={i === index % count}
              onClick={() => go(i)}
            >
              {/* Полоска заполняется за время показа слайда; после паузы — заново, вместе с таймером. */}
              <span className="feature-dot-fill" key={`${index}:${paused}`} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
