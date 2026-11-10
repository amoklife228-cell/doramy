import Dexie, { type Table } from 'dexie';
import type { Drama, SavedDrama, WatchStatus } from './types';

class DoramyDB extends Dexie {
  library!: Table<SavedDrama, number>;

  constructor() {
    super('doramy');
    this.version(1).stores({
      library: 'tmdbId, status, isFavorite, addedAt, updatedAt',
    });
  }
}

export const db = new DoramyDB();

export async function addToLibrary(drama: Drama, status: WatchStatus): Promise<void> {
  const now = Date.now();
  const entry: SavedDrama = {
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
    status,
    userRating: null,
    episodesWatched: status === 'completed' ? (drama.episodeCount ?? 0) : 0,
    notes: '',
    isFavorite: false,
    addedAt: now,
    updatedAt: now,
  };
  await db.library.put(entry);
}

export async function updateEntry(tmdbId: number, patch: Partial<SavedDrama>): Promise<void> {
  await db.library.update(tmdbId, { ...patch, updatedAt: Date.now() });
}

export async function removeEntry(tmdbId: number): Promise<void> {
  await db.library.delete(tmdbId);
}

/** Обновить метаданные из свежего ответа TMDB, не трогая пользовательские поля и updatedAt. */
export async function refreshMetadata(drama: Drama): Promise<void> {
  const existing = await db.library.get(drama.id);
  if (!existing) return;
  await db.library.update(drama.id, {
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
  });
}

export async function exportLibrary(): Promise<string> {
  const items = await db.library.toArray();
  return JSON.stringify({ app: 'doramy', version: 1, exportedAt: new Date().toISOString(), items }, null, 2);
}

const STATUSES: WatchStatus[] = ['planned', 'watching', 'completed', 'onHold', 'dropped'];

/** Импорт: записи с тем же tmdbId заменяются. Возвращает число импортированных. */
export async function importLibrary(json: string): Promise<number> {
  const parsed = JSON.parse(json) as { items?: unknown };
  if (!parsed || !Array.isArray(parsed.items)) throw new Error('Это не файл экспорта «Дорамы».');
  const items: SavedDrama[] = [];
  for (const raw of parsed.items as Partial<SavedDrama>[]) {
    if (typeof raw.tmdbId !== 'number' || typeof raw.title !== 'string') continue;
    const now = Date.now();
    items.push({
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
      status: STATUSES.includes(raw.status as WatchStatus) ? (raw.status as WatchStatus) : 'planned',
      userRating: typeof raw.userRating === 'number' ? raw.userRating : null,
      episodesWatched: raw.episodesWatched ?? 0,
      notes: raw.notes ?? '',
      isFavorite: !!raw.isFavorite,
      addedAt: raw.addedAt ?? now,
      updatedAt: raw.updatedAt ?? now,
    });
  }
  await db.library.bulkPut(items);
  return items.length;
}
