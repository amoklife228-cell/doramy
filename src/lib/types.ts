export type MediaType = 'tv' | 'movie';

export const MEDIA_TYPES: { id: MediaType; title: string; one: string }[] = [
  { id: 'tv', title: 'Сериалы', one: 'Сериал' },
  { id: 'movie', title: 'Фильмы', one: 'Фильм' },
];

export interface Drama {
  mediaType: MediaType;
  id: number;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  /** "YYYY-MM-DD" или null */
  firstAirDate: string | null;
  voteAverage: number;
  voteCount: number;
  originCountries: string[];
  genreNames: string[];
  episodeCount?: number;
  seasonCount?: number;
  /** Длительность фильма в минутах */
  runtime?: number;
  /** Длительность одной серии в минутах (сериалы) */
  episodeRuntime?: number;
  airStatus?: string;
  /** Ближайшая серия, если сериал ещё выходит */
  nextEpisode?: { airDate: string; number: number; season: number; name: string };
}

export type WatchStatus = 'planned' | 'watching' | 'completed' | 'onHold' | 'dropped';

export interface SavedDrama {
  /** `${mediaType}:${tmdbId}` — у фильмов и сериалов TMDB id пересекаются. */
  key: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  firstAirDate: string | null;
  voteAverage: number;
  voteCount: number;
  originCountries: string[];
  genreNames: string[];
  episodeCount?: number;
  runtime?: number;
  episodeRuntime?: number;
  /** Раздел библиотеки, выбранный вручную. Нет — определяется автоматически (kindOf). */
  kind?: LibraryKind;
  status: WatchStatus;
  /** 1..10 или null */
  userRating: number | null;
  episodesWatched: number;
  notes: string;
  isFavorite: boolean;
  addedAt: number;
  updatedAt: number;
}

export function itemKey(mediaType: MediaType, id: number): string {
  return `${mediaType}:${id}`;
}

export interface Country {
  code: string;
  title: string;
}

export const COUNTRIES: Country[] = [
  { code: 'KR', title: 'Корея' },
  { code: 'JP', title: 'Япония' },
  { code: 'CN', title: 'Китай' },
  { code: 'TW', title: 'Тайвань' },
  { code: 'TH', title: 'Таиланд' },
  { code: 'HK', title: 'Гонконг' },
];

/** Название страны для подписи под карточкой; для стран вне списка — код. */
export function countryLabel(codes: string[]): string {
  const known = countryOf(codes);
  if (known) return known.title;
  return codes[0] ?? '';
}

export const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));

/** Специальное значение фильтра страны: без ограничения по стране. */
export const WORLD = 'world';

/** Язык оригинала → страна, когда TMDB не отдаёт origin_country (списки фильмов). */
export const LANG_TO_COUNTRY: Record<string, string> = {
  ko: 'KR',
  ja: 'JP',
  zh: 'CN',
  th: 'TH',
  cn: 'HK',
};

export const TV_GENRES: { id: number; title: string }[] = [
  { id: 18, title: 'Драма' },
  { id: 35, title: 'Комедия' },
  { id: 9648, title: 'Детектив' },
  { id: 80, title: 'Криминал' },
  { id: 10765, title: 'Фантастика и фэнтези' },
  { id: 10759, title: 'Боевик и приключения' },
  { id: 10751, title: 'Семейный' },
  { id: 16, title: 'Анимация' },
  { id: 10766, title: 'Мелодрама' },
  { id: 10764, title: 'Реалити' },
];

export const MOVIE_GENRES: { id: number; title: string }[] = [
  { id: 18, title: 'Драма' },
  { id: 10749, title: 'Мелодрама' },
  { id: 35, title: 'Комедия' },
  { id: 53, title: 'Триллер' },
  { id: 9648, title: 'Детектив' },
  { id: 80, title: 'Криминал' },
  { id: 28, title: 'Боевик' },
  { id: 12, title: 'Приключения' },
  { id: 14, title: 'Фэнтези' },
  { id: 878, title: 'Фантастика' },
  { id: 27, title: 'Ужасы' },
  { id: 36, title: 'История' },
  { id: 10752, title: 'Военный' },
  { id: 10751, title: 'Семейный' },
  { id: 16, title: 'Анимация' },
];

export const GENRES_BY_TYPE: Record<MediaType, { id: number; title: string }[]> = {
  tv: TV_GENRES,
  movie: MOVIE_GENRES,
};

export const GENRE_BY_ID = new Map([...TV_GENRES, ...MOVIE_GENRES].map((g) => [g.id, g.title]));

