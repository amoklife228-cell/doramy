import Dexie, { type Table } from 'dexie';
import { localizeTitles, needsRussianTitle } from './tmdb';
import { noteAction } from './track';
import {
  itemKey,
  minutesPerUnit,
  savedToDrama,
  todayKey,
  type ActivityDay,
  type Drama,
  type LibraryKind,
  type MediaType,
  type SavedDrama,
  type WatchStatus,
} from './types';

/** Запись первой версии базы: только сериалы, ключ — числовой tmdbId. */
type LegacySaved = Omit<SavedDrama, 'key' | 'mediaType'>;

export type OutboxOp = 'put' | 'delete' | 'activity';

interface OutboxRow {
  key: string;
  op: OutboxOp;
  ts: number;
}

class DoramyDB extends Dexie {
  items!: Table<SavedDrama, string>;
  outbox!: Table<OutboxRow, string>;
  activity!: Table<ActivityDay, string>;

  constructor() {
    super('doramy');
    this.version(1).stores({
      library: 'tmdbId, status, isFavorite, addedAt, updatedAt',
    });
    // v2: фильмы и сериалы в одной таблице со строковым ключом `${type}:${id}`.
    // Dexie не умеет менять первичный ключ, поэтому новая таблица + перенос, старая удаляется в v3.
    this.version(2)
      .stores({
        library: 'tmdbId, status, isFavorite, addedAt, updatedAt',
        items: 'key, mediaType, status, isFavorite, addedAt, updatedAt',
      })
      .upgrade(async (tx) => {
        const old = (await tx.table('library').toArray()) as LegacySaved[];
        if (old.length) {
          await tx
            .table('items')
            .bulkPut(old.map((s) => ({ ...s, key: itemKey('tv', s.tmdbId), mediaType: 'tv' as const })));
        }
      });
    this.version(3).stores({
      library: null,
      items: 'key, mediaType, status, isFavorite, addedAt, updatedAt',
    });
    // v4: очередь изменений для синхронизации с аккаунтом.
    this.version(4).stores({
      items: 'key, mediaType, status, isFavorite, addedAt, updatedAt',
      outbox: 'key',
    });
    // v5: активность по дням для профиля.
    this.version(5).stores({
      items: 'key, mediaType, status, isFavorite, addedAt, updatedAt',
      outbox: 'key',
      activity: 'day',
    });
  }
}

export const db = new DoramyDB();

/** Подключается из sync.ts, чтобы db.ts не зависел от него (иначе циклический импорт). */
let onChange: ((key: string, op: OutboxOp) => void) | null = null;
export function setChangeListener(fn: typeof onChange) {
  onChange = fn;
}

/** Засчитать просмотр: units серий (фильм = 1), minutes минут, за сегодняшний день. */
export async function logActivity(units: number, minutes: number, day = todayKey()): Promise<void> {
  if (units <= 0) return;
  const existing = await db.activity.get(day);
  const row: ActivityDay = {
    ...existing,
    day,
    units: (existing?.units ?? 0) + units,
    minutes: (existing?.minutes ?? 0) + Math.max(0, Math.round(minutes)),
    updatedAt: Date.now(),
  };
  await db.activity.put(row);
  onChange?.(day, 'activity');
}

/** Сколько уже засчитано у записи: для старых записей без поля — по текущему прогрессу. */
function countedOf(s: SavedDrama): number {
  if (typeof s.countedUnits === 'number') return s.countedUnits;
  if (s.mediaType === 'movie') return s.status === 'completed' ? 1 : 0;
  return s.episodesWatched;
}

export async function addToLibrary(drama: Drama, status: WatchStatus): Promise<void> {
  const now = Date.now();
  const watched = status === 'completed' ? (drama.mediaType === 'movie' ? 1 : (drama.episodeCount ?? 0)) : 0;
  const entry: SavedDrama = {
    key: itemKey(drama.mediaType, drama.id),
    mediaType: drama.mediaType,
    tmdbId: drama.id,
    title: drama.title,
    originalTitle: drama.originalTitle,
    overview: drama.overview,
    posterPath: drama.posterPath,
    firstAirDate: drama.firstAirDate,
    voteAverage: drama.voteAverage,
    voteCount: drama.voteCount,
    originCountries: drama.originCountries,
    genreNames: drama.genreNames,
    episodeCount: drama.episodeCount,
    runtime: drama.runtime,
    episodeRuntime: drama.episodeRuntime,
    status,
    userRating: null,
    episodesWatched: drama.mediaType === 'movie' ? 0 : watched,
    countedUnits: watched,
    notes: '',
    isFavorite: false,
    addedAt: now,
    updatedAt: now,
  };
  await db.items.put(entry);
  onChange?.(entry.key, 'put');
  noteAction();
  if (watched > 0) await logActivity(watched, watched * minutesPerUnit(drama));
}

/**
 * Обновить запись. Если прогресс превысил уже засчитанный (countedUnits),
 * разница засчитывается в активность за сегодня; откат и повтор второй раз не считаются.
 */
export async function updateEntry(key: string, patch: Partial<SavedDrama>): Promise<void> {
  const before = await db.items.get(key);
  if (!before) return;

  const counted = countedOf(before);
  const progress =
    before.mediaType === 'movie'
      ? (patch.status ?? before.status) === 'completed'
        ? 1
        : 0
      : (patch.episodesWatched ?? before.episodesWatched);
  const delta = progress - counted;

  await db.items.update(key, {
    ...patch,
    ...(delta > 0 || before.countedUnits === undefined ? { countedUnits: Math.max(counted, progress) } : {}),
    updatedAt: Date.now(),
  });
  onChange?.(key, 'put');
  noteAction();
  if (delta > 0) await logActivity(delta, delta * minutesPerUnit(before));
}

