import { openDrama } from '../lib/router';
import { useInfiniteScroll } from '../lib/hooks';
import { countryOf, yearOf, type Drama } from '../lib/types';
import { Poster } from './Poster';

export function DramaCard({ drama }: { drama: Drama }) {
  const country = countryOf(drama.originCountries);
  const year = yearOf(drama.firstAirDate);
  return (
    <button className="card" onClick={() => openDrama(drama.id)}>
      <div className="card-poster">
        <Poster path={drama.posterPath} alt={drama.title} />
        {drama.voteAverage > 0 && <span className="badge">★ {drama.voteAverage.toFixed(1)}</span>}
      </div>
      <div className="card-title">{drama.title}</div>
      <div className="card-sub">
        {country?.flag} {year ?? ''}
      </div>
    </button>
  );
}

export function DramaGrid({
  items,
  loading,
  hasMore,
  onLoadMore,
}: {
  items: Drama[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  const sentinel = useInfiniteScroll(onLoadMore, hasMore && !loading);
  return (
    <>
      <div className="grid">
        {items.map((d) => (
          <DramaCard key={d.id} drama={d} />
        ))}
      </div>
      <div ref={sentinel} className="sentinel" />
      {loading && <div className="spinner">Загружаем…</div>}
    </>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: string;
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {text && <div className="empty-text">{text}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function NotConfigured() {
  return (
    <EmptyState
      icon="🔑"
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
