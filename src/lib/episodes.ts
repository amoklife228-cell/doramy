import { addToLibrary, db, updateEntry } from './db';
import { fetchJSON } from './tmdb';
import { itemKey, todayKey, type Drama, type SavedDrama } from './types';

/*
 * Список серий по сезонам и отметки «просмотрено».
 *
 * Модель данных (SavedDrama):
 *   episodesWatched  — сколько серий просмотрено (без спецвыпусков). На нём держатся статистика,
 *                      активность по дням, «Продолжить смотреть», прогресс в библиотеке.
 *   watchedEpisodes? — какие именно серии отмечены: коды вида 's1e3'.
 *
 * Правило согласования (одно на всё приложение):
 *   1. episodesWatched — главное число. Набор отмеченных всегда приводится к нему: resolveWatched().
 *   2. Нет watchedEpisodes (старые записи, другие устройства со старой версией) — просмотрены
 *      первые episodesWatched серий по порядку (сезон, номер).
 *   3. Набор короче числа (кто-то нажал «+» без списка, например «+1» на главной) — добавляются
 *      первые неотмеченные серии по порядку. Длиннее (нажали «−») — снимаются последние отмеченные.
 *   Поэтому «+» в редакторе = «отметить следующую неотмеченную», «−» = «снять последнюю отмеченную»,
 *   и это верно даже без загруженного списка: достаточно поменять число, отметки догонят его при показе.
 *   4. При отметке в списке набор сначала приводится к числу (ленивая миграция старой записи),
 *      затем меняется, и сохраняются оба поля: episodesWatched = размер набора.
 */

/* ---------- TMDB ---------- */

interface EpisodeDTO {
  episode_number: number;
  season_number: number;
  name?: string;
  air_date?: string | null;
  runtime?: number | null;
  still_path?: string | null;
}

interface SeasonDTO {
  season_number: number;
  episode_count?: number;
  air_date?: string | null;
  name?: string;
  episodes?: EpisodeDTO[];
}

interface ShowDTO {
  id: number;
  status?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  seasons?: SeasonDTO[];
  next_episode_to_air?: EpisodeDTO | null;
  last_episode_to_air?: EpisodeDTO | null;
}

export interface SeasonInfo {
  number: number;
  episodeCount: number;
  airDate: string | null;
}

export interface EpisodeBrief {
  season: number;
  episode: number;
  airDate: string;
  name: string;
}

/** Сезоны сериала: для порядка серий, переключателя сезонов и календаря. */
export interface ShowOutline {
  id: number;
  status: string;
  seasons: SeasonInfo[];
  episodeRuntime?: number;
  next: EpisodeBrief | null;
  last: EpisodeBrief | null;
}

export interface Episode {
  season: number;
  number: number;
  code: string;
  /** Уже с заменой пустого или «Эпизод 5» на английское название или «Серия 5». */
  name: string;
  airDate: string | null;
  runtime: number | null;
  stillPath: string | null;
}

export interface SeasonData {
  number: number;
  episodes: Episode[];
}

export const episodeCode = (season: number, episode: number) => `s${season}e${episode}`;

