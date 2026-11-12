import { fetchJSON, isAsian, localizeTitles, toDrama, type ListItemDTO } from './tmdb';
import { itemKey, type Drama, type MediaType } from './types';

/* ---------- Имена актёров ----------
 * В «В ролях» TMDB с language=ru-RU отдаёт русское имя, если оно есть, иначе — как в оригинале (고두심).
 * Тогда ищем: русское имя среди also_known_as → английский перевод (официальная латиница) →
 * латинское имя из also_known_as, похожее на «Go Doo-shim». Найденное запоминается на устройстве.
 */

const CYRILLIC = /[А-Яа-яЁё]/;
const LATIN = /[A-Za-z]/;
/** Буквы украинского, белорусского и т. п.: такое имя — не русское. */
const NOT_RUSSIAN = /[ІіЇїЄєҐґЎў]/;
/** Хангыль, кана, иероглифы, тайское письмо. */
const NATIVE = /[฀-๿぀-ヿ㐀-䶿一-鿿가-힯ᄀ-ᇿ㄰-㆏]/;

const PEOPLE_KEY = 'doramy.people.v1';
const PEOPLE_LIMIT = 3000;
/** Латинское имя или «лучше нет» перепроверяется раз в два месяца: вдруг появилось русское. */
const PEOPLE_RECHECK = 60 * 24 * 60 * 60 * 1000;
type NameEntry = { n: string; at: number };
let nameCache: Record<string, NameEntry> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const lookups = new Map<number, Promise<void>>();

function names(): Record<string, NameEntry> {
  if (!nameCache) {
    try {
      const raw = JSON.parse(localStorage.getItem(PEOPLE_KEY) ?? '{}');
      nameCache = raw && typeof raw === 'object' ? (raw as Record<string, NameEntry>) : {};
    } catch {
      nameCache = {};
    }
  }
  return nameCache;
}

function rememberName(id: number, name: string) {
  const cache = names();
  cache[id] = { n: name, at: Date.now() };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const keys = Object.keys(cache);
      if (keys.length > PEOPLE_LIMIT) for (const k of keys.slice(0, keys.length - PEOPLE_LIMIT)) delete cache[k];
      localStorage.setItem(PEOPLE_KEY, JSON.stringify(cache));
    } catch {
      // приватный режим: живём без кэша
    }
  }, 500);
}

/** Имя надо искать, если в нём нет ни кириллицы, ни латиницы (고두심, 高斗心, コ・ドゥシム). */
export function needsReadableName(name: string): boolean {
  return !CYRILLIC.test(name) && !LATIN.test(name);
}

function isRussian(s: string): boolean {
  return CYRILLIC.test(s) && !NOT_RUSSIAN.test(s) && !LATIN.test(s) && !NATIVE.test(s);
}

function isLatin(s: string): boolean {
  return LATIN.test(s) && !CYRILLIC.test(s) && !NATIVE.test(s) && !/[؀-ۿ֐-׿]/.test(s);
}

