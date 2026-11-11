import { openDrama } from '../lib/router';
import { useInfiniteScroll } from '../lib/hooks';
import { countryLabel, itemKey, yearOf, type Drama } from '../lib/types';
import { Poster } from './Poster';

export function DramaCard({
  drama,
  showType = false,
  rank,
  note,
}: {
  drama: Drama;
  showType?: boolean;
  /** Место в рейтинге (ТОП-500). */
  rank?: number;
  /** Подпись под карточкой, например награда. */
  note?: string;
}) {
  const country = countryLabel(drama.originCountries);
  const year = yearOf(drama.firstAirDate);
  return (
    <button className="card" onClick={() => openDrama(drama.mediaType, drama.id)}>
      <div className="card-poster">
        <Poster path={drama.posterPath} alt={drama.title} />
        {rank !== undefined && <span className="rank-badge">{rank}</span>}
        {drama.voteAverage > 0 && <span className="badge">★ {drama.voteAverage.toFixed(1)}</span>}
        {showType && drama.mediaType === 'movie' && <span className="badge badge-type">Фильм</span>}
      </div>
      <div className="card-title">{drama.title}</div>
      <div className="card-sub">{[year, country].filter(Boolean).join(' · ')}</div>
      {note && <div className="card-note">{note}</div>}
    </button>
  );
}

export function DramaGrid({
  items,
  loading,
  hasMore,
  onLoadMore,
  showType = false,
  error = null,
  onRetry,
  ranked = false,
  notes,
  placeholder = false,
}: {
  items: Drama[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  showType?: boolean;
  error?: string | null;
  onRetry?: () => void;
  ranked?: boolean;
  notes?: Map<string, string>;
  /**
   * Показывать заготовки карточек, хотя запрос не идёт: страница целиком отсеялась фильтром,
   * а сторож сейчас догрузит следующую. Влияет только на вид, не на догрузку.
   */
  placeholder?: boolean;
}) {
  const sentinel = useInfiniteScroll(onLoadMore, hasMore && !loading);
  const firstLoad = (loading || placeholder) && items.length === 0;
  return (
    <>
      <div className="grid">
        {items.map((d, i) => (
          <DramaCard
            key={itemKey(d.mediaType, d.id)}
            drama={d}
            showType={showType}
            rank={ranked ? i + 1 : undefined}
            note={notes?.get(itemKey(d.mediaType, d.id))}
          />
        ))}
        {firstLoad && Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}
      </div>
      <div ref={sentinel} className="sentinel" />
      {loading && !firstLoad && <div className="spinner">Загружаем…</div>}
      {error && !loading && items.length > 0 && onRetry && (
        <div className="load-error">
          <span className="muted small">Не удалось загрузить ещё</span>
          <button className="btn" onClick={onRetry}>
            Повторить
          </button>
        </div>
      )}
    </>
  );
}

export function CardSkeleton() {
  return (
    <div className="card" aria-hidden="true">
      <div className="card-poster skeleton" />
      <div className="skeleton skeleton-line" style={{ width: '80%', marginTop: 8 }} />
      <div className="skeleton skeleton-line" style={{ width: '50%' }} />
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {text && <div className="empty-text">{text}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function NotConfigured() {
  return (
    <EmptyState
      title="Нужен ключ TMDB"
      text="Бесплатный ключ выдаётся на themoviedb.org. Вставьте его в «Настройках» один раз."
      action={
        <a className="btn btn-primary" href="#/settings">
          Открыть настройки
        </a>
      }
    />
  );
}
