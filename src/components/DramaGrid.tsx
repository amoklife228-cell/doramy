import { openDrama } from '../lib/router';
import { useInfiniteScroll } from '../lib/hooks';
import { countryLabel, itemKey, yearOf, type Drama } from '../lib/types';
import { Poster } from './Poster';

export function DramaCard({ drama, showType = false }: { drama: Drama; showType?: boolean }) {
  const country = countryLabel(drama.originCountries);
  const year = yearOf(drama.firstAirDate);
  return (
    <button className="card" onClick={() => openDrama(drama.mediaType, drama.id)}>
      <div className="card-poster">
        <Poster path={drama.posterPath} alt={drama.title} />
        {drama.voteAverage > 0 && <span className="badge">★ {drama.voteAverage.toFixed(1)}</span>}
        {showType && drama.mediaType === 'movie' && <span className="badge badge-type">Фильм</span>}
      </div>
      <div className="card-title">{drama.title}</div>
      <div className="card-sub">{[year, country].filter(Boolean).join(' · ')}</div>
    </button>
  );
}

export function DramaGrid({
  items,
  loading,
  hasMore,
  onLoadMore,
  showType = false,
}: {
  items: Drama[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  showType?: boolean;
}) {
  const sentinel = useInfiniteScroll(onLoadMore, hasMore && !loading);
  return (
    <>
      <div className="grid">
        {items.map((d) => (
          <DramaCard key={itemKey(d.mediaType, d.id)} drama={d} showType={showType} />
        ))}
      </div>
      <div ref={sentinel} className="sentinel" />
      {loading && <div className="spinner">Загружаем…</div>}
    </>
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
