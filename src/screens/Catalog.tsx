import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { DramaGrid, EmptyState, NotConfigured } from '../components/DramaGrid';
import { countActive, FilterSheet } from '../components/FilterSheet';
import { InstallHint } from '../components/InstallHint';
import { Poster } from '../components/Poster';
import { Refreshable } from '../components/Refreshable';
import { db } from '../lib/db';
import { useConfigured, useDebounced } from '../lib/hooks';
import { openDrama } from '../lib/router';
import { backdropUrl, discover, randomPick, recommendations, remember, search } from '../lib/tmdb';
import {
  COUNTRIES,
  countryLabel,
  DEFAULT_FILTERS,
  GENRES_BY_TYPE,
  itemKey,
  MEDIA_TYPES,
  SORTS,
  WORLD,
  yearOf,
  type CatalogFilters,
  type DiscoverSort,
  type Drama,
  type MediaType,
  type SavedDrama,
} from '../lib/types';
import { usePagedList } from '../lib/usePagedList';

const THIS_YEAR = new Date().getFullYear();
const YEARS = [THIS_YEAR, THIS_YEAR - 1, THIS_YEAR - 2].map(String);

/** Карточки жанров на главной каталога: id жанра TMDB, подпись, цвета. */
const GENRE_CARDS: Record<MediaType, { id: number; title: string; from: string; to: string }[]> = {
  tv: [
    { id: 9648, title: 'Детектив', from: '#3b2a6e', to: '#1a1535' },
    { id: 10766, title: 'Мелодрама', from: '#7a2a52', to: '#2d1020' },
    { id: 35, title: 'Комедия', from: '#8a5a12', to: '#2f1f08' },
    { id: 10765, title: 'Фантастика', from: '#14506b', to: '#0a1e2a' },
    { id: 10759, title: 'Боевик', from: '#7a2424', to: '#2b0d0d' },
    { id: 18, title: 'Драма', from: '#2f5d3a', to: '#102015' },
    { id: 10751, title: 'Семейный', from: '#5a4a1f', to: '#1f1a0a' },
    { id: 16, title: 'Анимация', from: '#4a2a7a', to: '#1a0f2d' },
  ],
  movie: [
    { id: 53, title: 'Триллер', from: '#3b2a6e', to: '#1a1535' },
    { id: 10749, title: 'Мелодрама', from: '#7a2a52', to: '#2d1020' },
    { id: 35, title: 'Комедия', from: '#8a5a12', to: '#2f1f08' },
    { id: 878, title: 'Фантастика', from: '#14506b', to: '#0a1e2a' },
    { id: 28, title: 'Боевик', from: '#7a2424', to: '#2b0d0d' },
    { id: 18, title: 'Драма', from: '#2f5d3a', to: '#102015' },
    { id: 27, title: 'Ужасы', from: '#1f1f1f', to: '#0a0a0a' },
    { id: 16, title: 'Анимация', from: '#4a2a7a', to: '#1a0f2d' },
  ],
};

/** Настроение → жанр. */
const MOODS: { title: string; genre: Record<MediaType, number>; sort?: DiscoverSort }[] = [
  { title: 'Посмеяться', genre: { tv: 35, movie: 35 } },
  { title: 'Романтики', genre: { tv: 10766, movie: 10749 } },
  { title: 'Пощекотать нервы', genre: { tv: 9648, movie: 53 } },
  { title: 'Вдохновиться', genre: { tv: 10759, movie: 12 } },
  { title: 'Погрустить', genre: { tv: 18, movie: 18 }, sort: 'topRated' },
];

