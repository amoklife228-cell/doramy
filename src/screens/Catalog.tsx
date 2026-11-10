import { useCallback, useState } from 'react';
import { Chips } from '../components/Chips';
import { DramaGrid, EmptyState, NotConfigured } from '../components/DramaGrid';
import { useConfigured } from '../lib/hooks';
import { discover } from '../lib/tmdb';
import { COUNTRIES, GENRES, SORTS, type DiscoverSort } from '../lib/types';
import { usePagedList } from '../lib/usePagedList';

export function Catalog() {
  const configured = useConfigured();
  const [country, setCountry] = useState('');
  const [genre, setGenre] = useState('');
  const [sort, setSort] = useState<DiscoverSort>('popularity.desc');

  const key = `${configured}|${country}|${genre}|${sort}`;
  const fetcher = useCallback(
    (page: number, signal: AbortSignal) => discover({ country, genre, sort, page }, signal),
    [country, genre, sort],
  );
  const list = usePagedList(key, configured ? fetcher : null);

  return (
    <>
      <header className="topbar">
        <h1>Дорамы</h1>
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
        ) : !list.loading && list.items.length === 0 ? (
          <EmptyState icon="📺" title="Ничего не найдено" text="Попробуйте другую страну или жанр." />
        ) : (
          <DramaGrid items={list.items} loading={list.loading} hasMore={list.hasMore} onLoadMore={list.loadMore} />
        )}
      </div>
    </>
  );
}
