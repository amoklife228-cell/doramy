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
  /** Часть запросов не удалась: список неполный, долго не кэшировать. */
  partial?: boolean;
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

/* ---------- ограничитель запросов ----------
 * Главная каталога за секунду запрашивает подборки, кадры жанров, рекомендации и русские названия.
 * TMDB режет больше ~40 запросов в секунду (429), поэтому одновременно идут не больше 8,
 * а ответ 429 повторяется один раз после паузы из Retry-After.
 */
const MAX_IN_FLIGHT = 8;
let inFlight = 0;
const waiting: (() => void)[] = [];

function acquire(signal?: AbortSignal): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const start = () => {
      signal?.removeEventListener('abort', onAbort);
      inFlight++;
      resolve();
    };
    const onAbort = () => {
      const i = waiting.indexOf(start);
      if (i >= 0) waiting.splice(i, 1);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    waiting.push(start);
  });
}

function release() {
  inFlight--;
  waiting.shift()?.();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

async function fetchJSON<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await acquire(signal);
    let result: { retryAfter: number } | { value: T };
    try {
      result = await fetchOnce<T>(path, params, signal);
    } finally {
      release();
    }
    if ('value' in result) return result.value;
    if (attempt >= 1) throw new TMDBError('TMDB просит подождать. Попробуйте через минуту.', 429);
    await sleep(result.retryAfter, signal);
  }
}