export async function removeEntry(key: string): Promise<void> {
  await db.items.delete(key);
  onChange?.(key, 'delete');
  noteAction();
}

/** Обновить метаданные из свежего ответа TMDB, не трогая пользовательские поля и updatedAt. */
export async function refreshMetadata(drama: Drama): Promise<void> {
  const key = itemKey(drama.mediaType, drama.id);
  const existing = await db.items.get(key);
  if (!existing) return;
  await db.items.update(key, {
    title: drama.title,
    originalTitle: drama.originalTitle,
    overview: drama.overview || existing.overview,
    posterPath: drama.posterPath ?? existing.posterPath,
    firstAirDate: drama.firstAirDate ?? existing.firstAirDate,
    voteAverage: drama.voteAverage,
    voteCount: drama.voteCount,
    originCountries: drama.originCountries.length ? drama.originCountries : existing.originCountries,
    genreNames: drama.genreNames.length ? drama.genreNames : existing.genreNames,
    episodeCount: drama.episodeCount ?? existing.episodeCount,
    runtime: drama.runtime ?? existing.runtime,
    episodeRuntime: drama.episodeRuntime ?? existing.episodeRuntime,
  });
}

/**
 * Записи, добавленные с оригинальным названием (연인, 深夜食堂), получают русское или английское.
 * Меняется только title на этом устройстве, время правки не трогается.
 */
export async function fixLibraryTitles(): Promise<number> {
  const all = await db.items.toArray();
  const need = all.filter((s) => needsRussianTitle(s.title));
  if (need.length === 0) return 0;
  const fixed = await localizeTitles(need.map(savedToDrama));
  let changed = 0;
  for (let i = 0; i < need.length; i++) {
    if (fixed[i].title !== need[i].title) {
      await db.items.update(need[i].key, { title: fixed[i].title });
      changed++;
    }
  }
  return changed;
}

export async function exportLibrary(): Promise<string> {
  const items = await db.items.toArray();
  const activity = await db.activity.toArray();
  return JSON.stringify(
    { app: 'doramy', version: 3, exportedAt: new Date().toISOString(), items, activity },
    null,
    2,
  );
}

const STATUSES: WatchStatus[] = ['planned', 'watching', 'completed', 'onHold', 'dropped'];
const MEDIA: MediaType[] = ['tv', 'movie'];
const KINDS: LibraryKind[] = ['dorama', 'series', 'movie'];

/** Импорт: записи с тем же ключом заменяются. Понимает и файлы первых версий. */
export async function importLibrary(json: string): Promise<number> {
  const parsed = JSON.parse(json) as { items?: unknown; activity?: unknown };
  if (!parsed || !Array.isArray(parsed.items)) throw new Error('Это не файл экспорта «Дорамы».');
  const items: SavedDrama[] = [];
  for (const raw of parsed.items as Partial<SavedDrama>[]) {
    if (typeof raw.tmdbId !== 'number' || typeof raw.title !== 'string') continue;
    const now = Date.now();
    const mediaType: MediaType = MEDIA.includes(raw.mediaType as MediaType) ? (raw.mediaType as MediaType) : 'tv';
    items.push({
      key: itemKey(mediaType, raw.tmdbId),
      mediaType,
      tmdbId: raw.tmdbId,
      title: raw.title,
      originalTitle: raw.originalTitle ?? '',
      overview: raw.overview ?? '',
      posterPath: raw.posterPath ?? null,
      firstAirDate: raw.firstAirDate ?? null,
      voteAverage: raw.voteAverage ?? 0,
      voteCount: raw.voteCount ?? 0,
      originCountries: raw.originCountries ?? [],
      genreNames: raw.genreNames ?? [],
      episodeCount: raw.episodeCount,
      runtime: raw.runtime,
      episodeRuntime: raw.episodeRuntime,
      kind: KINDS.includes(raw.kind as LibraryKind) ? (raw.kind as LibraryKind) : undefined,
      status: STATUSES.includes(raw.status as WatchStatus) ? (raw.status as WatchStatus) : 'planned',
      userRating: typeof raw.userRating === 'number' ? raw.userRating : null,
      episodesWatched: raw.episodesWatched ?? 0,
      countedUnits: typeof raw.countedUnits === 'number' ? raw.countedUnits : undefined,
      watchedEpisodes: Array.isArray(raw.watchedEpisodes)
        ? raw.watchedEpisodes.filter((c): c is string => typeof c === 'string' && /^s\d+e\d+$/.test(c))
        : undefined,
      notes: raw.notes ?? '',
      review: typeof raw.review === 'string' ? raw.review : undefined,
      isFavorite: !!raw.isFavorite,
      addedAt: raw.addedAt ?? now,
      updatedAt: raw.updatedAt ?? now,
    });
  }
  await db.items.bulkPut(items);
  for (const it of items) onChange?.(it.key, 'put');

  if (Array.isArray(parsed.activity)) {
    const days: ActivityDay[] = [];
    for (const raw of parsed.activity as Partial<ActivityDay>[]) {
      if (typeof raw.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.day)) continue;
      // Повторный импорт той же копии не должен удваивать дни: берём большее из своего и импортированного.
      const existing = await db.activity.get(raw.day);
      days.push({
        ...existing,
        day: raw.day,
        units: Math.max(existing?.units ?? 0, raw.units ?? 0),
        minutes: Math.max(existing?.minutes ?? 0, raw.minutes ?? 0),
        updatedAt: Date.now(),
      });
    }
    await db.activity.bulkPut(days);
    for (const d of days) onChange?.(d.day, 'activity');
  }
  return items.length;
}
