import { useEffect, useState } from 'react';
import { discoverAsia } from './tmdb';
import { DRAMA_TV_TYPES, NOT_DRAMA, type LibraryKind, type MediaType } from './types';

/* Жанровые каталоги: карточка-картинка на главной каталога открывает страницу жанра
   (#/genre/<dorama|series|movie>/<slug>) с переключателем «Дорамы / Сериалы / Фильмы». */

export type GenreSlug =
  | 'detective'
  | 'romance'
  | 'comedy'
  | 'fantasy'
  | 'action'
  | 'drama'
  | 'family'
  | 'animation'
  | 'thriller'
  | 'horror';

export interface GenreCatalog {
  slug: GenreSlug;
  /** Подпись на карточке. */
  title: string;
  /** Заголовок страницы жанра. */
  pageTitle: string;
  /** with_genres TMDB для сериалов и фильмов ('a|b' — любой из); нет — такого жанра у этого типа нет. */
  tv?: string;
  movie?: string;
  from: string;
  to: string;
}

export const GENRES: Record<GenreSlug, GenreCatalog> = {
  detective: { slug: 'detective', title: 'Детектив', pageTitle: 'Детективы', tv: '9648', movie: '9648', from: '#3b2a6e', to: '#1a1535' },
  romance: { slug: 'romance', title: 'Мелодрама', pageTitle: 'Мелодрамы', tv: '10766', movie: '10749', from: '#7a2a52', to: '#2d1020' },
  comedy: { slug: 'comedy', title: 'Комедия', pageTitle: 'Комедии', tv: '35', movie: '35', from: '#8a5a12', to: '#2f1f08' },
  fantasy: { slug: 'fantasy', title: 'Фантастика', pageTitle: 'Фантастика и фэнтези', tv: '10765', movie: '878|14', from: '#14506b', to: '#0a1e2a' },
  action: { slug: 'action', title: 'Боевик', pageTitle: 'Боевики и приключения', tv: '10759', movie: '28|12', from: '#7a2424', to: '#2b0d0d' },
  drama: { slug: 'drama', title: 'Драма', pageTitle: 'Драмы', tv: '18', movie: '18', from: '#2f5d3a', to: '#102015' },
  family: { slug: 'family', title: 'Семейный', pageTitle: 'Для всей семьи', tv: '10751', movie: '10751', from: '#5a4a1f', to: '#1f1a0a' },
  animation: { slug: 'animation', title: 'Анимация', pageTitle: 'Анимация', tv: '16', movie: '16', from: '#4a2a7a', to: '#1a0f2d' },
  thriller: { slug: 'thriller', title: 'Триллер', pageTitle: 'Триллеры и криминал', tv: '80', movie: '53|80', from: '#3b2a6e', to: '#1a1535' },
  horror: { slug: 'horror', title: 'Ужасы', pageTitle: 'Ужасы', movie: '27', from: '#1f1f1f', to: '#0a0a0a' },
};

export function isGenreSlug(s: string): s is GenreSlug {
  return Object.prototype.hasOwnProperty.call(GENRES, s);
}

/** Карточки на главной каталога для вкладок «Сериалы» и «Фильмы». */
export const GENRE_CARDS: Record<MediaType, GenreSlug[]> = {
  tv: ['detective', 'romance', 'comedy', 'fantasy', 'action', 'drama', 'family', 'animation'],
  movie: ['thriller', 'romance', 'comedy', 'fantasy', 'action', 'drama', 'horror', 'animation'],
};

/** Разделы страницы жанра — те же, что в библиотеке. */
export const GENRE_KINDS: { id: LibraryKind; title: string; mediaType: MediaType; world: boolean; subtitle: string }[] = [
  { id: 'dorama', title: 'Дорамы', mediaType: 'tv', world: false, subtitle: 'Корея, Япония, Китай, Тайвань, Таиланд, Гонконг' },
  { id: 'series', title: 'Сериалы', mediaType: 'tv', world: true, subtitle: 'Сериалы со всего мира' },
  { id: 'movie', title: 'Фильмы', mediaType: 'movie', world: false, subtitle: 'Азиатское кино' },
];

