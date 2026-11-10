import {
  COUNTRIES,
  COUNTRY_CODES,
  GENRE_BY_ID,
  itemKey,
  LANG_TO_COUNTRY,
  WORLD,
  type DiscoverSort,
  type Drama,
  type MediaType,
} from './types';

const BASE = 'https://api.themoviedb.org/3';
const KEY_STORAGE = 'doramy.tmdb.apiKey';
const TOKEN_STORAGE = 'doramy.tmdb.token';
export const CONFIG_EVENT = 'doramy:config';

export interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
}

export class TMDBError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

function safeGet(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

/** Ключ, вшитый в приложение: работает у всех без настройки. Свой ключ в «Настройках» имеет приоритет. */
export const BUILTIN_KEY: string = (import.meta.env.VITE_TMDB_KEY as string | undefined)?.trim() ?? '';

export function getCredential(): string {
  return safeGet(TOKEN_STORAGE) || safeGet(KEY_STORAGE) || BUILTIN_KEY;
}

export function hasOwnCredential(): boolean {
  return (safeGet(TOKEN_STORAGE) || safeGet(KEY_STORAGE)).length > 0;
}

export function isConfigured(): boolean {
  return getCredential().length > 0;
}

/** Принимает и короткий API Key (v3), и длинный Read Access Token (v4, начинается с eyJ). */
export function saveCredential(value: string) {
  const v = value.trim();
  try {
    if (v.startsWith('eyJ')) {
      localStorage.setItem(TOKEN_STORAGE, v);
      localStorage.removeItem(KEY_STORAGE);
    } else {
      localStorage.setItem(KEY_STORAGE, v);
      localStorage.removeItem(TOKEN_STORAGE);
    }
  } catch {
    // приватный режим: ключ проживёт до перезагрузки
  }
  window.dispatchEvent(new Event(CONFIG_EVENT));
}

export function clearCredential() {
  try {
    localStorage.removeItem(TOKEN_STORAGE);
    localStorage.removeItem(KEY_STORAGE);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(CONFIG_EVENT));
}

async function fetchJSON<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  let token = safeGet(TOKEN_STORAGE);
  let apiKey = safeGet(KEY_STORAGE);
  if (!token && !apiKey) {
    if (BUILTIN_KEY.startsWith('eyJ')) token = BUILTIN_KEY;
    else apiKey = BUILTIN_KEY;
  }
  if (!token && !apiKey) throw new TMDBError('Не указан ключ TMDB. Откройте «Настройки».');

  const url = new URL(BASE + path);
  url.searchParams.set('language', 'ru-RU');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!token) url.searchParams.set('api_key', apiKey);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(url, { headers, signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new TMDBError('Нет соединения с TMDB. Проверьте интернет.');
  }
  if (response.status === 401) throw new TMDBError('TMDB отклонил ключ. Проверьте его в «Настройках».', 401);
  if (!response.ok) throw new TMDBError(`Ошибка сервера TMDB (код ${response.status}).`, response.status);
  return (await response.json()) as T;
}

// Общий DTO для списков сериалов и фильмов: у сериалов name/first_air_date, у фильмов title/release_date.
interface ListItemDTO {
  id: number;
  name?: string;
  original_name?: string;
  title?: string;
  original_title?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string | null;
  release_date?: string | null;
  vote_average?: number;
  vote_count?: number;
  origin_country?: string[];
  original_language?: string;
  genre_ids?: number[];
}

interface ListResponse {
  page: number;
  results: ListItemDTO[];
  total_pages: number;
}

interface DetailDTO extends ListItemDTO {
  genres?: { id: number; name: string }[];
  number_of_episodes?: number;
  number_of_seasons?: number;
  runtime?: number;
  episode_run_time?: number[];
  last_episode_to_air?: { runtime?: number | null } | null;
  next_episode_to_air?: { air_date?: string; episode_number?: number; season_number?: number; name?: string } | null;
  status?: string;
  production_countries?: { iso_3166_1: string }[];
}

function toDrama(mediaType: MediaType, d: ListItemDTO): Drama {
  const title = d.name || d.title || d.original_name || d.original_title || 'Без названия';
  const langCountry = d.original_language ? LANG_TO_COUNTRY[d.original_language] : undefined;
  const countries = d.origin_country?.length ? d.origin_country : langCountry ? [langCountry] : [];
  return {
    mediaType,
    id: d.id,
    title,
    originalTitle: d.original_name ?? d.original_title ?? '',
    overview: d.overview ?? '',
    posterPath: d.poster_path ?? null,
    backdropPath: d.backdrop_path ?? null,
    firstAirDate: d.first_air_date || d.release_date || null,
    voteAverage: d.vote_average ?? 0,
    voteCount: d.vote_count ?? 0,
    originCountries: countries,
    genreNames: (d.genre_ids ?? []).map((id) => GENRE_BY_ID.get(id)).filter((g): g is string => !!g),
  };
}

