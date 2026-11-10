import { useEffect, useState } from 'react';
import { videos, type Video } from '../lib/tmdb';
import type { MediaType } from '../lib/types';

const TYPE_LABEL: Record<string, string> = {
  Trailer: 'Трейлер',
  Teaser: 'Тизер',
  Clip: 'Фрагмент',
  'Opening Credits': 'Заставка',
};

/** Трейлеры из TMDB (YouTube) прямо в карточке: превью → по нажатию встроенный плеер. */
export function TrailerBlock({ mediaType, id, enabled }: { mediaType: MediaType; id: number; enabled: boolean }) {
  const [list, setList] = useState<Video[] | null>(null);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setList(null);
    setCurrent(0);
    setPlaying(false);
    videos(mediaType, id, controller.signal)
      .then(setList)
      .catch(() => setList([]));
    return () => controller.abort();
  }, [mediaType, id, enabled]);

  if (!enabled || !list || list.length === 0) return null;
  const v = list[current];

  return (
    <section className="block">
      <h2>Трейлер</h2>
      <div className="trailer">
        {playing ? (
          <iframe
            className="trailer-frame"
            src={`https://www.youtube-nocookie.com/embed/${v.key}?autoplay=1&playsinline=1&rel=0&hl=ru`}
            title={v.name}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button className="trailer-poster" onClick={() => setPlaying(true)} aria-label={`Смотреть: ${v.name}`}>
            <img src={`https://img.youtube.com/vi/${v.key}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" />
            <span className="trailer-play" aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </span>
          </button>
        )}
      </div>
      <div className="trailer-name muted small">{v.name}</div>
      {list.length > 1 && (
        <div className="chips trailer-chips">
          {list.map((t, i) => (
            <button
              key={t.key}
              className="chip"
              data-active={i === current}
              onClick={() => {
                setCurrent(i);
                setPlaying(false);
              }}
            >
              {TYPE_LABEL[t.type] ?? t.type}
              {t.lang && t.lang !== 'ru' ? ` · ${t.lang.toUpperCase()}` : ''}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
