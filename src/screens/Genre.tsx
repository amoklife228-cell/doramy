import { useCallback, useEffect, useState } from 'react';
import { DramaGrid, EmptyState, NotConfigured } from '../components/DramaGrid';
import { NavBar } from '../components/NavBar';
import { Refreshable } from '../components/Refreshable';
import { GENRE_KINDS, GENRES, genreFor, isGenreSlug, kindMediaType, useGenreArt } from '../lib/genres';
import { useConfigured } from '../lib/hooks';
import { goBack, replaceGenre } from '../lib/router';
import { discover } from '../lib/tmdb';
import { WORLD, type DiscoverSort, type LibraryKind } from '../lib/types';
import { usePagedList } from '../lib/usePagedList';

const GENRE_SORTS: { id: DiscoverSort; title: string }[] = [
  { id: 'popular', title: 'Популярные' },
  { id: 'topRated', title: 'Лучшие' },
  { id: 'newest', title: 'Новые' },
];

/**
 * Каталог жанра: открывается по картинке жанра на главной каталога.
 * Сверху кадр жанра, ниже — разделы «Дорамы / Сериалы / Фильмы», сортировка и сетка без аниме и шоу.
 */
export function Genre({ kind: routeKind, slug, sort }: { kind: LibraryKind; slug: string; sort: DiscoverSort }) {
  const configured = useConfigured();
  const genre = isGenreSlug(slug) ? GENRES[slug] : null;

  // Разделы, где такой жанр есть (сериалов-ужасов в TMDB нет).
  const kinds = genre ? GENRE_KINDS.filter((k) => genreFor(genre, k.id) !== null) : [];
  const kindInfo = kinds.find((k) => k.id === routeKind) ?? kinds[0];
  const kind = kindInfo?.id ?? routeKind;
  const mediaType = kindMediaType(kind);
  const tmdbGenre = genre ? genreFor(genre, kind) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && goBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const art = useGenreArt(mediaType, configured);
  const backdrop = genre ? art[genre.slug] : undefined;

  const fetcher = useCallback(
    (page: number, signal: AbortSignal) =>
      discover({ mediaType, country: kindInfo?.world ? WORLD : '', genre: tmdbGenre ?? '', sort, page }, signal),
    [mediaType, kindInfo?.world, tmdbGenre, sort],
  );
  const list = usePagedList(`${configured}|genre:${kind}:${slug}:${sort}`, configured && tmdbGenre ? fetcher : null);

  if (!genre || !kindInfo) {
    return (
      <div className="detail" role="dialog" aria-modal="true">
        <NavBar backLabel="Каталог" />
        <div className="detail-content ios-page">
          <EmptyState title="Жанр не найден" />
        </div>
      </div>
    );
  }

  return (
    <div className="detail genre-page" role="dialog" aria-modal="true" aria-label={genre.pageTitle}>
      <NavBar backLabel="Каталог" />
      <Refreshable
        className="detail-content ios-page"
        onRefresh={() => {
          list.reload();
          return new Promise((r) => setTimeout(r, 600));
        }}
      >
        <div className="genre-hero" style={{ background: `linear-gradient(160deg, ${genre.from}, ${genre.to})` }}>
          {backdrop && <HeroImage key={backdrop} path={backdrop} />}
          <div className="genre-hero-text">
            <h1 className="genre-hero-title">{genre.pageTitle}</h1>
            <p className="genre-hero-sub">{kindInfo.subtitle}</p>
          </div>
        </div>

        {kinds.length > 1 && (
          <div className="segmented segmented-wide segmented-accent genre-kinds" role="tablist" aria-label="Раздел">
            {kinds.map((k) => (
              <button
                key={k.id}
                role="tab"
                aria-selected={k.id === kind}
                data-active={k.id === kind}
                onClick={() => replaceGenre(k.id, genre.slug, sort)}
              >
                {k.title}
              </button>
            ))}
          </div>
        )}

        <div className="chips genre-sorts" role="tablist" aria-label="Сортировка">
          {GENRE_SORTS.map((s) => (
            <button
              key={s.id}
              role="tab"
              className="chip"
              aria-selected={s.id === sort}
              data-active={s.id === sort}
              onClick={() => replaceGenre(kind, genre.slug, s.id)}
            >
              {s.title}
            </button>
          ))}
        </div>

        {!configured ? (
          <NotConfigured />
        ) : list.error && list.items.length === 0 ? (
          <EmptyState
            title="Не удалось загрузить"
            text={list.error}
            action={
              <button className="btn btn-primary" onClick={list.reload}>
                Повторить
              </button>
            }
          />
        ) : !list.loading && list.items.length === 0 && !list.hasMore ? (
          <EmptyState title="Пока пусто" text="В этом разделе ничего не нашлось. Попробуйте другой." />
        ) : (
          <DramaGrid
            items={list.items}
            loading={list.loading}
            placeholder={list.items.length === 0 && list.hasMore}
            hasMore={list.hasMore}
            onLoadMore={list.loadMore}
            error={list.error}
            onRetry={list.retry}
          />
        )}
      </Refreshable>
    </div>
  );
}

/** Кадр жанра плавно проявляется; при смене раздела — новый кадр со своим проявлением. */
function HeroImage({ path }: { path: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      className="genre-hero-img"
      src={`https://image.tmdb.org/t/p/w1280${path}`}
      alt=""
      decoding="async"
      draggable={false}
      data-loaded={loaded}
      onLoad={() => setLoaded(true)}
    />
  );
}
