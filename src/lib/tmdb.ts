import { COUNTRIES, COUNTRY_CODES, GENRE_BY_ID, type DiscoverSort, type Drama } from './types';

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

export function getCredential(): string {
  return safeGet(TOKEN_STORAGE) || safeGet(KEY_STORAGE);
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
  const token = safeGet(TOKEN_STORAGE);
  const apiKey = safeGet(KEY_STORAGE);
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

interface TVSummaryDTO {
  id: number;
  name?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string | null;
  vote_average?: number;
  vote_count?: number;
  origin_country?: string[];
  genre_ids?: number[];
}

interface TVListResponse {
  page: number;
  results: TVSummaryDTO[];
  total_pages: number;
}

interface TVDetailDTO extends TVSummaryDTO {
  genres?: { id: number; name: string }[];
  number_of_episodes?: number;
  number_of_seasons?: number;
  status?: string;
}

function toDrama(d: TVSummaryDTO): Drama {
  return {
    id: d.id,
    title: d.name || d.original_name || 'Без названия',
    originalTitle: d.original_name ?? '',
    overview: d.overview ?? '',
    posterPath: d.poster_path ?? null,
    backdropPath: d.backdrop_path ?? null,
    firstAirDate: d.first_air_date || null,
    voteAverage: d.vote_average ?? 0,
    voteCount: d.vote_count ?? 0,
    originCountries: d.origin_country ?? [],
    genreNames: (d.genre_ids ?? []).map((id) => GENRE_BY_ID.get(id)).filter((g): g is string => !!g),
  };
}

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface DiscoverParams {
  country: string; // '' = все
  genre: string; // '' = все
  sort: DiscoverSort;
  page: number;
}

export async function discover(p: DiscoverParams, signal?: AbortSignal): Promise<Page<Drama>> {
  const params: Record<string, string> = {
    with_origin_country: p.country || COUNTRIES.map((c) => c.code).join('|'),
    sort_by: p.sort,
    page: String(p.page),
    include_null_first_air_dates: 'false',
    include_adult: 'false',
  };
  if (p.genre) params.with_genres = p.genre;
  if (p.sort === 'vote_average.desc') params['vote_count.gte'] = '50';
  if (p.sort === 'first_air_date.desc') params['first_air_date.lte'] = todayISO();

  const r = await fetchJSON<TVListResponse>('/discover/tv', params, signal);
  return { items: r.results.map(toDrama), page: r.page, totalPages: Math.min(r.total_pages, 500) };
}

export async function search(query: string, page: number, signal?: AbortSignal): Promise<Page<Drama>> {
  const r = await fetchJSON<TVListResponse>(
    '/search/tv',
    { query, page: String(page), include_adult: 'false' },
    signal,
  );
  const items = r.results.map(toDrama).filter((d) => d.originCountries.some((c) => COUNTRY_CODES.has(c)));
  return { items, page: r.page, totalPages: Math.min(r.total_pages, 500) };
}

export async function details(id: number, signal?: AbortSignal): Promise<Drama> {
  const d = await fetchJSON<TVDetailDTO>(`/tv/${id}`, {}, signal);
  const base = toDrama(d);
  return {
    ...base,
    genreNames: (d.genres ?? []).map((g) => GENRE_BY_ID.get(g.id) ?? g.name),
    episodeCount: d.number_of_episodes,
    seasonCount: d.number_of_seasons,
    airStatus: d.status,
  };
}

export function posterUrl(path: string | null | undefined, size: 'w185' | 'w342' | 'w500' = 'w342'): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

/** Кэш карточек, чтобы экран деталей открывался мгновенно и работал без сети. */
export const dramaCache = new Map<number, Drama>();

export function remember(items: Drama[]) {
  for (const d of items) dramaCache.set(d.id, d);
}
