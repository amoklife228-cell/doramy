import { useEffect, useState } from 'react';
import { updateEntry } from '../lib/db';
import { openDrama } from '../lib/router';
import type { SavedDrama } from '../lib/types';
import { Poster } from './Poster';
import { SectionIcon } from './SectionIcon';

/**
 * «Продолжить смотреть» на главной каталога: сериалы со статусом «Смотрю», свежие сверху.
 * Кнопка «+1» отмечает следующую серию прямо отсюда; на последней серии сериал становится «Просмотрено».
 */
export function ContinueWatching({ library }: { library: SavedDrama[] }) {
  const watching = library
    .filter((s) => s.mediaType === 'tv' && s.status === 'watching')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  if (watching.length === 0) return null;

  const plusOne = (s: SavedDrama) => {
    const next = s.episodesWatched + 1;
    const total = s.episodeCount;
    if (total && next > total) return;
    const finished = !!total && next >= total;
    void updateEntry(s.key, { episodesWatched: next, ...(finished ? { status: 'completed' as const } : {}) });
    setToast(finished ? `«${s.title}» досмотрен` : `${s.title}: серия ${next}${total ? ` из ${total}` : ''}`);
  };

  return (
    <section className="pblock continue" data-accent="continue">
      <div className="pblock-head">
        <h2>
          <SectionIcon accent="continue" />
          Продолжить смотреть
        </h2>
      </div>
      <div className="continue-strip">
        {watching.map((s) => {
          const total = s.episodeCount;
          const pct = total ? Math.min(100, Math.round((s.episodesWatched / total) * 100)) : 0;
          const atEnd = !!total && s.episodesWatched >= total;
          return (
            <div key={s.key} className="continue-card">
              <button className="continue-main" onClick={() => openDrama(s.mediaType, s.tmdbId)}>
                <Poster path={s.posterPath} alt={s.title} size="w185" className="continue-poster" />
                <span className="continue-body">
                  <span className="continue-title">{s.title}</span>
                  <span className="continue-sub">
                    {s.episodesWatched === 0
                      ? 'Ещё не начали'
                      : `Серия ${s.episodesWatched}${total ? ` из ${total}` : ''}`}
                  </span>
                  {total ? (
                    <span className="continue-bar" aria-hidden="true">
                      <span style={{ width: `${pct}%` }} />
                    </span>
                  ) : null}
                </span>
              </button>
              <button
                className="continue-plus"
                onClick={() => plusOne(s)}
                disabled={atEnd}
                aria-label={`Отметить серию ${s.episodesWatched + 1} сериала «${s.title}»`}
              >
                +1
              </button>
            </div>
          );
        })}
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </section>
  );
}
