import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Poster } from '../components/Poster';
import { Refreshable } from '../components/Refreshable';
import { db } from '../lib/db';
import { useConfigured } from '../lib/hooks';
import { fetchUpcoming, formatAirDate, timeAgo, useNews, type NewsItem, type UpcomingEpisode } from '../lib/news';
import { openDrama } from '../lib/router';

const TAGS = ['Все', 'Дорамы', 'Корея', 'Азия', 'K-drama', 'Фильмы'];

export function Feed({ active }: { active: boolean }) {
  const configured = useConfigured();
  const library = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const { feed, error, loading, checkedAt, refresh } = useNews(active);
  const [tag, setTag] = useState('Все');

  // Ближайшие серии по библиотеке: пересчитываем при смене состава «смотрю/буду».
  const basis = useMemo(
    () =>
      library
        .filter((s) => s.mediaType === 'tv' && s.status !== 'completed' && s.status !== 'dropped')
        .map((s) => s.key)
        .sort()
        .join(','),
    [library],
  );
  const [upcoming, setUpcoming] = useState<UpcomingEpisode[]>([]);
  const [upcomingTick, setUpcomingTick] = useState(0);
  useEffect(() => {
    if (!active || !configured || !basis) {
      if (!basis) setUpcoming([]);
      return;
    }
    const controller = new AbortController();
    void fetchUpcoming(library, controller.signal).then((u) => setUpcoming(u));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, configured, basis, upcomingTick]);

  const items = useMemo(() => {
    const list = feed?.items ?? [];
    return tag === 'Все' ? list : list.filter((i) => i.tag === tag);
  }, [feed, tag]);

  const onRefresh = async () => {
    setUpcomingTick((t) => t + 1);
    await refresh();
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-row">
          <h1>Лента</h1>
          <span className="muted small">
            {loading ? 'Обновляем…' : checkedAt ? `Проверено ${timeAgo(checkedAt)}` : ''}
          </span>
        </div>
        <div className="chips">
          {TAGS.map((t) => (
            <button key={t} className="chip" data-active={tag === t} onClick={() => setTag(t)}>
              {t}
            </button>
          ))}
        </div>
      </header>

      <Refreshable onRefresh={onRefresh}>
        {upcoming.length > 0 && tag === 'Все' && (
          <section className="pblock feed-upcoming">
            <h2 className="home-h2">Скоро новые серии</h2>
            <div className="strip">
              {upcoming.map((u) => (
                <button key={u.item.key} className="strip-item strip-wide" onClick={() => openDrama('tv', u.item.tmdbId)}>
                  <Poster path={u.item.posterPath} alt={u.item.title} size="w185" className="strip-poster" />
                  <span className="strip-title">{u.item.title}</span>
                  <span className="strip-sub">
                    {u.number ? `Серия ${u.number} · ` : ''}
                    {formatAirDate(u.airDate)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="pblock feed-news">
          {tag === 'Все' && <h2 className="home-h2">Новости</h2>}
          {error && !feed ? (
            <div className="empty">
              <div className="empty-title">Лента недоступна</div>
              <div className="empty-text">{error}</div>
              <div className="empty-action">
                <button className="btn btn-primary" onClick={() => void refresh()}>
                  Повторить
                </button>
              </div>
            </div>
          ) : !feed ? (
            <div className="spinner">Загружаем…</div>
          ) : items.length === 0 ? (
            <div className="empty">
              <div className="empty-title">Пока пусто</div>
              <div className="empty-text">Новости обновляются каждый час автоматически.</div>
            </div>
          ) : (
            <ul className="news">
              {items.map((n) => (
                <NewsCard key={n.id} n={n} />
              ))}
            </ul>
          )}
          {feed && (
            <p className="muted small center feed-footer">
              Лента собрана {timeAgo(feed.updatedAt)} из открытых источников через Google Новости. Обновляется каждый час.
            </p>
          )}
        </section>
      </Refreshable>
    </>
  );
}

function NewsCard({ n }: { n: NewsItem }) {
  return (
    <li className="news-item">
      <a href={n.link} target="_blank" rel="noopener noreferrer" className="news-link">
        <div className="news-meta">
          <span className="news-source">{n.source}</span>
          <span className="news-time">{timeAgo(n.publishedAt)}</span>
        </div>
        <div className="news-title">{n.title}</div>
        <div className="news-tag">{n.tag}</div>
      </a>
    </li>
  );
}
