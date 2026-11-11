import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Poster } from '../components/Poster';
import { TrailerBlock } from '../components/TrailerBlock';
import { EmptyState, NotConfigured } from '../components/DramaGrid';
import { IosRow, IosSection, IosSwitch } from '../components/IosList';
import { NavBar } from '../components/NavBar';
import { addToLibrary, db, refreshMetadata, removeEntry, updateEntry } from '../lib/db';
import { useConfigured } from '../lib/hooks';
import { goBack } from '../lib/router';
import { details, dramaCache } from '../lib/tmdb';
import {
  autoKindOf,
  countryOf,
  formatRuntime,
  itemKey,
  kindOf,
  LIBRARY_KINDS,
  localizedAirStatus,
  savedToDrama,
  STATUSES,
  todayKey,
  yearOf,
  type Drama,
  type LibraryKind,
  type MediaType,
  type SavedDrama,
  type WatchStatus,
} from '../lib/types';

export function Detail({ mediaType, id }: { mediaType: MediaType; id: number }) {
  const key = itemKey(mediaType, id);
  const configured = useConfigured();
  // undefined = ещё грузится, null = записи нет (get() сам по себе отдаёт undefined в обоих случаях).
  const entry = useLiveQuery(async () => (await db.items.get(key)) ?? null, [key]);
  const [fresh, setFresh] = useState<Drama | null>(dramaCache.get(key) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!configured) return;
    const controller = new AbortController();
    setError(null);
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
  }, [mediaType, id, key, configured, attempt]);

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
      <NavBar title={isMovie ? 'Фильм' : 'Сериал'} />

      {!drama ? (
        <div className="content">
          {entry === null && !configured ? (
            <NotConfigured />
          ) : error ? (
            <EmptyState
              title="Не удалось загрузить"
              text={error}
              action={
                <button className="btn btn-primary" onClick={() => setAttempt((n) => n + 1)}>
                  Повторить
                </button>
              }
            />
          ) : (
            <HeroSkeleton />
          )}
        </div>
      ) : (
        <div className="content detail-content">
          <Hero drama={drama} />

          {loadingEntry ? null : entry ? (
            <EntryEditor entry={entry} episodeCount={isMovie ? undefined : (drama.episodeCount ?? entry.episodeCount)} />
          ) : (
            <AddButtons drama={drama} />
          )}

          <a
            className="btn btn-wide btn-search"
            href={searchUrl(drama.title, drama.originalTitle, yearOf(drama.firstAirDate), isMovie)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Найти в интернете
          </a>

          <TrailerBlock mediaType={mediaType} id={id} enabled={configured} />

          {drama.overview && (
            <section className="block">
              <h2>Описание</h2>
              <p className="overview">{drama.overview}</p>
            </section>
          )}

          <IosSection
            title="Информация"
            footer={error ? `Подробности не загрузились: ${error}` : undefined}
          >
            {drama.originalTitle && drama.originalTitle !== drama.title && (
              <InfoRow label="Оригинал" value={drama.originalTitle} />
            )}
            {country && <InfoRow label="Страна" value={country.title} />}
            {drama.firstAirDate && <InfoRow label="Премьера" value={formatDate(drama.firstAirDate)} />}
            {airStatus && <InfoRow label="Статус" value={airStatus} />}
            {isMovie && runtime && <InfoRow label="Длительность" value={runtime} />}
            {!isMovie && drama.episodeCount && (
              <InfoRow
                label="Серии"
                value={drama.seasonCount ? `${drama.episodeCount} эп., сезонов: ${drama.seasonCount}` : `${drama.episodeCount} эп.`}
              />
            )}
            {drama.genreNames.length > 0 && <InfoRow label="Жанры" value={drama.genreNames.join(', ')} />}
            {drama.voteCount > 0 && (
              <InfoRow label="Рейтинг TMDB" value={`★ ${drama.voteAverage.toFixed(1)} (${drama.voteCount})`} />
            )}
          </IosSection>
        </div>
      )}
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="hero" aria-busy="true" aria-label="Загружаем">
      <div className="hero-poster skeleton" />
      <div className="hero-body" style={{ flex: 1 }}>
        <div className="skeleton skeleton-line" style={{ width: '85%', height: 22 }} />
        <div className="skeleton skeleton-line" style={{ width: '55%' }} />
        <div className="skeleton skeleton-line" style={{ width: '35%' }} />
      </div>
    </div>
  );
}

function Hero({ drama }: { drama: Drama }) {
  const country = countryOf(drama.originCountries);
  const year = yearOf(drama.firstAirDate);
  return (
    <div className="hero">
      <Poster path={drama.posterPath} alt={drama.title} size="w500" className="hero-poster" />
      <div className="hero-body">
        <h1 className="hero-title">{drama.title}</h1>
        <div className="muted">{[year, country?.title].filter(Boolean).join(' · ')}</div>
        {drama.voteAverage > 0 && <div className="hero-rating">★ {drama.voteAverage.toFixed(1)}</div>}
        {drama.genreNames.length > 0 && <div className="muted small">{drama.genreNames.slice(0, 3).join(' · ')}</div>}
      </div>
    </div>
  );
}

/** Одно нажатие добавляет со статусом «Хочу посмотреть»; статус потом меняется строкой в редакторе. */
function AddButtons({ drama }: { drama: Drama }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-primary btn-wide"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void addToLibrary(drama, 'planned').finally(() => setBusy(false));
      }}
    >
      Добавить в библиотеку
    </button>
  );
}