/** Насколько латинское имя похоже на привычную запись: «Go Doo-shim» лучше, чем «Doo-shim Go» или «GO DOOSHIM». */
function latinScore(s: string): number {
  let score = 0;
  if (/^[A-Z][a-z]{0,3} [A-Z][a-z]+-[a-z]+$/.test(s)) score += 6; // Фамилия Имя-имя
  else if (/^[A-Z][a-z]{0,3} [A-Z][a-z]+ ?[A-Z]?[a-z]*$/.test(s)) score += 4; // Ko Hyun Jung
  else if (/^[A-Z][a-z]+( [A-Z][a-z'-]+){1,2}$/.test(s)) score += 3;
  if (s === s.toUpperCase()) score -= 3;
  if (/\(|\)|\d/.test(s)) score -= 4;
  return score;
}

interface PersonNamesDTO {
  name?: string;
  also_known_as?: string[];
  translations?: { translations?: { iso_639_1: string; data?: { name?: string; biography?: string } }[] };
}

/** Лучшее читаемое имя: русское → английский перевод → лучшее латинское из also_known_as. null — ничего нет. */
export function pickReadableName(d: PersonNamesDTO): string | null {
  const aka = (d.also_known_as ?? []).map((s) => s.trim()).filter(Boolean);
  const ru = aka.find(isRussian);
  if (ru) return ru;
  const tr = d.translations?.translations ?? [];
  const ruTr = tr.find((t) => t.iso_639_1 === 'ru')?.data?.name?.trim();
  if (ruTr && isRussian(ruTr)) return ruTr;
  const en = tr.find((t) => t.iso_639_1 === 'en')?.data?.name?.trim();
  if (en && isLatin(en)) return en;
  const latin = aka.filter(isLatin);
  if (latin.length === 0) return null;
  return latin.reduce((best, s) => (latinScore(s) > latinScore(best) ? s : best), latin[0]);
}

/** Уже найденное имя (пустая строка — искали, лучше нет). */
export function knownName(id: number): string | undefined {
  return names()[id]?.n;
}

/** Имя для показа: если TMDB дал имя без кириллицы и латиницы — подставляем найденное. */
export function readableName(id: number, name: string): string {
  if (!needsReadableName(name)) return name;
  return knownName(id) || name;
}

function isStale(id: number): boolean {
  const e = names()[id];
  if (!e) return true;
  return !isRussian(e.n) && Date.now() - e.at > PEOPLE_RECHECK;
}

function lookupName(id: number): Promise<void> {
  let p = lookups.get(id);
  if (!p) {
    p = fetchJSON<PersonNamesDTO>(`/person/${id}`, { append_to_response: 'translations' })
      .then((r) => rememberName(id, pickReadableName(r) ?? ''))
      .catch(() => undefined) // сеть или 429: попробуем в другой раз
      .finally(() => lookups.delete(id));
    lookups.set(id, p);
  }
  return p;
}

/**
 * Подставить читаемые имена там, где TMDB отдал хангыль или иероглифы.
 * Ищет только нужные и не больше `limit` за раз; уход с экрана (signal) не отменяет поиск — пригодится потом.
 */
export async function localizePeople<T extends { id: number; name: string }>(
  people: T[],
  signal?: AbortSignal,
  limit = 15,
): Promise<T[]> {
  const missing = people.filter((p) => needsReadableName(p.name) && isStale(p.id)).slice(0, limit);
  if (missing.length) {
    const all = Promise.all(missing.map((p) => lookupName(p.id)));
    if (signal) {
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
  return people.map((p) => {
    const better = readableName(p.id, p.name);
    return better === p.name ? p : { ...p, name: better };
  });
}

/* ---------- Страница актёра ---------- */

export interface PersonCredit {
  drama: Drama;
  /** Роль (или несколько через « / »). */
  character: string;
  episodeCount?: number;
  /** Ток-шоу, реалити, новости, церемонии или «в роли самого себя». */
  isShow: boolean;
  /** Ещё не вышло или дата неизвестна. */
  upcoming: boolean;
}

export interface Person {
  id: number;
  /** Имя для показа: русское или латиница. */
  name: string;
  /** Подпись под именем: латиница и/или оригинальное написание. */
  altNames: string[];
  gender: number;
  department: string;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  biography: string;
  /** Язык биографии: 'ru' или 'en' (русской нет). */
  biographyLang: 'ru' | 'en' | null;
  profilePath: string | null;
  photos: string[];
  popularity: number;
  imdbId: string | null;
  instagram: string | null;
  credits: PersonCredit[];
}

interface PersonCreditDTO extends ListItemDTO {
  media_type?: string;
  character?: string;
  job?: string;
  episode_count?: number;
  order?: number;
}

interface PersonDTO extends PersonNamesDTO {
  id: number;
  gender?: number;
  known_for_department?: string;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  biography?: string;
  profile_path?: string | null;
  popularity?: number;
  imdb_id?: string | null;
  combined_credits?: { cast?: PersonCreditDTO[]; crew?: PersonCreditDTO[] };
  images?: { profiles?: { file_path: string; vote_average?: number }[] };
  external_ids?: { instagram_id?: string | null; imdb_id?: string | null };
}

/** Жанры TMDB, которые не роли: новости, реалити, ток-шоу. */
const SHOW_GENRES = [10763, 10764, 10767];
const SELF_ROLE =
  /\b(self|himself|herself|themselves)\b|^(host|co-host|mc|guest|presenter|contestant|panelist)\b|сам(ого|ой|а)? себя|в роли себя/i;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function creditsFrom(list: PersonCreditDTO[], roleOf: (c: PersonCreditDTO) => string): PersonCredit[] {
  const today = todayISO();
  const byKey = new Map<string, PersonCredit>();
  for (const c of list) {
    const mediaType: MediaType | null = c.media_type === 'tv' ? 'tv' : c.media_type === 'movie' ? 'movie' : null;
    if (!mediaType) continue;
    const key = itemKey(mediaType, c.id);
    const role = roleOf(c).trim();
    const known = byKey.get(key);
    if (known) {
      if (role && !known.character.split(' / ').includes(role)) {
        known.character = known.character ? `${known.character} / ${role}` : role;
      }
      if (c.episode_count) known.episodeCount = (known.episodeCount ?? 0) + c.episode_count;
      // Хотя бы одна настоящая роль — это не шоу.
      if (!SELF_ROLE.test(role) && !(c.genre_ids ?? []).some((g) => SHOW_GENRES.includes(g))) known.isShow = false;
      continue;
    }
    const drama = toDrama(mediaType, c);
    const date = drama.firstAirDate;
    byKey.set(key, {
      drama,
      character: role,
      episodeCount: c.episode_count || undefined,
      isShow: (c.genre_ids ?? []).some((g) => SHOW_GENRES.includes(g)) || SELF_ROLE.test(role),
      upcoming: !date || date > today,
    });
  }
  return [...byKey.values()];
}

const personCache = new Map<number, Person>();

export function cachedPerson(id: number): Person | undefined {
  return personCache.get(id);
}

/** Актёр целиком: данные, фото и фильмография одним запросом. Биография на русском, иначе на английском. */
export async function fetchPerson(id: number, signal?: AbortSignal): Promise<Person> {
  const d = await fetchJSON<PersonDTO>(
    `/person/${id}`,
    { append_to_response: 'combined_credits,images,translations,external_ids' },
    signal,
  );
  const apiName = (d.name ?? '').trim();
  let name = apiName;
  if (!apiName || needsReadableName(apiName)) {
    const better = pickReadableName(d);
    rememberName(id, better ?? '');
    if (better) name = better;
  }
  const aka = (d.also_known_as ?? []).map((s) => s.trim()).filter(Boolean);
  const en = d.translations?.translations?.find((t) => t.iso_639_1 === 'en')?.data;
  const latin = en?.name && isLatin(en.name) ? en.name.trim() : aka.filter(isLatin).sort((a, b) => latinScore(b) - latinScore(a))[0];
  const native = [apiName, ...aka].find((s) => NATIVE.test(s) && !LATIN.test(s) && !CYRILLIC.test(s));
  const altNames = [latin, native].filter((s): s is string => !!s && s !== name);

  const ruBio = (d.biography ?? '').trim();
  const enBio = (en?.biography ?? '').trim();
  const biography = ruBio || enBio;

  const cast = d.combined_credits?.cast ?? [];
  let credits = creditsFrom(cast, (c) => c.character ?? '');
  // Режиссёр или сценарист без ролей — показываем его работы с должностью.
  if (credits.length === 0) credits = creditsFrom(d.combined_credits?.crew ?? [], (c) => c.job ?? '');

  const person: Person = {
    id,
    name: name || 'Без имени',
    altNames: [...new Set(altNames)],
    gender: d.gender ?? 0,
    department: d.known_for_department ?? '',
    birthday: d.birthday || null,
    deathday: d.deathday || null,
    placeOfBirth: d.place_of_birth || null,
    biography,
    biographyLang: ruBio ? 'ru' : enBio ? 'en' : null,
    profilePath: d.profile_path ?? null,
    photos: (d.images?.profiles ?? []).map((p) => p.file_path),
    popularity: d.popularity ?? 0,
    imdbId: d.imdb_id || d.external_ids?.imdb_id || null,
    instagram: d.external_ids?.instagram_id || null,
    credits,
  };
  personCache.set(id, person);
  return person;
}

/** Русские названия для работ актёра: сначала самые известные и свежие. Возвращает ключ → название. */
export async function localizeCredits(credits: PersonCredit[], signal?: AbortSignal, limit = 40): Promise<Map<string, string>> {
  const localized = await localizeTitles(
    credits.map((c) => c.drama),
    signal,
    limit,
  );
  return new Map(localized.map((d) => [itemKey(d.mediaType, d.id), d.title]));
}

/* ---------- Поиск актёров ---------- */

export interface PersonHit {
  id: number;
  name: string;
  profilePath: string | null;
  gender: number;
  popularity: number;
  /** Самая известная работа — подпись под именем. */
  knownFor: string | null;
  /** Есть ли среди известных работ азиатские: таких показываем выше. */
  asian: boolean;
}

interface PersonSearchDTO {
  id: number;
  name: string;
  profile_path?: string | null;
  gender?: number;
  popularity?: number;
  known_for_department?: string;
  known_for?: (ListItemDTO & { media_type?: string })[];
  media_type?: string;
}

export function toPersonHit(r: PersonSearchDTO): PersonHit {
  const works = (r.known_for ?? [])
    .filter((k) => k.media_type === 'tv' || k.media_type === 'movie')
    .map((k) => toDrama(k.media_type === 'movie' ? 'movie' : 'tv', k));
  return {
    id: r.id,
    name: readableName(r.id, r.name),
    profilePath: r.profile_path ?? null,
    gender: r.gender ?? 0,
    popularity: r.popularity ?? 0,
    knownFor: works[0]?.title ?? null,
    asian: works.some(isAsian),
  };
}

export function isActingHit(r: { known_for_department?: string }): boolean {
  return r.known_for_department === 'Acting';
}

/** Актёры по запросу: только актёрский цех, самые популярные, не больше 6. */
export async function searchPeople(query: string, signal?: AbortSignal): Promise<PersonHit[]> {
  const r = await fetchJSON<{ results?: PersonSearchDTO[] }>(
    '/search/person',
    { query, page: '1', include_adult: 'false' },
    signal,
  );
  const hits = (r.results ?? [])
    .filter(isActingHit)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, 6)
    .map(toPersonHit);
  return localizePeople(hits, signal, 6);
}