export function parseCode(code: string): [number, number] | null {
  const m = /^s(\d+)e(\d+)$/.exec(code);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** «Episode 5», «Эпизод 5», «Серия 5», «第5集» и пустые названия — это не название. */
export function isGenericName(name: string | undefined | null): boolean {
  const n = (name ?? '').trim();
  if (!n) return true;
  return /^(episode|эпизод|серия|ep\.?|e)\s*\d+$/i.test(n) || /^第\s*\d+\s*[集话話回]$/.test(n) || /^\d+$/.test(n);
}

function toBrief(e: EpisodeDTO | null | undefined): EpisodeBrief | null {
  if (!e?.air_date) return null;
  return { season: e.season_number ?? 1, episode: e.episode_number ?? 0, airDate: e.air_date, name: isGenericName(e.name) ? '' : (e.name ?? '') };
}

// Кэш в памяти: открытая повторно карточка и календарь не запрашивают одно и то же.
const outlineCache = new Map<number, { at: number; value: Promise<ShowOutline> }>();
const seasonCache = new Map<string, Promise<SeasonData>>();
/** Уже пришедшие сезоны — для синхронного доступа (порядок серий, первый показ без мигания). */
const seasonReady = new Map<string, SeasonData>();
const OUTLINE_TTL = 30 * 60_000;

export function peekSeason(id: number, season: number): SeasonData | undefined {
  return seasonReady.get(`${id}:${season}`);
}

export function peekOutline(id: number): Promise<ShowOutline> | undefined {
  const c = outlineCache.get(id);
  return c && Date.now() - c.at < OUTLINE_TTL ? c.value : undefined;
}

/** Забыть сводку и сезоны сериала в памяти: «Обновить» в календаре запросит их заново. */
export function forgetShow(id: number) {
  outlineCache.delete(id);
  for (const key of [...seasonCache.keys()]) {
    if (key.startsWith(`${id}:`)) {
      seasonCache.delete(key);
      seasonReady.delete(key);
    }
  }
}

export function fetchOutline(id: number, signal?: AbortSignal): Promise<ShowOutline> {
  const cached = peekOutline(id);
  if (cached) return cached;
  // Без signal: запрос общий для нескольких экранов, отмена одного не должна ломать другие.
  const value = fetchJSON<ShowDTO>(`/tv/${id}`, {}).then((d) => ({
    id: d.id,
    status: d.status ?? '',
    seasons: (d.seasons ?? [])
      .filter((s) => typeof s.season_number === 'number')
      .map((s) => ({ number: s.season_number, episodeCount: s.episode_count ?? 0, airDate: s.air_date ?? null }))
      .sort((a, b) => a.number - b.number),
    episodeRuntime: d.episode_run_time?.[0] || d.last_episode_to_air?.runtime || undefined,
    next: toBrief(d.next_episode_to_air),
    last: toBrief(d.last_episode_to_air),
  }));
  outlineCache.set(id, { at: Date.now(), value });
  value.catch(() => outlineCache.delete(id));
  return signal ? abortable(value, signal) : value;
}

export function fetchSeason(id: number, season: number, signal?: AbortSignal): Promise<SeasonData> {
  const key = `${id}:${season}`;
  let value = seasonCache.get(key);
  if (!value) {
    value = loadSeason(id, season);
    seasonCache.set(key, value);
    value.then(
      (d) => seasonReady.set(key, d),
      () => seasonCache.delete(key),
    );
  }
  return signal ? abortable(value, signal) : value;
}

async function loadSeason(id: number, season: number): Promise<SeasonData> {
  const ru = await fetchJSON<SeasonDTO>(`/tv/${id}/season/${season}`, {});
  const list = ru.episodes ?? [];
  // Русских названий нет — пробуем английские одним запросом на сезон.
  let en = new Map<number, string>();
  if (list.some((e) => isGenericName(e.name))) {
    try {
      const r = await fetchJSON<SeasonDTO>(`/tv/${id}/season/${season}`, { language: 'en-US' });
      en = new Map((r.episodes ?? []).map((e) => [e.episode_number, e.name ?? '']));
    } catch {
      // без английских названий: будет «Серия N»
    }
  }
  return {
    number: season,
    episodes: list
      .map((e) => {
        const alt = en.get(e.episode_number);
        const name = !isGenericName(e.name) ? e.name!.trim() : !isGenericName(alt) ? alt!.trim() : `Серия ${e.episode_number}`;
        return {
          season,
          number: e.episode_number,
          code: episodeCode(season, e.episode_number),
          name,
          airDate: e.air_date || null,
          runtime: e.runtime && e.runtime > 0 ? e.runtime : null,
          stillPath: e.still_path ?? null,
        };
      })
      .sort((a, b) => a.number - b.number),
  };
}

function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

/* ---------- порядок и отметки ---------- */

/** Сезоны, которые показываются и считаются: без «Спецвыпусков», если есть обычные. */
export function regularSeasons(outline: ShowOutline): SeasonInfo[] {
  const regular = outline.seasons.filter((s) => s.number > 0 && s.episodeCount > 0);
  if (regular.length) return regular;
  return outline.seasons.filter((s) => s.episodeCount > 0);
}

/**
 * Все серии по порядку (коды). Для загруженных сезонов — настоящие номера серий,
 * для остальных — 1..episode_count из сводки сериала.
 */
export function episodeOrder(outline: ShowOutline): string[] {
  const out: string[] = [];
  for (const s of regularSeasons(outline)) {
    const data = peekSeason(outline.id, s.number);
    if (data && data.episodes.length) for (const e of data.episodes) out.push(e.code);
    else for (let i = 1; i <= s.episodeCount; i++) out.push(episodeCode(s.number, i));
  }
  return out;
}

/** Отмеченные серии, приведённые к episodesWatched (правила 2–3 сверху). */
export function resolveWatched(
  entry: Pick<SavedDrama, 'episodesWatched' | 'watchedEpisodes'> | null | undefined,
  order: string[],
): Set<string> {
  const count = entry ? Math.max(0, entry.episodesWatched) : 0;
  const set = new Set(entry?.watchedEpisodes ?? []);
  if (set.size < count) {
    for (const code of order) {
      if (set.size >= count) break;
      set.add(code);
    }
  } else if (set.size > count) {
    for (let i = order.length - 1; i >= 0 && set.size > count; i--) set.delete(order[i]);
    // Отмечено что-то вне известного порядка — снимаем с конца по сортировке кодов.
    if (set.size > count) {
      const rest = sortCodes([...set]);
      while (set.size > count) set.delete(rest.pop()!);
    }
  }
  return set;
}

export function sortCodes(codes: string[]): string[] {
  return codes
    .map((c) => ({ c, p: parseCode(c) ?? [0, 0] }))
    .sort((a, b) => a.p[0] - b.p[0] || a.p[1] - b.p[1])
    .map((x) => x.c);
}

/** Вышла ли серия: дата не позже сегодняшней; без даты — только у завершённого сериала. */
export function isAired(e: Pick<Episode, 'airDate'>, outline?: ShowOutline | null, today = todayKey()): boolean {
  if (e.airDate) return e.airDate <= today;
  return !!outline && (outline.status === 'Ended' || outline.status === 'Canceled');
}

/* ---------- запись ---------- */

// Изменения идут по очереди: два быстрых нажатия не затирают друг друга.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Изменить набор отмеченных серий. Запись читается из базы свежей; нет в библиотеке — добавляется
 * со статусом «Смотрю». Досмотрели последнюю серию при «Смотрю» — «Просмотрено» (как у «+»).
 */
export function changeWatched(
  drama: Drama,
  order: string[],
  mutate: (set: Set<string>) => void,
  episodeCount?: number,
): Promise<void> {
  return enqueue(async () => {
    const key = itemKey('tv', drama.id);
    let entry = await db.items.get(key);
    if (!entry) {
      await addToLibrary(drama, 'watching');
      entry = await db.items.get(key);
      if (!entry) return;
    }
    const set = resolveWatched(entry, order);
    mutate(set);
    const codes = sortCodes([...set]);
    const patch: Partial<SavedDrama> = { watchedEpisodes: codes, episodesWatched: codes.length };
    const total = episodeCount ?? entry.episodeCount;
    if (total && codes.length >= total && entry.status === 'watching') patch.status = 'completed';
    await updateEntry(key, patch);
  });
}

/**
 * Поля для смены числа серий кнопками «− +» и статусом. Набор отмеченных пересчитывается сразу,
 * если порядок серий известен; иначе меняется только число, а набор догонит его по правилу 3.
 */
export function countPatch(entry: SavedDrama, value: number, order: string[] | null): Partial<SavedDrama> {
  const patch: Partial<SavedDrama> = { episodesWatched: value };
  if (entry.watchedEpisodes) {
    if (order && order.length) patch.watchedEpisodes = sortCodes([...resolveWatched({ ...entry, episodesWatched: value }, order)]);
  }
  return patch;
}

/** Та же очередь для «− +» в редакторе: читаем свежую запись, чтобы быстрые нажатия не терялись. */
export function stepWatched(key: string, delta: number, order: string[] | null, episodeCount?: number): Promise<void> {
  return enqueue(async () => {
    const entry = await db.items.get(key);
    if (!entry) return;
    const max = episodeCount ?? 9999;
    const value = Math.max(0, Math.min(max, entry.episodesWatched + delta));
    if (value === entry.episodesWatched) return;
    const patch = countPatch(entry, value, order);
    if (episodeCount && value >= episodeCount && entry.status === 'watching') patch.status = 'completed';
    await updateEntry(key, patch);
  });
}
