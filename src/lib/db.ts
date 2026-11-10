import Dexie, { type Table } from 'dexie';
import { itemKey, type Drama, type MediaType, type SavedDrama, type WatchStatus } from './types';

/** Запись первой версии базы: только сериалы, ключ — числовой tmdbId. */
type LegacySaved = Omit<SavedDrama, 'key' | 'mediaType'>;

interface OutboxRow {
  key: string;
  op: 'put' | 'delete';
  ts: number;
}

class DoramyDB extends Dexie {
  items!: Table<SavedDrama, string>;
  outbox!: Table<OutboxRow, string>;

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
  }
}

/** Подключается из sync.ts, чтобы db.ts не зависел от него (иначе циклический импорт). */
let onChange: ((key: string, op: 'put' | 'delete') => void) | null = null;
export function setChangeListener(fn: typeof onChange) {
  onChange = fn;
}

export const db = new DoramyDB();

export async function addToLibrary(drama: Drama, status: WatchStatus): Promise<void> {
  const now = Date.now();
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
    status,
    userRating: null,
    episodesWatched: status === 'completed' ? (drama.episodeCount ?? 0) : 0,
    notes: '',
    isFavorite: false,
    addedAt: now,
    updatedAt: now,
  };
  await db.items.put(entry);
  onChange?.(entry.key, 'put');
}

export async function updateEntry(key: string, patch: Partial<SavedDrama>): Promise<void> {
  await db.items.update(key, { ...patch, updatedAt: Date.now() });
  onChange?.(key, 'put');
}

export async function removeEntry(key: string): Promise<void> {
  await db.items.delete(key);
  onChange?.(key, 'delete');
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
  });
}

export async function exportLibrary(): Promise<string> {
  const items = await db.items.toArray();
  return JSON.stringify({ app: 'doramy', version: 2, exportedAt: new Date().toISOString(), items }, null, 2);
}

const STATUSES: WatchStatus[] = ['planned', 'watching', 'completed', 'onHold', 'dropped'];
const MEDIA: MediaType[] = ['tv', 'movie'];

/** Импорт: записи с тем же ключом заменяются. Понимает и файлы первой версии (без mediaType). */
export async function importLibrary(json: string): Promise<number> {
  const parsed = JSON.parse(json) as { items?: unknown };
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
      status: STATUSES.includes(raw.status as WatchStatus) ? (raw.status as WatchStatus) : 'planned',
      userRating: typeof raw.userRating === 'number' ? raw.userRating : null,
      episodesWatched: raw.episodesWatched ?? 0,
      notes: raw.notes ?? '',
      isFavorite: !!raw.isFavorite,
      addedAt: raw.addedAt ?? now,
      updatedAt: raw.updatedAt ?? now,
    });
  }
  await db.items.bulkPut(items);
  for (const it of items) onChange?.(it.key, 'put');
  return items.length;
}
