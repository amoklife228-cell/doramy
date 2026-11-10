export interface Drama {
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
  airStatus?: string;
}

export type WatchStatus = 'planned' | 'watching' | 'completed' | 'onHold' | 'dropped';

export interface SavedDrama {
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
  status: WatchStatus;
  /** 1..10 или null */
  userRating: number | null;
  episodesWatched: number;
  notes: string;
  isFavorite: boolean;
  addedAt: number;
  updatedAt: number;
}

export interface Country {
  code: string;
  title: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: 'KR', title: 'Корея', flag: '🇰🇷' },
  { code: 'JP', title: 'Япония', flag: '🇯🇵' },
  { code: 'CN', title: 'Китай', flag: '🇨🇳' },
  { code: 'TW', title: 'Тайвань', flag: '🇹🇼' },
  { code: 'TH', title: 'Таиланд', flag: '🇹🇭' },
  { code: 'HK', title: 'Гонконг', flag: '🇭🇰' },
];

export const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));

export const GENRES: { id: number; title: string }[] = [
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

export const GENRE_BY_ID = new Map(GENRES.map((g) => [g.id, g.title]));

export const STATUSES: { id: WatchStatus; title: string; short: string; icon: string }[] = [
  { id: 'planned', title: 'Хочу посмотреть', short: 'Хочу', icon: '🔖' },
  { id: 'watching', title: 'Смотрю', short: 'Смотрю', icon: '▶️' },
  { id: 'completed', title: 'Просмотрено', short: 'Готово', icon: '✅' },
  { id: 'onHold', title: 'Отложено', short: 'Пауза', icon: '⏸️' },
  { id: 'dropped', title: 'Брошено', short: 'Брошено', icon: '✖️' },
];

export const STATUS_BY_ID = new Map(STATUSES.map((s) => [s.id, s]));

export type DiscoverSort = 'popularity.desc' | 'vote_average.desc' | 'first_air_date.desc';

export const SORTS: { id: DiscoverSort; title: string }[] = [
  { id: 'popularity.desc', title: 'По популярности' },
  { id: 'vote_average.desc', title: 'По рейтингу' },
  { id: 'first_air_date.desc', title: 'Сначала новые' },
];

export function countryOf(codes: string[]): Country | undefined {
  return COUNTRIES.find((c) => codes.includes(c.code));
}

export function yearOf(date: string | null | undefined): number | null {
  if (!date || date.length < 4) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

export function localizedAirStatus(status: string | undefined): string | null {
  switch (status) {
    case 'Returning Series':
      return 'Выходит';
    case 'Ended':
      return 'Завершена';
    case 'Canceled':
      return 'Отменена';
    case 'In Production':
      return 'В производстве';
    case 'Planned':
      return 'Запланирована';
    case 'Pilot':
      return 'Пилот';
    default:
      return status ?? null;
  }
}

export function savedToDrama(s: SavedDrama): Drama {
  return {
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
  };
}
