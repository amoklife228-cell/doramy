import { useCallback, useMemo, useState } from 'react';
import { Chips } from '../components/Chips';
import { DramaGrid, EmptyState, NotConfigured } from '../components/DramaGrid';
import { useConfigured, useDebounced } from '../lib/hooks';
import { discover, search } from '../lib/tmdb';
import { COUNTRIES, GENRES, SORTS, type DiscoverSort } from '../lib/types';
import { usePagedList } from '../lib/usePagedList';

export function Catalog() {
  const configured = useConfigured();
  const [country, setCountry] = useState('');
  const [genre, setGenre] = useState('');
  const [sort, setSort] = useState<DiscoverSort>('popularity.desc');
  const [text, setText] = useState('');

  const query = useDebounced(text.trim(), 400);
  const searching = query.length >= 2;

  const key = searching ? `${configured}|s:${query}` : `${configured}|d:${country}|${genre}|${sort}`;
  const fetcher = useCallback(
    (page: number, signal: AbortSignal) =>
      searching ? search(query, page, signal) : discover({ country, genre, sort, page }, signal),
    [searching, query, country, genre, sort],
  );
  const list = usePagedList(key, configured ? fetcher : null);

  // В режиме поиска страну фильтруем на клиенте: TMDB-поиск не умеет фильтровать по стране.
  const items = useMemo(
    () => (searching && country ? list.items.filter((d) => d.originCountries.includes(country)) : list.items),
    [list.items, searching, country],
  );

  return (
    <>
      <header className="topbar">
        <h1>Дорамы</h1>
        <div className="searchbox">
          <input
            type="search"
            placeholder="Поиск дорамы по названию"
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
            <select value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Жанр">
              <option value="">Все жанры</option>
              {GENRES.map((g) => (
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
        <Chips
          value={country}
          onChange={setCountry}
          options={[{ value: '', label: 'Все' }, ...COUNTRIES.map((c) => ({ value: c.code, label: `${c.flag} ${c.title}` }))]}
        />
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
        ) : !list.loading && items.length === 0 ? (
          searching ? (
            <EmptyState icon="🤷" title="Ничего не нашлось" text={`По запросу «${query}» нет дорам${country ? ' из этой страны' : ''}.`} />
          ) : (
            <EmptyState icon="📺" title="Ничего не найдено" text="Попробуйте другую страну или жанр." />
          )
        ) : (
          <DramaGrid items={items} loading={list.loading} hasMore={list.hasMore} onLoadMore={list.loadMore} />
        )}
      </div>
    </>
  );
}
