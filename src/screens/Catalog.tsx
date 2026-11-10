import { useCallback, useState } from 'react';
import { Chips } from '../components/Chips';
import { DramaGrid, EmptyState, NotConfigured } from '../components/DramaGrid';
import { useConfigured, useDebounced } from '../lib/hooks';
import { discover, search } from '../lib/tmdb';
import { COUNTRIES, GENRES_BY_TYPE, MEDIA_TYPES, SORTS, WORLD, type DiscoverSort, type MediaType } from '../lib/types';
import { usePagedList } from '../lib/usePagedList';

const COUNTRY_OPTIONS = [
  { value: '', label: 'Азия' },
  { value: WORLD, label: '🌍 Весь мир' },
  ...COUNTRIES.map((c) => ({ value: c.code, label: `${c.flag} ${c.title}` })),
];

export function Catalog() {
  const configured = useConfigured();
  const [mediaType, setMediaType] = useState<MediaType>('tv');
  const [country, setCountry] = useState('');
  const [genre, setGenre] = useState<Record<MediaType, string>>({ tv: '', movie: '' });
  const [sort, setSort] = useState<DiscoverSort>('popular');
  const [text, setText] = useState('');

  const query = useDebounced(text.trim(), 400);
  const searching = query.length >= 2;
  const currentGenre = genre[mediaType];

  const key = searching
    ? `${configured}|s:${mediaType}|${country}|${query}`
    : `${configured}|d:${mediaType}|${country}|${currentGenre}|${sort}`;

  const fetcher = useCallback(
    (page: number, signal: AbortSignal) =>
      searching
        ? search(mediaType, query, country, page, signal)
        : discover({ mediaType, country, genre: currentGenre, sort, page }, signal),
    [searching, mediaType, query, country, currentGenre, sort],
  );
  const list = usePagedList(key, configured ? fetcher : null);

  return (
    <>
      <header className="topbar">
        <div className="topbar-row">
          <h1>Дорамы</h1>
          <div className="segmented" role="tablist">
            {MEDIA_TYPES.map((m) => (
              <button
                key={m.id}
                role="tab"
                aria-selected={mediaType === m.id}
                data-active={mediaType === m.id}
                onClick={() => setMediaType(m.id)}
              >
                {m.title}
              </button>
            ))}
          </div>
        </div>
        <div className="searchbox">
          <input
            type="search"
            placeholder={mediaType === 'tv' ? 'Поиск сериала по названию' : 'Поиск фильма по названию'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoCorrect="off"
            autoCapitalize="off"
            enterKeyHint="search"
          />
          {text && (
            <button className="searchbox-clear" onClick={() => setText('')} aria-label="Очистить">
              ✕
            </button>
          )}
        </div>
        {!searching && (
          <div className="topbar-controls">
            <select
              value={currentGenre}
              onChange={(e) => setGenre({ ...genre, [mediaType]: e.target.value })}
              aria-label="Жанр"
            >
              <option value="">Все жанры</option>
              {GENRES_BY_TYPE[mediaType].map((g) => (
                <option key={g.id} value={String(g.id)}>
                  {g.title}
                </option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as DiscoverSort)} aria-label="Сортировка">
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <Chips value={country} onChange={setCountry} options={COUNTRY_OPTIONS} />
      </header>

      <div className="content">
        {!configured ? (
          <NotConfigured />
        ) : list.error && list.items.length === 0 ? (
          <EmptyState
            icon="📡"
            title="Не удалось загрузить"
            text={list.error}
            action={
              <button className="btn btn-primary" onClick={list.reload}>
                Повторить
              </button>
            }
          />
        ) : !list.loading && list.items.length === 0 ? (
          searching ? (
            <EmptyState
              icon="🤷"
              title="Ничего не нашлось"
              text={`По запросу «${query}» ничего нет${country === WORLD ? '' : ' среди выбранных стран. Попробуйте «Весь мир»'}.`}
            />
          ) : (
            <EmptyState icon="📺" title="Ничего не найдено" text="Попробуйте другую страну или жанр." />
          )
        ) : (
          <DramaGrid items={list.items} loading={list.loading} hasMore={list.hasMore} onLoadMore={list.loadMore} />
        )}
      </div>
    </>
  );
}