function isAsian(d: Drama): boolean {
  return d.originCountries.some((c) => COUNTRY_CODES.has(c));
}

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface DiscoverParams {
  mediaType: MediaType;
  /** '' = Азия (все шесть стран), WORLD = без ограничения, иначе код страны */
  country: string;
  genre: string; // '' = все
  sort: DiscoverSort;
  page: number;
  /** Год премьеры, '' = любой */
  year?: string;
}

const SORT_BY: Record<MediaType, Record<DiscoverSort, string>> = {
  tv: { popular: 'popularity.desc', topRated: 'vote_average.desc', newest: 'first_air_date.desc' },
  movie: { popular: 'popularity.desc', topRated: 'vote_average.desc', newest: 'primary_release_date.desc' },
};

export async function discover(p: DiscoverParams, signal?: AbortSignal): Promise<Page<Drama>> {
  const params: Record<string, string> = {
    sort_by: SORT_BY[p.mediaType][p.sort],
    page: String(p.page),
    include_adult: 'false',
  };
  if (p.country !== WORLD) params.with_origin_country = p.country || COUNTRIES.map((c) => c.code).join('|');
  if (p.genre) params.with_genres = p.genre;
  if (p.year) params[p.mediaType === 'tv' ? 'first_air_date_year' : 'primary_release_year'] = p.year;
  if (p.mediaType === 'tv') params.include_null_first_air_dates = 'false';
  if (p.sort === 'topRated') params['vote_count.gte'] = p.mediaType === 'movie' ? '200' : '50';
  if (p.sort === 'newest') {
    params[p.mediaType === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte'] = todayISO();
    params['vote_count.gte'] = '5';
  }

  const r = await fetchJSON<ListResponse>(`/discover/${p.mediaType}`, params, signal);
  return { items: r.results.map((d) => toDrama(p.mediaType, d)), page: r.page, totalPages: Math.min(r.total_pages, 500) };
}

/** Поиск по названию. TMDB не фильтрует поиск по стране, поэтому отсеиваем на клиенте. */
export async function search(
  mediaType: MediaType,
  query: string,
  country: string,
  page: number,
  signal?: AbortSignal,
): Promise<Page<Drama>> {
  const r = await fetchJSON<ListResponse>(
    `/search/${mediaType}`,
    { query, page: String(page), include_adult: 'false' },
    signal,
  );
  let items = r.results.map((d) => toDrama(mediaType, d));
  if (country === '') items = items.filter(isAsian);
  else if (country !== WORLD) items = items.filter((d) => d.originCountries.includes(country));
  return { items, page: r.page, totalPages: Math.min(r.total_pages, 500) };
}

export async function details(mediaType: MediaType, id: number, signal?: AbortSignal): Promise<Drama> {
  const d = await fetchJSON<DetailDTO>(`/${mediaType}/${id}`, {}, signal);
  const base = toDrama(mediaType, d);
  const produced = d.production_countries?.map((c) => c.iso_3166_1) ?? [];
  return {
    ...base,
    originCountries: base.originCountries.length ? base.originCountries : produced,
    genreNames: (d.genres ?? []).map((g) => GENRE_BY_ID.get(g.id) ?? g.name),
    episodeCount: d.number_of_episodes,
    seasonCount: d.number_of_seasons,
    runtime: d.runtime,
    episodeRuntime: d.episode_run_time?.[0] || d.last_episode_to_air?.runtime || undefined,
    airStatus: d.status,
    nextEpisode: d.next_episode_to_air?.air_date
      ? {
          airDate: d.next_episode_to_air.air_date,
          number: d.next_episode_to_air.episode_number ?? 0,
          season: d.next_episode_to_air.season_number ?? 1,
          name: d.next_episode_to_air.name ?? '',
        }
      : undefined,
  };
}

/** Похожие по мнению TMDB: первая страница рекомендаций к конкретному сериалу или фильму. */
export async function recommendations(mediaType: MediaType, id: number, signal?: AbortSignal): Promise<Drama[]> {
  const r = await fetchJSON<ListResponse>(`/${mediaType}/${id}/recommendations`, { page: '1' }, signal);
  return r.results.map((d) => toDrama(mediaType, d));
}

/** Случайная популярная запись: случайная страница из первых 15 и случайный элемент на ней. */
export async function randomPick(mediaType: MediaType, country: string, signal?: AbortSignal): Promise<Drama | null> {
  const page = 1 + Math.floor(Math.random() * 15);
  const r = await discover({ mediaType, country, genre: '', sort: 'popular', page }, signal);
  if (r.items.length === 0) return null;
  return r.items[Math.floor(Math.random() * r.items.length)];
}

export function backdropUrl(path: string | null | undefined): string | null {
  return path ? `https://image.tmdb.org/t/p/w780${path}` : null;
}

export function posterUrl(path: string | null | undefined, size: 'w185' | 'w342' | 'w500' = 'w342'): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

/** Кэш карточек, чтобы экран деталей открывался мгновенно и работал без сети. */
export const dramaCache = new Map<string, Drama>();

export function remember(items: Drama[]) {
  for (const d of items) dramaCache.set(itemKey(d.mediaType, d.id), d);
}