function statusesFor(isMovie: boolean) {
  return isMovie ? STATUSES.filter((s) => s.id !== 'watching' && s.id !== 'onHold') : STATUSES;
}

function EntryEditor({ entry, episodeCount }: { entry: SavedDrama; episodeCount: number | undefined }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [notes, setNotes] = useState(entry.notes);
  const isMovie = entry.mediaType === 'movie';

  // Заметка сохраняется сама через полсекунды после ввода и при уходе с экрана.
  // На iOS нажатие «Назад» не снимает фокус с поля, поэтому на onBlur полагаться нельзя.
  const pending = useRef<{ key: string; notes: string } | null>(null);
  const flush = () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    void updateEntry(p.key, { notes: p.notes });
  };
  useEffect(() => {
    if (notes === entry.notes) return;
    pending.current = { key: entry.key, notes };
    const t = setTimeout(flush, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);
  useEffect(() => flush, []);

  // Заметку поменяли на другом устройстве, а здесь её сейчас не редактируют — показываем новую.
  const notesRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!pending.current && document.activeElement !== notesRef.current) setNotes(entry.notes);
  }, [entry.notes]);

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

  const autoKind = autoKindOf(entry);
  const kindTitle = (k: LibraryKind) => LIBRARY_KINDS.find((x) => x.id === k)!;

  const statusTitle = STATUSES.find((s) => s.id === entry.status)?.title ?? '';
  const statusOptions = statusesFor(isMovie);
  // Если у фильма каким-то образом стоит «Смотрю», не теряем это значение в списке.
  const shownStatuses = statusOptions.some((s) => s.id === entry.status)
    ? statusOptions
    : [...statusOptions, STATUSES.find((s) => s.id === entry.status)!];

  return (
    <>
      <IosSection
        title="Моя библиотека"
        footer={`Добавлено ${formatDate(todayKey(new Date(entry.addedAt)))}`}
      >
        <IosRow label="Статус" value={statusTitle} chevron>
          <select
            className="ios-select-overlay"
            aria-label="Статус"
            value={entry.status}
            onChange={(e) => setStatus(e.target.value as WatchStatus)}
          >
            {shownStatuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </IosRow>

        {!isMovie && (
          <IosRow
            label="Серии"
            sub={episodeCount ? `${entry.episodesWatched} из ${episodeCount}` : `просмотрено ${entry.episodesWatched}`}
          >
            <div className="stepper">
              <button
                onClick={() => setEpisodes(entry.episodesWatched - 1)}
                disabled={entry.episodesWatched <= 0}
                aria-label="Минус серия"
              >
                −
              </button>
              <span className="stepper-divider" aria-hidden="true" />
              <button
                onClick={() => setEpisodes(entry.episodesWatched + 1)}
                disabled={!!episodeCount && entry.episodesWatched >= episodeCount}
                aria-label="Плюс серия"
              >
                +
              </button>
            </div>
          </IosRow>
        )}

        <IosRow label="Моя оценка" value={entry.userRating ? `★ ${entry.userRating}` : 'нет'} chevron>
          <select
            className="ios-select-overlay"
            aria-label="Моя оценка"
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
        </IosRow>

        <IosRow label="Избранное">
          <IosSwitch
            label="Избранное"
            checked={entry.isFavorite}
            onChange={(v) => void updateEntry(entry.key, { isFavorite: v })}
          />
        </IosRow>

        <IosRow label="Раздел" value={kindTitle(kindOf(entry)).title} chevron>
          <select
            className="ios-select-overlay"
            aria-label="Раздел"
            value={kindOf(entry)}
            onChange={(e) => {
              const k = e.target.value as LibraryKind;
              // Совпадает с автоматическим — не храним, чтобы авто-правило могло работать дальше.
              void updateEntry(entry.key, { kind: k === autoKind ? undefined : k });
            }}
          >
            {LIBRARY_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.title}
                {k.id === autoKind ? ' (авто)' : ''}
              </option>
            ))}
          </select>
        </IosRow>
      </IosSection>

      <IosSection title="Заметки" footer="Сохраняется автоматически.">
        <IosRow className="ios-row-stack">
          <textarea
            ref={notesRef}
            className="ios-textarea"
            rows={3}
            placeholder="Впечатления, где остановились…"
            aria-label="Заметки"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={flush}
          />
        </IosRow>
      </IosSection>

      <IosSection
        footer={confirmRemove ? 'Запись, оценка и заметка будут удалены из библиотеки.' : undefined}
      >
        {confirmRemove ? (
          <>
            <IosRow label="Да, удалить" destructive center onClick={() => void removeEntry(entry.key)} />
            <IosRow label="Отмена" accent center onClick={() => setConfirmRemove(false)} />
          </>
        ) : (
          <IosRow label="Удалить из библиотеки" destructive center onClick={() => setConfirmRemove(true)} />
        )}
      </IosSection>
    </>
  );
}

/** Поиск по названию в интернете: русское название, оригинал и год, чтобы выдача была точной. */
function searchUrl(title: string, original: string, year: number | null, isMovie: boolean): string {
  const parts = [title];
  if (original && original !== title) parts.push(original);
  if (year) parts.push(String(year));
  parts.push(isMovie ? 'фильм' : 'дорама');
  return `https://www.google.com/search?q=${encodeURIComponent(parts.join(' '))}`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <IosRow label={label} value={value} className="ios-row-info" />;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