export function kindMediaType(kind: LibraryKind): MediaType {
  return kind === 'movie' ? 'movie' : 'tv';
}

/** Жанр в TMDB для раздела; null — у раздела такого жанра нет (ужасов-сериалов в TMDB нет). */
export function genreFor(g: GenreCatalog, kind: LibraryKind): string | null {
  return (kindMediaType(kind) === 'movie' ? g.movie : g.tv) ?? null;
}

/* ---------- кадры для карточек жанров ----------
 * Каждой карточке — кадр (backdrop) из самого популярного азиатского сериала или фильма этого жанра.
 * Кадры не повторяются между жанрами и хранятся на устройстве неделю, поэтому появляются сразу.
 */

export type GenreArt = Partial<Record<GenreSlug, string>>; // slug → backdrop_path
const GENRE_ART_KEY = 'doramy.genreArt.v3.';
const GENRE_ART_TTL = 7 * 24 * 60 * 60 * 1000;

export function readGenreArt(mediaType: MediaType): GenreArt | null {
  try {
    const raw = JSON.parse(localStorage.getItem(GENRE_ART_KEY + mediaType) ?? 'null') as { at: number; art: GenreArt } | null;
    return raw && Date.now() - raw.at < GENRE_ART_TTL ? raw.art : null;
  } catch {
    return null;
  }
}

function writeGenreArt(mediaType: MediaType, art: GenreArt) {
  try {
    localStorage.setItem(GENRE_ART_KEY + mediaType, JSON.stringify({ at: Date.now(), art }));
  } catch {
    // приватный режим: просто загрузим заново в следующий раз
  }
}

async function loadGenreArt(mediaType: MediaType, signal: AbortSignal): Promise<{ art: GenreArt; complete: boolean }> {
  const slugs = GENRE_CARDS[mediaType];
  const lists = await Promise.all(
    slugs.map((slug) =>
      discoverAsia(
        mediaType,
        {
          with_genres: genreFor(GENRES[slug], mediaType === 'movie' ? 'movie' : 'dorama') ?? '',
          sort_by: 'popularity.desc',
          'vote_count.gte': mediaType === 'tv' ? '80' : '300',
          // Аниме или реалити в «Драме» и «Комедии» выглядят чужими; у «Анимации» — наоборот.
          ...(slug === 'animation' ? {} : { without_genres: NOT_DRAMA[mediaType].join(',') }),
          ...(mediaType === 'tv' ? { with_type: DRAMA_TV_TYPES } : {}),
        },
        1,
        signal,
        0, // нужны только кадры, русские названия не ищем
      ).catch((e: Error) => {
        if (e.name === 'AbortError') throw e;
        return null;
      }),
    ),
  );
  // Раздаём по очереди: каждому жанру — самый популярный кадр, ещё не занятый другим жанром.
  const used = new Set<string>();
  const art: GenreArt = {};
  slugs.forEach((slug, i) => {
    const pick = (lists[i]?.items ?? []).find((d) => d.backdropPath && !used.has(d.backdropPath));
    if (pick?.backdropPath) {
      used.add(pick.backdropPath);
      art[slug] = pick.backdropPath;
    }
  });
  return { art, complete: lists.every((l) => l !== null) };
}

export function useGenreArt(mediaType: MediaType, enabled: boolean): GenreArt {
  const [art, setArt] = useState<GenreArt>(() => readGenreArt(mediaType) ?? {});
  useEffect(() => {
    const cached = readGenreArt(mediaType);
    setArt(cached ?? {});
    if (cached || !enabled) return;
    const controller = new AbortController();
    loadGenreArt(mediaType, controller.signal)
      .then(({ art: a, complete }) => {
        if (Object.keys(a).length === 0) return;
        // Неполный набор (часть запросов не прошла) показываем, но не запоминаем на неделю.
        if (complete) writeGenreArt(mediaType, a);
        setArt(a);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [mediaType, enabled]);
  return art;
}
