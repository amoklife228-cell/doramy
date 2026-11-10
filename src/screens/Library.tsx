import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Chips } from '../components/Chips';
import { EmptyState } from '../components/DramaGrid';
import { Poster } from '../components/Poster';
import { db, updateEntry } from '../lib/db';
import { openDrama } from '../lib/router';
import {
  countryOf,
  formatRuntime,
  STATUS_BY_ID,
  STATUSES,
  yearOf,
  type MediaType,
  type SavedDrama,
  type WatchStatus,
} from '../lib/types';

type SortId = 'addedNewest' | 'updated' | 'title' | 'userRating' | 'tmdbRating' | 'year' | 'progress';
type TypeFilter = 'all' | MediaType;

const SORTS: { id: SortId; title: string }[] = [
  { id: 'addedNewest', title: 'Недавно добавленные' },
  { id: 'updated', title: 'Недавно изменённые' },
  { id: 'title', title: 'По названию' },
  { id: 'userRating', title: 'По моей оценке' },
  { id: 'tmdbRating', title: 'По рейтингу TMDB' },
  { id: 'year', title: 'По году' },
  { id: 'progress', title: 'По прогрессу' },
];

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Всё' },
  { value: 'tv', label: '📺 Сериалы' },
  { value: 'movie', label: '🎬 Фильмы' },
];

export function progressOf(s: SavedDrama): number | null {
  if (s.mediaType === 'movie') return s.status === 'completed' ? 1 : null;
  if (!s.episodeCount || s.episodeCount <= 0) return null;
  return Math.min(1, s.episodesWatched / s.episodeCount);
}

export function applyQuery(
  items: SavedDrama[],
  q: { type: TypeFilter; status: WatchStatus | ''; favoritesOnly: boolean; search: string; sort: SortId },
): SavedDrama[] {
  const needle = q.search.trim().toLowerCase();
  const filtered = items.filter((s) => {
    if (q.type !== 'all' && s.mediaType !== q.type) return false;
    if (q.status && s.status !== q.status) return false;
    if (q.favoritesOnly && !s.isFavorite) return false;
    if (needle && !s.title.toLowerCase().includes(needle) && !s.originalTitle.toLowerCase().includes(needle)) return false;
    return true;
  });
  const cmp: Record<SortId, (a: SavedDrama, b: SavedDrama) => number> = {
    addedNewest: (a, b) => b.addedAt - a.addedAt,
    updated: (a, b) => b.updatedAt - a.updatedAt,
    title: (a, b) => a.title.localeCompare(b.title, 'ru'),
    userRating: (a, b) => (b.userRating ?? -1) - (a.userRating ?? -1) || b.voteAverage - a.voteAverage,
    tmdbRating: (a, b) => b.voteAverage - a.voteAverage,
    year: (a, b) => (yearOf(b.firstAirDate) ?? 0) - (yearOf(a.firstAirDate) ?? 0),
    progress: (a, b) => (progressOf(b) ?? -1) - (progressOf(a) ?? -1),
  };
  return filtered.sort(cmp[q.sort]);
}

export function Library() {
  const all = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<WatchStatus | ''>('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortId>('addedNewest');

  const items = useMemo(
    () => applyQuery(all, { type, status, favoritesOnly, search, sort }),
    [all, type, status, favoritesOnly, search, sort],
  );

  const counts = useMemo(() => {
    const m = new Map<WatchStatus, number>();
    for (const s of all) if (type === 'all' || s.mediaType === type) m.set(s.status, (m.get(s.status) ?? 0) + 1);
    return m;
  }, [all, type]);

  const total = type === 'all' ? all.length : all.filter((s) => s.mediaType === type).length;
  const hasMovies = all.some((s) => s.mediaType === 'movie');

  const chipOptions = [
    { value: '' as WatchStatus | '', label: 'Все', count: total },
    ...STATUSES.filter((s) => (counts.get(s.id) ?? 0) > 0).map((s) => ({
      value: s.id as WatchStatus | '',
      label: s.short,
      count: counts.get(s.id),
    })),
  ];

  return (
    <>
      <header className="topbar">
        <div className="topbar-row">
          <h1>Библиотека</h1>
          {hasMovies && (
            <div className="segmented" role="tablist">
              {TYPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  role="tab"
                  aria-selected={type === o.value}
                  data-active={type === o.value}
                  onClick={() => setType(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {all.length > 0 && (
          <>
            <div className="topbar-controls">
              <input
                type="search"
                placeholder="Поиск в библиотеке"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select value={sort} onChange={(e) => setSort(e.target.value as SortId)} aria-label="Сортировка">
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="chips-row">
              <Chips value={status} onChange={setStatus} options={chipOptions} />
              <button className="chip" data-active={favoritesOnly} onClick={() => setFavoritesOnly((v) => !v)}>
                ♥ Избранное
              </button>
            </div>
          </>
        )}
      </header>

      <div className="content">
        {all.length === 0 ? (
          <EmptyState
            icon="📚"
            title="Библиотека пуста"
            text="Откройте сериал или фильм в каталоге и нажмите «Добавить в библиотеку»."
          />
        ) : items.length === 0 ? (
          <EmptyState icon="🔎" title="Ничего не найдено" text="Под текущий фильтр нет записей." />
        ) : (
          <ul className="rows">
            {items.map((s) => (
              <LibraryRow key={s.key} item={s} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function LibraryRow({ item }: { item: SavedDrama }) {
  const country = countryOf(item.originCountries);
  const year = yearOf(item.firstAirDate);
  const st = STATUS_BY_ID.get(item.status)!;
  const progress = item.mediaType === 'tv' ? progressOf(item) : null;
  const extra =
    item.mediaType === 'movie'
      ? [formatRuntime(item.runtime), 'фильм'].filter(Boolean).join(', ')
      : item.episodeCount
        ? `${item.episodeCount} эп.`
        : '';

  return (
    <li className="row">
      <button className="row-main" onClick={() => openDrama(item.mediaType, item.tmdbId)}>
        <Poster path={item.posterPath} alt={item.title} size="w185" className="row-poster" />
        <div className="row-body">
          <div className="row-title">{item.title}</div>
          <div className="row-sub">
            {country?.flag} {year ?? ''}
            {extra ? ` · ${extra}` : ''}
          </div>
          <div className="row-meta">
            <span className="status">
              {st.icon} {st.title}
            </span>
            {item.userRating !== null && <span className="rating">★ {item.userRating}</span>}
          </div>
          {item.status === 'watching' && progress !== null && (
            <div className="progress" title={`${item.episodesWatched} из ${item.episodeCount}`}>
              <div className="progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
              <span className="progress-text">
                {item.episodesWatched} / {item.episodeCount}
              </span>
            </div>
          )}
        </div>
      </button>
      <button
        className="row-fav"
        data-active={item.isFavorite}
        aria-label={item.isFavorite ? 'Убрать из избранного' : 'В избранное'}
        onClick={() => void updateEntry(item.key, { isFavorite: !item.isFavorite })}
      >
        {item.isFavorite ? '♥' : '♡'}
      </button>
    </li>
  );
}
