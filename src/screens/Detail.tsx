import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Poster } from '../components/Poster';
import { addToLibrary, db, refreshMetadata, removeEntry, updateEntry } from '../lib/db';
import { useConfigured } from '../lib/hooks';
import { goBack } from '../lib/router';
import { details, dramaCache } from '../lib/tmdb';
import {
  countryOf,
  formatRuntime,
  itemKey,
  localizedAirStatus,
  savedToDrama,
  STATUSES,
  yearOf,
  type Drama,
  type MediaType,
  type SavedDrama,
  type WatchStatus,
} from '../lib/types';

export function Detail({ mediaType, id }: { mediaType: MediaType; id: number }) {
  const key = itemKey(mediaType, id);
  const configured = useConfigured();
  const entry = useLiveQuery(() => db.items.get(key), [key]);
  const [fresh, setFresh] = useState<Drama | null>(dramaCache.get(key) ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    const controller = new AbortController();
    details(mediaType, id, controller.signal)
      .then((d) => {
        dramaCache.set(key, d);
        setFresh(d);
        void refreshMetadata(d);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [mediaType, id, key, configured]);

  // undefined = Dexie ещё не ответил; не показываем кнопку «Добавить», пока не знаем.
  const loadingEntry = entry === undefined;
  const drama: Drama | null = fresh ?? (entry ? savedToDrama(entry) : null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && goBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isMovie = mediaType === 'movie';
  const country = drama ? countryOf(drama.originCountries) : undefined;
  const airStatus = drama ? localizedAirStatus(drama.airStatus, mediaType) : null;
  const runtime = drama ? formatRuntime(drama.runtime) : null;

  return (
    <div className="detail" role="dialog" aria-modal="true">
      <header className="detail-bar">
        <button className="back" onClick={goBack} aria-label="Назад">
          ‹ Назад
        </button>
        <span className="detail-kind">{isMovie ? '🎬 Фильм' : '📺 Сериал'}</span>
      </header>

      {!drama ? (
        <div className="content">
          <div className="empty">
            <div className="empty-icon">{error ? '📡' : '⏳'}</div>
            <div className="empty-title">{error ?? 'Загружаем…'}</div>
          </div>
        </div>
      ) : (
        <div className="content detail-content">
          <Hero drama={drama} />

          {loadingEntry ? null : entry ? (
            <EntryEditor entry={entry} episodeCount={isMovie ? undefined : (drama.episodeCount ?? entry.episodeCount)} />
          ) : (
            <AddButtons drama={drama} />
          )}

          {drama.overview && (
            <section className="block">
              <h2>Описание</h2>
              <p className="overview">{drama.overview}</p>
            </section>
          )}

          <section className="block">
            <h2>Информация</h2>
            <dl className="info">
              {drama.originalTitle && drama.originalTitle !== drama.title && (
                <Row label="Оригинал" value={drama.originalTitle} />
              )}
              {country && <Row label="Страна" value={`${country.flag} ${country.title}`} />}
              {drama.firstAirDate && <Row label="Премьера" value={formatDate(drama.firstAirDate)} />}
              {airStatus && <Row label="Статус" value={airStatus} />}
              {isMovie && runtime && <Row label="Длительность" value={runtime} />}
              {!isMovie && drama.episodeCount && (
                <Row
                  label="Серии"
                  value={drama.seasonCount ? `${drama.episodeCount} эп., сезонов: ${drama.seasonCount}` : `${drama.episodeCount} эп.`}
                />
              )}
              {drama.genreNames.length > 0 && <Row label="Жанры" value={drama.genreNames.join(', ')} />}
              {drama.voteCount > 0 && (
                <Row label="Рейтинг TMDB" value={`★ ${drama.voteAverage.toFixed(1)} (${drama.voteCount})`} />
              )}
            </dl>
            {error && <p className="muted small">Подробности не загрузились: {error}</p>}
          </section>
        </div>
      )}
    </div>
  );
}

function Hero({ drama }: { drama: Drama }) {
  const country = countryOf(drama.originCountries);
  const year = yearOf(drama.firstAirDate);
  return (
    <div className="hero">
      <Poster path={drama.posterPath} alt={drama.title} size="w342" className="hero-poster" />
      <div className="hero-body">
        <h1 className="hero-title">{drama.title}</h1>
        <div className="muted">
          {country?.flag} {year ?? ''}
        </div>
        {drama.voteAverage > 0 && <div className="hero-rating">★ {drama.voteAverage.toFixed(1)}</div>}
        {drama.genreNames.length > 0 && <div className="muted small">{drama.genreNames.slice(0, 3).join(' · ')}</div>}
      </div>
    </div>
  );
}

function AddButtons({ drama }: { drama: Drama }) {
  const [open, setOpen] = useState(false);
  const statuses = drama.mediaType === 'movie' ? STATUSES.filter((s) => s.id !== 'watching' && s.id !== 'onHold') : STATUSES;
  if (!open) {
    return (
      <button className="btn btn-primary btn-wide" onClick={() => setOpen(true)}>
        ＋ Добавить в библиотеку
      </button>
    );
  }
  return (
    <div className="block">
      <h2>Со статусом</h2>
      <div className="status-buttons">
        {statuses.map((s) => (
          <button key={s.id} className="btn" onClick={() => void addToLibrary(drama, s.id)}>
            {s.icon} {s.title}
          </button>
        ))}
      </div>
    </div>
  );
}

function EntryEditor({ entry, episodeCount }: { entry: SavedDrama; episodeCount: number | undefined }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [notes, setNotes] = useState(entry.notes);
  const isMovie = entry.mediaType === 'movie';

  const setStatus = (status: WatchStatus) => {
    const patch: Partial<SavedDrama> = { status };
    if (status === 'completed' && episodeCount) patch.episodesWatched = episodeCount;
    void updateEntry(entry.key, patch);
  };

  const setEpisodes = (n: number) => {
    const max = episodeCount ?? 9999;
    const value = Math.max(0, Math.min(max, n));
    const patch: Partial<SavedDrama> = { episodesWatched: value };
    if (episodeCount && value >= episodeCount && entry.status === 'watching') patch.status = 'completed';
    void updateEntry(entry.key, patch);
  };

  return (
    <section className="block editor">
      <h2>Моя библиотека</h2>

      <label className="field">
        <span>Статус</span>
        <select value={entry.status} onChange={(e) => setStatus(e.target.value as WatchStatus)}>
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.icon} {s.title}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Избранное</span>
        <input
          type="checkbox"
          checked={entry.isFavorite}
          onChange={(e) => void updateEntry(entry.key, { isFavorite: e.target.checked })}
        />
      </label>

      {!isMovie && (
        <div className="field">
          <span>Просмотрено серий</span>
          <div className="stepper">
            <button onClick={() => setEpisodes(entry.episodesWatched - 1)} aria-label="Минус серия">
              −
            </button>
            <span className="stepper-value">
              {entry.episodesWatched}
              {episodeCount ? ` / ${episodeCount}` : ''}
            </span>
            <button onClick={() => setEpisodes(entry.episodesWatched + 1)} aria-label="Плюс серия">
              +
            </button>
          </div>
        </div>
      )}

      <label className="field">
        <span>Моя оценка</span>
        <select
          value={entry.userRating ?? ''}
          onChange={(e) => void updateEntry(entry.key, { userRating: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Без оценки</option>
          {Array.from({ length: 10 }, (_, i) => 10 - i).map((v) => (
            <option key={v} value={v}>
              {'★'.repeat(Math.round(v / 2))} {v}
            </option>
          ))}
        </select>
      </label>

      <label className="field field-column">
        <span>Заметки</span>
        <textarea
          rows={3}
          placeholder="Впечатления, где остановились…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== entry.notes && void updateEntry(entry.key, { notes })}
        />
      </label>

      <div className="muted small">Добавлено {formatDate(new Date(entry.addedAt).toISOString().slice(0, 10))}</div>

      {confirmRemove ? (
        <div className="status-buttons">
          <button className="btn btn-danger" onClick={() => void removeEntry(entry.key)}>
            Да, удалить
          </button>
          <button className="btn" onClick={() => setConfirmRemove(false)}>
            Отмена
          </button>
        </div>
      ) : (
        <button className="btn btn-danger-text" onClick={() => setConfirmRemove(true)}>
          Удалить из библиотеки
        </button>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