export function Catalog() {
  const configured = useConfigured();
  const library = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const libraryKeys = useMemo(() => new Set(library.map((s) => s.key)), [library]);

  const [mediaType, setMediaType] = useState<MediaType>('tv');
  const [filters, setFilters] = useState<Record<MediaType, CatalogFilters>>({ tv: DEFAULT_FILTERS, movie: DEFAULT_FILTERS });
  const [text, setText] = useState('');
  const [randomBusy, setRandomBusy] = useState(false);
  const [randomError, setRandomError] = useState<string | null>(null);
  const [homeRefresh, setHomeRefresh] = useState(0);

  useEffect(() => {
    if (!randomError) return;
    const t = setTimeout(() => setRandomError(null), 3000);
    return () => clearTimeout(t);
  }, [randomError]);
  const [filterOpen, setFilterOpen] = useState(false);

  const f = filters[mediaType];
  const setF = (patch: Partial<CatalogFilters>) => setFilters({ ...filters, [mediaType]: { ...f, ...patch } });

  const query = useDebounced(text.trim(), 400);
  const searching = query.length >= 2;
  const activeCount = countActive(f);
  // Сортировка сама по себе не включает режим результатов, остальные фильтры — включают.
  const filtered = countActive({ ...f, sort: 'popular' }) > 0;
  const resultsMode = searching || filtered;

  const key = searching
    ? `${configured}|s:${mediaType}|${f.country}|${query}`
    : `${configured}|d:${mediaType}|${JSON.stringify(f)}`;

  const fetcher = useCallback(
    (page: number, signal: AbortSignal) =>
      searching
        ? search(mediaType, query, f.country, page, signal)
        : discover(
            {
              mediaType,
              country: f.country,
              genre: f.genre,
              year: f.year,
              sort: f.sort,
              status: f.status,
              category: f.category,
              network: f.network,
              page,
            },
            signal,
          ),
    [searching, mediaType, query, f],
  );
  const list = usePagedList(key, configured && resultsMode ? fetcher : null);

  // «Мои сериалы» фильтруем на клиенте: TMDB не знает о библиотеке.
  const shown = useMemo(() => {
    if (!f.mine) return list.items;
    return list.items.filter((d) => libraryKeys.has(itemKey(d.mediaType, d.id)) === (f.mine === 'in'));
  }, [list.items, f.mine, libraryKeys]);

  const reset = () => {
    setF(DEFAULT_FILTERS);
    setText('');
  };

  const pickGenre = (id: number, s?: DiscoverSort) => {
    setF({ genre: String(id), ...(s ? { sort: s } : {}) });
    setText('');
  };

  const onRandom = async () => {
    if (randomBusy) return;
    setRandomBusy(true);
    try {
      const d = await randomPick(mediaType, f.country);
      if (d) {
        remember([d]);
        openDrama(d.mediaType, d.id);
      } else {
        setRandomError('Не нашлось, попробуйте ещё раз');
      }
    } catch {
      setRandomError('Нет соединения, попробуйте позже');
    } finally {
      setRandomBusy(false);
    }
  };

  const chipOptions = [
    ...(resultsMode ? [{ value: '__reset', label: 'Сбросить' }] : []),
    ...YEARS.map((y) => ({ value: `y:${y}`, label: y })),
    { value: `c:${WORLD}`, label: 'Весь мир' },
    ...COUNTRIES.map((c) => ({ value: `c:${c.code}`, label: c.title })),
    ...GENRES_BY_TYPE[mediaType].map((g) => ({ value: `g:${g.id}`, label: g.title })),
  ];
  const activeChips = new Set<string>([
    ...(f.year ? [`y:${f.year}`] : []),
    ...(f.country ? [`c:${f.country}`] : []),
    ...(f.genre ? [`g:${f.genre}`] : []),
  ]);
  const onChip = (v: string) => {
    if (v === '__reset') return reset();
    const [kind, val] = v.split(':');
    if (kind === 'y') setF({ year: f.year === val ? '' : val });
    if (kind === 'c') setF({ country: f.country === val ? '' : val });
    if (kind === 'g') setF({ genre: f.genre === val ? '' : val });
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-row cat-head">
          <span className="profile-bar-spacer" />
          <h1 className="cat-title">{mediaType === 'tv' ? 'Каталог сериалов' : 'Каталог фильмов'}</h1>
          <button className="icon-btn" onClick={() => void onRandom()} aria-label="Случайный выбор" disabled={!configured || randomBusy}>
            <DiceIcon />
          </button>
        </div>

        <div className="search-row">
          <div className="searchbox searchbox-icon">
            <SearchIcon />
            <input
              type="search"
              placeholder={mediaType === 'tv' ? 'Найти сериал по названию' : 'Найти фильм по названию'}
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
          <button className="filter-btn" data-active={activeCount > 0} onClick={() => setFilterOpen(true)} aria-label="Фильтр">
            <SlidersIcon />
            {activeCount > 0 && <span className="filter-badge">{activeCount}</span>}
          </button>
        </div>

        <div className="segmented segmented-wide segmented-accent" role="tablist">
          {MEDIA_TYPES.map((m) => (
            <button key={m.id} role="tab" aria-selected={mediaType === m.id} data-active={mediaType === m.id} onClick={() => setMediaType(m.id)}>
              {m.title}
            </button>
          ))}
        </div>

        <MultiChips options={chipOptions} active={activeChips} onToggle={onChip} />
      </header>

      <Refreshable
        onRefresh={() => {
          if (resultsMode) list.reload();
          else setHomeRefresh((n) => n + 1);
          return new Promise((r) => setTimeout(r, 600));
        }}
      >
        {!configured ? (
          <NotConfigured />
        ) : resultsMode ? (
          <>
            {!searching && (
              <div className="results-bar">
                <span className="muted small">{shown.length ? `Найдено ${list.hasMore ? 'много' : shown.length}` : ''}</span>
                <select value={f.sort} onChange={(e) => setF({ sort: e.target.value as DiscoverSort })} aria-label="Сортировка" className="sort-select">
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {list.error && list.items.length === 0 ? (
              <EmptyState
                title="Не удалось загрузить"
                text={list.error}
                action={
                  <button className="btn btn-primary" onClick={list.reload}>
                    Повторить
                  </button>
                }
              />
            ) : !list.loading && shown.length === 0 && (!list.hasMore || list.pagesLoaded >= 5) ? (
              <EmptyState
                title="Ничего не нашлось"
                text={searching ? `По запросу «${query}» ничего нет${f.country === WORLD ? '' : '. Попробуйте «Весь мир»'}.` : 'Попробуйте другие фильтры.'}
                action={
                  <button className="btn" onClick={reset}>
                    Сбросить фильтры
                  </button>
                }
              />
            ) : (
              // Поиск отсеивает результаты по стране на клиенте: первая страница может оказаться пустой,
              // тогда сторож сетки сам подгрузит следующие (не больше 5 подряд, см. условие выше).
              <DramaGrid
                items={shown}
                loading={list.loading || (shown.length === 0 && list.hasMore)}
                hasMore={list.hasMore}
                onLoadMore={list.loadMore}
                error={list.error}
                onRetry={list.retry}
              />
            )}
          </>
        ) : (
          <>
            <InstallHint />
            <CatalogHome mediaType={mediaType} library={library} onGenre={pickGenre} refreshKey={homeRefresh} />
          </>
        )}
      </Refreshable>

      {randomError && (
        <div className="toast" role="status">
          {randomError}
        </div>
      )}

      <FilterSheet open={filterOpen} mediaType={mediaType} value={f} onApply={(nf) => setF(nf)} onClose={() => setFilterOpen(false)} />
    </>
  );
}

/** Ряд чипов с несколькими активными одновременно. */
function MultiChips({
  options,
  active,
  onToggle,
}: {
  options: { value: string; label: string }[];
  active: Set<string>;
  onToggle: (v: string) => void;
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.value} className="chip" data-active={active.has(o.value)} data-reset={o.value === '__reset'} onClick={() => onToggle(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- главная каталога ---------- */

/* Рекомендации меняются: каждый раз берутся случайные опорные записи из библиотеки, страницы TMDB
   и порядок перемешиваются, а недавно показанное уходит в конец очереди. Подборка живёт 20 минут,
   потом обновляется сама при возвращении на экран; кнопка «Обновить» и потягивание вниз — сразу. */

const REC_COUNT = 12;
const REC_TTL = 20 * 60 * 1000;
const SHOWN_LIMIT = 48;
const recCache = new Map<MediaType, { items: Drama[]; title: string; at: number; personal: boolean }>();

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shownKey(mediaType: MediaType) {
  return `doramy.recs.shown.${mediaType}`;
}

/** Ключи, показанные в последних подборках (свежие в начале). */
function readShown(mediaType: MediaType): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(shownKey(mediaType)) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function rememberShown(mediaType: MediaType, keys: string[]) {
  const next = [...keys, ...readShown(mediaType).filter((k) => !keys.includes(k))].slice(0, SHOWN_LIMIT);
  try {
    localStorage.setItem(shownKey(mediaType), JSON.stringify(next));
  } catch {
    // приватный режим: просто не запоминаем
  }
}

/** Новые сначала, уже показанные — только если новых не хватило. */
function pickFresh(candidates: Drama[], exclude: Set<string>, shown: Set<string>, count: number): Drama[] {
  const fresh: Drama[] = [];
  const seenBefore: Drama[] = [];
  const used = new Set<string>();
  for (const d of candidates) {
    const k = itemKey(d.mediaType, d.id);
    if (used.has(k) || exclude.has(k)) continue;
    used.add(k);
    (shown.has(k) ? seenBefore : fresh).push(d);
  }
  return [...fresh, ...shuffle(seenBefore)].slice(0, count);
}

async function buildRecs(
  mediaType: MediaType,
  anchors: SavedDrama[],
  libraryKeys: Set<string>,
  signal: AbortSignal,
): Promise<{ items: Drama[]; title: string; personal: boolean }> {
  const shown = new Set(readShown(mediaType));
  let personal: Drama[] = [];

  if (anchors.length) {
    // Избранное чаще попадает в опору, но каждый раз в другом составе.
    const favorites = shuffle(anchors.filter((s) => s.isFavorite));
    const others = shuffle(anchors.filter((s) => !s.isFavorite));
    const picked = shuffle([...favorites.slice(0, 2), ...others].slice(0, 4).concat(favorites.slice(2)).slice(0, 4));
    const lists = await Promise.all(
      picked.map((s) =>
        recommendations(mediaType, s.tmdbId, signal, Math.random() < 0.5 ? 1 : 2)
          .then(shuffle)
          .catch(() => [] as Drama[]),
      ),
    );
    // По одному из каждого источника по кругу, чтобы не доминировал один сериал.
    const mixed: Drama[] = [];
    for (let i = 0; i < 20; i++) for (const l of lists) if (l[i]) mixed.push(l[i]);
    personal = pickFresh(mixed, libraryKeys, shown, REC_COUNT);
  }

  let items = personal;
  if (items.length < REC_COUNT) {
    // Мало своих — добираем популярным со случайной страницы.
    const page = 1 + Math.floor(Math.random() * 5);
    const r = await discover({ mediaType, country: '', genre: '', sort: 'popular', page }, signal).catch(() => null);
    const extra = pickFresh(shuffle(r?.items ?? []), new Set([...libraryKeys, ...items.map((d) => itemKey(d.mediaType, d.id))]), shown, REC_COUNT - items.length);
    items = [...items, ...extra];
  }

  rememberShown(mediaType, items.map((d) => itemKey(d.mediaType, d.id)));
  const isPersonal = personal.length > 0;
  return { items, title: isPersonal ? 'Рекомендации для тебя' : 'Популярное сейчас', personal: isPersonal };
}

function CatalogHome({
  mediaType,
  library,
  onGenre,
  refreshKey,
}: {
  mediaType: MediaType;
  library: SavedDrama[];
  onGenre: (id: number, sort?: DiscoverSort) => void;
  refreshKey: number;
}) {
  const configured = useConfigured();
  // Опора для рекомендаций: избранное, просмотренное и то, что смотрю, этого типа.
  const anchors = useMemo(
    () =>
      library.filter(
        (s) => s.mediaType === mediaType && (s.isFavorite || s.status === 'completed' || s.status === 'watching'),
      ),
    [library, mediaType],
  );
  const libraryKeys = useMemo(() => new Set(library.map((s) => s.key)), [library]);
  const hasAnchors = anchors.length > 0;

  const [recs, setRecs] = useState<{ title: string; items: Drama[] } | null>(() => recCache.get(mediaType) ?? null);
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef({ anchors, libraryKeys, hasAnchors });
  latest.current = { anchors, libraryKeys, hasAnchors };

  const load = useCallback(
    (force: boolean) => {
      if (!configured) return;
      const cached = recCache.get(mediaType);
      const stale =
        !cached || Date.now() - cached.at > REC_TTL || (latest.current.hasAnchors && !cached.personal);
      if (cached && !force && !stale) {
        setRecs(cached);
        return;
      }
      if (cached) setRecs(cached);
      controller.current?.abort();
      const c = new AbortController();
      controller.current = c;
      setLoading(true);
      buildRecs(mediaType, latest.current.anchors, latest.current.libraryKeys, c.signal)
        .then((r) => {
          if (c.signal.aborted) return;
          remember(r.items);
          const entry = { ...r, at: Date.now() };
          recCache.set(mediaType, entry);
          setRecs(entry);
        })
        .catch(() => undefined)
        .finally(() => {
          if (controller.current === c) setLoading(false);
        });
    },
    [configured, mediaType],
  );

  // Открытие экрана и смена «Сериалы/Фильмы»: из кэша, если он свежий.
  // Появилась первая опорная запись — сразу переключаемся с популярного на личные рекомендации.
  useEffect(() => {
    load(false);
    return () => controller.current?.abort();
  }, [load, hasAnchors]);

  // Потягивание вниз на главной каталога.
  const lastRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (lastRefreshKey.current === refreshKey) return;
    lastRefreshKey.current = refreshKey;
    load(true);
  }, [refreshKey, load]);

  // Вернулись в приложение спустя время — подборка обновится, если устарела.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && load(false);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  // Добавленное в библиотеку сразу пропадает из подборки, без нового запроса.
  const shownItems = useMemo(
    () => (recs?.items ?? []).filter((d) => !libraryKeys.has(itemKey(d.mediaType, d.id))),
    [recs, libraryKeys],
  );

  const moodBg = recs?.items.find((d) => d.backdropPath)?.backdropPath ?? null;

  return (
    <div className="home">
      <div className="genre-cards">
        {GENRE_CARDS[mediaType].map((g) => (
          <button key={g.id} className="genre-card" style={{ background: `linear-gradient(160deg, ${g.from}, ${g.to})` }} onClick={() => onGenre(g.id)}>
            <span>{g.title}</span>
            <GenreArt id={g.id} />
          </button>
        ))}
      </div>

      <section className="pblock">
        <div className="home-head">
          <h2 className="home-h2">{recs?.title ?? 'Рекомендации для тебя'}</h2>
          {configured && (
            <button
              className="icon-btn refresh-btn"
              onClick={() => load(true)}
              disabled={loading}
              aria-label="Обновить рекомендации"
              title="Обновить"
            >
              <RefreshIcon spinning={loading} />
            </button>
          )}
        </div>
        {loading && !recs ? (
          <div className="rec-strip" aria-busy="true">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="rec" aria-hidden="true">
                <div className="rec-img skeleton" />
                <div className="skeleton skeleton-line" style={{ width: '70%', marginTop: 8 }} />
              </div>
            ))}
          </div>
        ) : shownItems.length > 0 ? (
          <div className="rec-strip" data-loading={loading}>
            {shownItems.map((d) => (
              <RecCard key={itemKey(d.mediaType, d.id)} drama={d} />
            ))}
          </div>
        ) : (
          <p className="muted small">Пока нечего посоветовать.</p>
        )}
      </section>

      <section className="moods" style={moodBg ? { backgroundImage: `url(${backdropUrl(moodBg)})` } : undefined}>
        <div className="moods-inner">
          {MOODS.map((m) => (
            <button key={m.title} className="mood" onClick={() => onGenre(m.genre[mediaType], m.sort)}>
              {m.title}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className="refresh-icon"
      data-spin={spinning}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4.5h-4.5" />
    </svg>
  );
}

function RecCard({ drama }: { drama: Drama }) {
  const year = yearOf(drama.firstAirDate);
  const bd = backdropUrl(drama.backdropPath);
  return (
    <button className="rec" onClick={() => openDrama(drama.mediaType, drama.id)}>
      <div className="rec-img">
        {bd ? <img src={bd} alt={drama.title} loading="lazy" decoding="async" /> : <Poster path={drama.posterPath} alt={drama.title} size="w342" />}
        {drama.voteAverage > 0 && <span className="rec-badge">★ {drama.voteAverage.toFixed(1)}</span>}
      </div>
      <div className="rec-title">{drama.title}</div>
      <div className="rec-sub">{[year, countryLabel(drama.originCountries)].filter(Boolean).join(' · ')}</div>
    </button>
  );
}

/** Простая геометрическая иллюстрация жанра: без эмодзи и картинок. */
function GenreArt({ id }: { id: number }) {
  return (
    <svg className="genre-art" viewBox="0 0 100 100" aria-hidden>
      {id === 9648 || id === 53 ? (
        <>
          <circle cx="42" cy="42" r="22" />
          <path d="M58 58l24 24" strokeWidth="10" />
        </>
      ) : id === 10766 || id === 10749 ? (
        <path d="M50 84L22 56a16 16 0 0 1 28-16 16 16 0 0 1 28 16z" />
      ) : id === 35 ? (
        <>
          <circle cx="50" cy="50" r="30" />
          <path d="M34 58q16 16 32 0" strokeWidth="6" fill="none" />
        </>
      ) : id === 10765 || id === 878 ? (
        <>
          <circle cx="50" cy="50" r="18" />
          <ellipse cx="50" cy="50" rx="42" ry="12" fill="none" strokeWidth="5" />
        </>
      ) : id === 10759 || id === 28 || id === 12 ? (
        <path d="M20 80L70 30l10 10-50 50zM66 26l12-6-6 12z" />
      ) : id === 18 ? (
        <>
          <path d="M22 30h56v40H22z" />
          <path d="M22 70l14 12 8-12" />
        </>
      ) : id === 10751 ? (
        <>
          <circle cx="36" cy="40" r="12" />
          <circle cx="64" cy="40" r="12" />
          <path d="M20 84q30-30 60 0z" />
        </>
      ) : id === 27 ? (
        <path d="M30 86V46a20 20 0 0 1 40 0v40l-8-8-8 8-8-8-8 8-8-8z" />
      ) : (
        <path d="M30 24l44 26-44 26z" />
      )}
    </svg>
  );
}

function DiceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="search-icon" viewBox="0 0 24 24" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h12M20 17h0" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="18" cy="17" r="2" />
    </svg>
  );
}
