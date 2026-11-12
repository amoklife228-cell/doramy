import { useEffect, useState } from 'react';
import { localizePeople, needsReadableName, readableName } from '../lib/people';
import { openDrama, openPerson } from '../lib/router';
import { credits, profileUrl, remember, similarTo, type CastMember } from '../lib/tmdb';
import { itemKey, yearOf, type Drama, type MediaType } from '../lib/types';
import { Poster } from './Poster';
import './DetailExtras.css';

/* Дополнительные блоки карточки: «В ролях», «Похожие» и кнопка «Поделиться». */

const castCache = new Map<string, CastMember[]>();
const similarCache = new Map<string, Drama[]>();

function useLoaded<T>(
  cache: Map<string, T>,
  key: string,
  enabled: boolean,
  load: (signal: AbortSignal) => Promise<T>,
): T | null | undefined {
  // undefined = грузится, null = не удалось
  const [value, setValue] = useState<T | null | undefined>(() => cache.get(key));
  useEffect(() => {
    if (!enabled) return;
    const cached = cache.get(key);
    if (cached) {
      setValue(cached);
      return;
    }
    setValue(undefined);
    const controller = new AbortController();
    load(controller.signal)
      .then((v) => {
        cache.set(key, v);
        setValue(v);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setValue(null);
      });
    return () => controller.abort();
    // load пересоздаётся на каждый рендер; перезапрос нужен только при смене ключа
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return value;
}

export function CastStrip({ mediaType, id, enabled }: { mediaType: MediaType; id: number; enabled: boolean }) {
  const cast = useLoaded(castCache, itemKey(mediaType, id), enabled, (s) => credits(mediaType, id, s));
  // Имена хангылем или иероглифами заменяем на латиницу (или русское), найденную отдельным запросом.
  const [names, setNames] = useState<Map<number, string>>(() => new Map());
  useEffect(() => {
    if (!cast || !cast.some((c) => needsReadableName(c.name))) return;
    const controller = new AbortController();
    localizePeople(cast, controller.signal, 15)
      .then((list) => setNames(new Map(list.map((c) => [c.id, c.name]))))
      .catch(() => undefined);
    return () => controller.abort();
  }, [cast]);
  if (cast === null || (cast && cast.length === 0)) return null;
  return (
    <section className="block">
      <h2>В ролях</h2>
      <div className="cast-strip">
        {cast === undefined
          ? Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="cast-item" aria-hidden="true">
                <div className="cast-photo skeleton" />
                <div className="skeleton skeleton-line" style={{ width: '80%' }} />
              </div>
            ))
          : cast.map((c) => {
              const src = profileUrl(c.profilePath);
              const name = names.get(c.id) ?? readableName(c.id, c.name);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="cast-item"
                  onClick={() => openPerson(c.id)}
                  aria-label={c.character ? `${name}, ${c.character}` : name}
                >
                  {src ? (
                    <img className="cast-photo" src={src} alt="" loading="lazy" decoding="async" draggable={false} />
                  ) : (
                    <span className="cast-photo cast-photo-empty" aria-hidden="true">
                      {initials(name)}
                    </span>
                  )}
                  <span className="cast-name">{name}</span>
                  {c.character && <span className="cast-role">{c.character}</span>}
                </button>
              );
            })}
      </div>
    </section>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function SimilarStrip({
  mediaType,
  id,
  enabled,
  libraryKeys,
}: {
  mediaType: MediaType;
  id: number;
  enabled: boolean;
  libraryKeys: Set<string>;
}) {
  const list = useLoaded(similarCache, itemKey(mediaType, id), enabled, async (s) => {
    const items = (await similarTo(mediaType, id, s)).slice(0, 15);
    remember(items);
    return items;
  });
  if (list === null) return null;
  const shown = (list ?? []).filter((d) => !libraryKeys.has(itemKey(d.mediaType, d.id)));
  if (list && shown.length === 0) return null;
  return (
    <section className="block">
      <h2>{mediaType === 'movie' ? 'Похожие фильмы' : 'Похожие сериалы'}</h2>
      <div className="strip">
        {list === undefined
          ? Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="strip-item" aria-hidden="true">
                <div className="strip-poster skeleton" />
                <div className="skeleton skeleton-line" style={{ width: '80%' }} />
              </div>
            ))
          : shown.map((d) => (
              <button key={itemKey(d.mediaType, d.id)} className="strip-item" onClick={() => openDrama(d.mediaType, d.id)}>
                <span className="strip-poster-wrap">
                  <Poster path={d.posterPath} alt={d.title} size="w342" className="strip-poster" />
                  {d.voteAverage > 0 && <span className="badge">★ {d.voteAverage.toFixed(1)}</span>}
                </span>
                <span className="strip-title">{d.title}</span>
                <span className="strip-year">{yearOf(d.firstAirDate) ?? ''}</span>
              </button>
            ))}
      </div>
    </section>
  );
}

const APP_URL = 'https://amoklife228-cell.github.io/doramy/';

/** Кнопка «Поделиться» в шапке: системное меню iOS, а без него — копирование ссылки. */
export function ShareButton({ drama }: { drama: Drama | null }) {
  if (!drama) return null;
  const year = yearOf(drama.firstAirDate);
  return (
    <ShareLink
      title={drama.title}
      text={`${drama.title}${year ? ` (${year})` : ''}${drama.voteAverage > 0 ? `, ★ ${drama.voteAverage.toFixed(1)}` : ''}. Смотри в «Дорамах»:`}
      path={`/${drama.mediaType}/${drama.id}`}
    />
  );
}

/** Та же кнопка для любой страницы приложения: `path` — адрес после «#», например `/person/123`. */
export function ShareLink({ title, text, path }: { title: string; text: string; path: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const onShare = async () => {
    const url = `${APP_URL}#${path}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
    } catch (e) {
      // Пользователь закрыл меню «Поделиться» — это не ошибка.
      if ((e as Error).name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(`${text} ${url}`);
          setCopied(true);
        } catch {
          // буфер обмена недоступен: ничего не делаем
        }
      }
    }
  };

  return (
    <>
      <button type="button" className="nav-icon-btn" onClick={() => void onShare()} aria-label="Поделиться">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 15V3.5M12 3.5L8 7.5M12 3.5l4 4" />
          <path d="M8 10.5H6.5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H16" />
        </svg>
      </button>
      {copied && (
        <div className="toast" role="status">
          Ссылка скопирована
        </div>
      )}
    </>
  );
}