export const STATUSES: { id: WatchStatus; title: string; short: string }[] = [
  { id: 'planned', title: 'Хочу посмотреть', short: 'Хочу' },
  { id: 'watching', title: 'Смотрю', short: 'Смотрю' },
  { id: 'completed', title: 'Просмотрено', short: 'Готово' },
  { id: 'onHold', title: 'Отложено', short: 'Пауза' },
  { id: 'dropped', title: 'Брошено', short: 'Брошено' },
];

export const STATUS_BY_ID = new Map(STATUSES.map((s) => [s.id, s]));

export type DiscoverSort = 'popular' | 'topRated' | 'newest';

export const SORTS: { id: DiscoverSort; title: string }[] = [
  { id: 'popular', title: 'По популярности' },
  { id: 'topRated', title: 'По рейтингу' },
  { id: 'newest', title: 'Сначала новые' },
];

/** Раздел библиотеки: азиатские сериалы — дорамы, остальные сериалы отдельно, фильмы отдельно. */
export type LibraryKind = 'dorama' | 'series' | 'movie';

export const LIBRARY_KINDS: { id: LibraryKind; title: string; empty: string }[] = [
  { id: 'dorama', title: 'Дорамы', empty: 'Дорам пока нет. Откройте каталог сериалов и добавьте первую.' },
  { id: 'series', title: 'Сериалы', empty: 'Сериалов из других стран пока нет. В каталоге выберите «Весь мир».' },
  { id: 'movie', title: 'Фильмы', empty: 'Фильмов пока нет. Переключите каталог на «Фильмы».' },
];

export function kindOf(item: { mediaType: MediaType; originCountries: string[]; kind?: LibraryKind }): LibraryKind {
  if (item.kind) return item.kind;
  return autoKindOf(item);
}

/** Раздел «по умолчанию», без учёта ручного выбора. */
export function autoKindOf(item: { mediaType: MediaType; originCountries: string[] }): LibraryKind {
  if (item.mediaType === 'movie') return 'movie';
  // Страна неизвестна — считаем дорамой: каталог по умолчанию показывает Азию.
  if (item.originCountries.length === 0 || item.originCountries.some((c) => COUNTRY_CODES.has(c))) return 'dorama';
  return 'series';
}

export function countryOf(codes: string[]): Country | undefined {
  return COUNTRIES.find((c) => codes.includes(c.code));
}

export function yearOf(date: string | null | undefined): number | null {
  if (!date || date.length < 4) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

export function localizedAirStatus(status: string | undefined, mediaType: MediaType): string | null {
  switch (status) {
    case 'Returning Series':
      return 'Выходит';
    case 'Ended':
      return 'Завершён';
    case 'Canceled':
      return 'Отменён';
    case 'In Production':
      return 'В производстве';
    case 'Post Production':
      return 'Постпродакшн';
    case 'Planned':
      return 'Запланирован';
    case 'Rumored':
      return 'Слухи';
    case 'Pilot':
      return 'Пилот';
    case 'Released':
      return mediaType === 'movie' ? 'Вышел' : 'Вышло';
    default:
      return status ?? null;
  }
}

export function formatRuntime(minutes: number | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} ч ${m ? `${m} мин` : ''}`.trim() : `${m} мин`;
}

export function savedToDrama(s: SavedDrama): Drama {
  return {
    mediaType: s.mediaType,
    id: s.tmdbId,
    title: s.title,
    originalTitle: s.originalTitle,
    overview: s.overview,
    posterPath: s.posterPath,
    backdropPath: null,
    firstAirDate: s.firstAirDate,
    voteAverage: s.voteAverage,
    voteCount: s.voteCount,
    originCountries: s.originCountries,
    genreNames: s.genreNames,
    episodeCount: s.episodeCount,
    runtime: s.runtime,
    episodeRuntime: s.episodeRuntime,
  };
}

/** Сколько минут занимает одна «единица просмотра»: серия или фильм. Если TMDB не знает — средние значения. */
export function minutesPerUnit(item: { mediaType: MediaType; runtime?: number; episodeRuntime?: number }): number {
  if (item.mediaType === 'movie') return item.runtime && item.runtime > 0 ? item.runtime : 110;
  return item.episodeRuntime && item.episodeRuntime > 0 ? item.episodeRuntime : 60;
}

/** Запись активности за день: сколько серий (фильм = 1) и минут посмотрено. */
export interface ActivityDay {
  /** "YYYY-MM-DD" в локальном времени */
  day: string;
  units: number;
  minutes: number;
  updatedAt: number;
}

export function todayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