async function fetchOnce<T>(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ retryAfter: number } | { value: T }> {
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
  if (response.status === 429) {
    const header = Number(response.headers.get('Retry-After'));
    return { retryAfter: Number.isFinite(header) && header > 0 ? Math.min(header, 5) * 1000 : 1000 };
  }
  if (response.status === 401) throw new TMDBError('TMDB отклонил ключ. Проверьте его в «Настройках».', 401);
  if (!response.ok) throw new TMDBError(`Ошибка сервера TMDB (код ${response.status}).`, response.status);
  return { value: (await response.json()) as T };
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

/* ---------- русские названия ----------
 * Если у сериала нет русского перевода, TMDB с language=ru-RU отдаёт оригинал (연인, 深夜食堂).
 * Тогда ищем: русский перевод → русское альтернативное название (их добавляют зрители) → английское.
 * Найденное запоминается на устройстве, повторно не запрашивается.
 */

const CYRILLIC = /[А-Яа-яЁё]/;
// v2: запись хранит время проверки. Английское или «лучше нет» перепроверяется через месяц —
// вдруг зрители добавили русское название.
const TITLES_KEY = 'doramy.titles.v2';
const TITLES_LIMIT = 4000;
const TITLE_RECHECK = 30 * 24 * 60 * 60 * 1000;
type TitleEntry = { t: string; at: number };
let titleCache: Record<string, TitleEntry> | null = null;
let titleSaveTimer: ReturnType<typeof setTimeout> | null = null;
/** Поиск названия, который уже идёт: другие списки ждут его, а не запрашивают то же самое. */
const titleLookups = new Map<string, Promise<void>>();

function titles(): Record<string, TitleEntry> {
  if (!titleCache) {
    try {
      titleCache = JSON.parse(localStorage.getItem(TITLES_KEY) ?? '{}') as Record<string, TitleEntry>;
      try {
        localStorage.removeItem('doramy.titles.v1');
      } catch {
        // ignore
      }
    } catch {
      titleCache = {};
    }
  }
  return titleCache;
}

/** Найденное название по ключу (пустая строка — искали, лучше нет). */
function knownTitle(key: string): string | undefined {
  return titles()[key]?.t;
}

/** Нужно ли (снова) искать название: не искали, или нашли не русское и прошёл месяц. */
function titleIsStale(key: string): boolean {
  const e = titles()[key];
  if (!e) return true;
  return needsRussianTitle(e.t) && Date.now() - e.at > TITLE_RECHECK;
}

function rememberTitle(key: string, title: string) {
  const cache = titles();
  cache[key] = { t: title, at: Date.now() };
  if (titleSaveTimer) clearTimeout(titleSaveTimer);
  titleSaveTimer = setTimeout(() => {
    try {
      const keys = Object.keys(cache);
      if (keys.length > TITLES_LIMIT) for (const k of keys.slice(0, keys.length - TITLES_LIMIT)) delete cache[k];
      localStorage.setItem(TITLES_KEY, JSON.stringify(cache));
    } catch {
      // приватный режим: живём без кэша
    }
  }, 500);
}

/** Название требует поиска, если в нём нет кириллицы (оригинал на корейском, японском, английском…). */
export function needsRussianTitle(title: string): boolean {
  return !CYRILLIC.test(title);
}

interface AltTitle {
  iso_3166_1: string;
  title: string;
}

interface TitlesDTO {
  alternative_titles?: { results?: AltTitle[]; titles?: AltTitle[] };
  translations?: { translations?: { iso_639_1: string; data?: { name?: string; title?: string } }[] };
}

/** Лучшее название из ответа с append_to_response=alternative_titles,translations; null — ничего лучше нет. */
function pickTitle(d: TitlesDTO): string | null {
  const tr = d.translations?.translations ?? [];
  const ru = tr.find((t) => t.iso_639_1 === 'ru')?.data;
  const ruName = (ru?.name || ru?.title || '').trim();
  if (ruName && CYRILLIC.test(ruName)) return ruName;
  const alts = d.alternative_titles?.results ?? d.alternative_titles?.titles ?? [];
  const ruAlt = alts.find((a) => a.iso_3166_1 === 'RU' && CYRILLIC.test(a.title))?.title.trim();
  if (ruAlt) return ruAlt;
  const en = tr.find((t) => t.iso_639_1 === 'en')?.data;
  const enName = (en?.name || en?.title || '').trim();
  return enName || null;
}


/** Один поиск названия; общий для всех списков, поэтому не привязан к чьему-то signal. */
function lookupTitle(mediaType: MediaType, id: number): Promise<void> {
  const key = itemKey(mediaType, id);
  let p = titleLookups.get(key);
  if (!p) {
    p = fetchJSON<TitlesDTO>(`/${mediaType}/${id}`, { append_to_response: 'alternative_titles,translations' })
      .then((r) => rememberTitle(key, pickTitle(r) ?? '')) // '' = искали, лучше нет
      .catch(() => undefined) // сбой сети или 429: не запоминаем, попробуем в другой раз
      .finally(() => titleLookups.delete(key));
    titleLookups.set(key, p);
  }
  return p;
}

/**
 * Подставить русские (или хотя бы английские) названия там, где TMDB отдал оригинал.
 * `limit` — сколько названий искать за раз: для ленты хватит видимых, для сетки — страницы.
 */
export async function localizeTitles(items: Drama[], signal?: AbortSignal, limit = 20): Promise<Drama[]> {
  const missing = items
    .filter((d) => needsRussianTitle(d.title) && titleIsStale(itemKey(d.mediaType, d.id)))
    .slice(0, limit);
  if (missing.length) {
    const all = Promise.all(missing.map((d) => lookupTitle(d.mediaType, d.id)));
    if (signal) {
      // Ушли с экрана — не ждём, но поиск доработает и пригодится в следующий раз.
      await Promise.race([
        all,
        new Promise<void>((_, reject) => {
          if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'));
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        }),
      ]);
    } else {
      await all;
    }
  }
  return items.map((d) => {
    const better = knownTitle(itemKey(d.mediaType, d.id));
    return better && needsRussianTitle(d.title) ? { ...d, title: better } : d;
  });
}

function toDrama(mediaType: MediaType, d: ListItemDTO): Drama {
  const fromApi = d.name || d.title || d.original_name || d.original_title || 'Без названия';
  // Уже найденное русское название подставляем сразу, без запроса.
  const known = needsRussianTitle(fromApi) ? knownTitle(itemKey(mediaType, d.id)) : undefined;
  const title = known || fromApi;
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
  /** Статус: tv — with_status ('0', '3', '1,2'), movie — 'released' | 'upcoming' */
  status?: string;
  /** Тип сериала (with_type), только tv */
  category?: string;
  /** Телеканал / платформа (with_networks), только tv */
  network?: string;
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
  if (p.mediaType === 'tv') {
    params.include_null_first_air_dates = 'false';
    if (p.status) params.with_status = p.status.replace(',', '|');
    if (p.category) params.with_type = p.category;
    if (p.network) params.with_networks = p.network;
  } else if (p.status === 'released') {
    params['primary_release_date.lte'] = todayISO();
  } else if (p.status === 'upcoming') {
    params['primary_release_date.gte'] = todayISO();
  }
  const upcomingMovie = p.mediaType === 'movie' && p.status === 'upcoming';
  if (p.sort === 'topRated') params['vote_count.gte'] = p.mediaType === 'movie' ? '200' : '50';
  if (p.sort === 'newest' && !upcomingMovie) {
    params[p.mediaType === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte'] = todayISO();
    params['vote_count.gte'] = '5';
  }
  if (p.sort === 'newest' && upcomingMovie) params.sort_by = 'primary_release_date.asc';

  const r = await fetchJSON<ListResponse>(`/discover/${p.mediaType}`, params, signal);
  const items = await localizeTitles(r.results.map((d) => toDrama(p.mediaType, d)), signal);
  return { items, page: r.page, totalPages: Math.min(r.total_pages, 500) };
}

/**
 * discover по Азии с произвольными параметрами TMDB (для подборок на главной).
 * `localize`: сколько русских названий искать (0 — не искать, например когда нужны только кадры).
 */
export async function discoverAsia(
  mediaType: MediaType,
  extra: Record<string, string>,
  page: number,
  signal?: AbortSignal,
  localize = 20,
): Promise<Page<Drama>> {
  const params: Record<string, string> = {
    page: String(page),
    include_adult: 'false',
    with_origin_country: COUNTRIES.map((c) => c.code).join('|'),
    ...extra,
  };
  if (mediaType === 'tv') params.include_null_first_air_dates = 'false';
  const r = await fetchJSON<ListResponse>(`/discover/${mediaType}`, params, signal);
  const raw = r.results.map((d) => toDrama(mediaType, d));
  const items = localize > 0 ? await localizeTitles(raw, signal, localize) : raw;
  return { items, page: r.page, totalPages: Math.min(r.total_pages, 500) };
}

/**
 * Мировой тренд недели, только азиатское. TMDB не фильтрует тренды по стране,
 * поэтому одна наша страница — это три страницы TMDB, отсеянные на клиенте.
 */
export async function trendingAsia(
  mediaType: MediaType,
  page: number,
  signal?: AbortSignal,
  withoutGenres: number[] = [],
): Promise<Page<Drama>> {
  const pages = [page * 3 - 2, page * 3 - 1, page * 3];
  const responses = await Promise.all(
    pages.map((p) =>
      fetchJSON<ListResponse>(`/trending/${mediaType}/week`, { page: String(p) }, signal).catch((e: Error) => {
        if (e.name === 'AbortError') throw e;
        return null;
      }),
    ),
  );
  const ok = responses.filter((r): r is ListResponse => r !== null);
  if (ok.length === 0) throw new TMDBError('Нет соединения с TMDB. Проверьте интернет.');
  const partial = ok.length < responses.length;
  const items = await localizeTitles(
    ok
      .flatMap((r) => r.results)
      .filter((d) => !(d.genre_ids ?? []).some((g) => withoutGenres.includes(g)))
      .map((d) => toDrama(mediaType, d))
      .filter(isAsian),
    signal,
  );
  const total = Math.max(...ok.map((r) => r.total_pages));
  return { items, page, totalPages: Math.min(Math.ceil(total / 3), 10), partial };
}

/**
 * Карточки по списку id (подборки редакции и премий): из кэша, остальное — запросом. Порядок сохраняется.
 * `partial` — часть не загрузилась (сеть, 429): такой список не стоит кэшировать надолго.
 */
export async function detailsList(
  mediaType: MediaType,
  ids: number[],
  signal?: AbortSignal,
): Promise<{ items: Drama[]; partial: boolean }> {
  const results = await Promise.all(
    ids.map((id) => {
      const cached = dramaCache.get(itemKey(mediaType, id));
      if (cached) return Promise.resolve(cached);
      return details(mediaType, id, signal)
        .then((d) => {
          dramaCache.set(itemKey(mediaType, id), d);
          return d;
        })
        .catch((e: Error) => {
          if (e.name === 'AbortError') throw e;
          return null;
        });
    }),
  );
  const items = results.filter((d): d is Drama => d !== null);
  if (items.length === 0 && ids.length > 0) throw new TMDBError('Нет соединения с TMDB. Проверьте интернет.');
  return { items, partial: items.length < ids.length };
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
  items = await localizeTitles(items, signal);
  return { items, page: r.page, totalPages: Math.min(r.total_pages, 500) };
}

export async function details(mediaType: MediaType, id: number, signal?: AbortSignal): Promise<Drama> {
  // Переводы и альтернативные названия в том же запросе: нет русского — найдём замену без лишнего обращения.
  const d = await fetchJSON<DetailDTO & TitlesDTO>(
    `/${mediaType}/${id}`,
    { append_to_response: 'alternative_titles,translations' },
    signal,
  );
  const apiTitle = d.name || d.title || '';
  if (apiTitle && needsRussianTitle(apiTitle)) rememberTitle(itemKey(mediaType, id), pickTitle(d) ?? '');
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

export interface Video {
  key: string; // id ролика на YouTube
  name: string;
  type: string; // Trailer, Teaser, Clip...
  lang: string;
  official: boolean;
}

interface VideoDTO {
  key: string;
  name: string;
  site: string;
  type: string;
  iso_639_1?: string;
  official?: boolean;
  published_at?: string;
}

/** Трейлеры и тизеры с YouTube: сначала русские, потом английские, потом остальные; официальные выше. */
export async function videos(mediaType: MediaType, id: number, signal?: AbortSignal): Promise<Video[]> {
  const r = await fetchJSON<{ results: VideoDTO[] }>(
    `/${mediaType}/${id}/videos`,
    { include_video_language: 'ru,en,ko,ja,zh,th,null' },
    signal,
  );
  const rank = (v: VideoDTO) => {
    const lang = v.iso_639_1 === 'ru' ? 0 : v.iso_639_1 === 'en' ? 1 : 2;
    const type = v.type === 'Trailer' ? 0 : v.type === 'Teaser' ? 1 : 2;
    return lang * 10 + type * 3 + (v.official ? 0 : 1);
  };
  return (r.results ?? [])
    .filter((v) => v.site === 'YouTube' && v.key && (v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Clip' || v.type === 'Opening Credits'))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 6)
    .map((v) => ({ key: v.key, name: v.name, type: v.type, lang: v.iso_639_1 ?? '', official: !!v.official }));
}

/** Похожие по мнению TMDB: страница рекомендаций к конкретному сериалу или фильму (если её нет — первая). */
export async function recommendations(
  mediaType: MediaType,
  id: number,
  signal?: AbortSignal,
  page = 1,
): Promise<Drama[]> {
  const r = await fetchJSON<ListResponse>(`/${mediaType}/${id}/recommendations`, { page: String(page) }, signal);
  if (r.results.length === 0 && page > 1) return recommendations(mediaType, id, signal, 1);
  return localizeTitles(r.results.map((d) => toDrama(mediaType, d)), signal);
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profilePath: string | null;
}

interface CreditsDTO {
  cast?: {
    id: number;
    name: string;
    character?: string;
    profile_path?: string | null;
    roles?: { character?: string }[];
    order?: number;
  }[];
}

/** Актёры: у сериалов — по всем сезонам (aggregate_credits), у фильмов — обычные credits. Первые 15. */
export async function credits(mediaType: MediaType, id: number, signal?: AbortSignal): Promise<CastMember[]> {
  const path = mediaType === 'tv' ? `/tv/${id}/aggregate_credits` : `/movie/${id}/credits`;
  const r = await fetchJSON<CreditsDTO>(path, {}, signal);
  return (r.cast ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 15)
    .map((c) => ({
      id: c.id,
      name: c.name,
      character: (c.character || c.roles?.[0]?.character || '').trim(),
      profilePath: c.profile_path ?? null,
    }));
}

export function profileUrl(path: string | null): string | null {
  return path ? `https://image.tmdb.org/t/p/w185${path}` : null;
}

/** Похожие: рекомендации TMDB, а если их нет — «similar» (по жанрам и ключевым словам). */
export async function similarTo(mediaType: MediaType, id: number, signal?: AbortSignal): Promise<Drama[]> {
  let list = await recommendations(mediaType, id, signal);
  // Мало рекомендаций или мало азиатских среди них — добираем из «similar».
  if (list.length < 4 || list.filter(isAsian).length < 6) {
    const r = await fetchJSON<ListResponse>(`/${mediaType}/${id}/similar`, { page: '1' }, signal);
    const extra = await localizeTitles(r.results.map((d) => toDrama(mediaType, d)), signal);
    const seen = new Set(list.map((d) => d.id));
    list = [...list, ...extra.filter((d) => !seen.has(d.id))];
  }
  // Приложение про азиатское: если азиатских похожих хватает, западные не показываем.
  const asian = list.filter(isAsian);
  return asian.length >= 5 ? asian : [...asian, ...list.filter((d) => !isAsian(d))];
}

/** Случайная популярная запись: случайная страница из первых 15 (но не дальше последней) и случайный элемент на ней. */
export async function randomPick(mediaType: MediaType, country: string, signal?: AbortSignal): Promise<Drama | null> {
  const first = await discover({ mediaType, country, genre: '', sort: 'popular', page: 1 }, signal);
  const pages = Math.max(1, Math.min(15, first.totalPages));
  const page = 1 + Math.floor(Math.random() * pages);
  const r = page === 1 ? first : await discover({ mediaType, country, genre: '', sort: 'popular', page }, signal);
  const pool = r.items.length ? r.items : first.items;
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function backdropUrl(path: string | null | undefined): string | null {
  return path ? `https://image.tmdb.org/t/p/w780${path}` : null;
}

export function posterUrl(path: string | null | undefined, size: 'w185' | 'w342' | 'w500' = 'w342'): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

/** Кэш карточек, чтобы экран деталей открывался мгновенно и работал без сети. */
export const dramaCache = new Map<string, Drama>();

/** Запомнить карточки из списков. Полные данные из details() (с числом серий) не затираются урезанными. */
export function remember(items: Drama[]) {
  for (const d of items) {
    const key = itemKey(d.mediaType, d.id);
    const known = dramaCache.get(key);
    if (known && (known.episodeCount !== undefined || known.runtime !== undefined)) continue;
    dramaCache.set(key, d);
  }
}
