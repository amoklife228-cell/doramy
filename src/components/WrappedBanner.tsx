import { useMemo, type CSSProperties } from 'react';
import { navigate } from '../lib/router';
import { posterUrl } from '../lib/tmdb';
import type { ActivityDay, SavedDrama } from '../lib/types';
import { bannerYear, computeWrapped, plural } from '../lib/wrapped';
import './WrappedBanner.css';

/** Цветная карточка «Ваш 2026 в дорамах» в профиле; видна, когда за год есть активность. */
export function WrappedBanner({ items, activity }: { items: SavedDrama[]; activity: ActivityDay[] }) {
  const year = useMemo(() => bannerYear(activity), [activity]);
  const w = useMemo(() => (year ? computeWrapped(items, activity, year) : null), [items, activity, year]);
  if (!year || !w || !w.hasData) return null;

  const posters = (w.top.length ? w.top : w.titles)
    .map((t) => t.item)
    .filter((s) => s.posterPath)
    .slice(0, 3);
  const hours = Math.round(w.minutes / 60);
  const sub = [
    hours > 0 ? `${hours} ${plural(hours, 'час', 'часа', 'часов')}` : null,
    w.units > 0 ? `${w.units} ${plural(w.units, 'эпизод', 'эпизода', 'эпизодов')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const current = year === new Date().getFullYear();

  return (
    <button
      type="button"
      className="wrb"
      onClick={() => navigate(current ? '/wrapped' : `/wrapped/${year}`)}
      aria-label={`Итоги года: ваш ${year} в дорамах`}
    >
      <span className="wrb-glow" aria-hidden="true" />
      <span className="wrb-body">
        <span className="wrb-kicker">Итоги года</span>
        <span className="wrb-title">Ваш {year} в дорамах</span>
        {sub && <span className="wrb-sub">{sub}</span>}
        <span className="wrb-cta">
          Смотреть
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 7.5v9l7.5-4.5z" />
          </svg>
        </span>
      </span>
      {posters.length > 0 && (
        <span className="wrb-posters" aria-hidden="true">
          {posters.map((s, i) => (
            <img
              key={s.key}
              className="wrb-poster"
              style={{ '--i': i } as CSSProperties}
              src={posterUrl(s.posterPath, 'w185') ?? undefined}
              alt=""
              draggable={false}
              onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
            />
          ))}
        </span>
      )}
    </button>
  );
}
