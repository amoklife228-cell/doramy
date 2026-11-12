import { useEffect, useMemo, useRef, useState } from 'react';
import {
  changeWatched,
  episodeOrder,
  fetchOutline,
  fetchSeason,
  isAired,
  peekOutline,
  peekSeason,
  regularSeasons,
  resolveWatched,
  type Episode,
  type SeasonData,
  type ShowOutline,
} from '../lib/episodes';
import { formatAirDate } from '../lib/news';
import { formatRuntime, todayKey, type Drama, type SavedDrama } from '../lib/types';
import './EpisodeList.css';

/** Сводка сезонов сериала (кэшируется в памяти). null — ещё нет или не нужна. */
export function useOutline(id: number | null, enabled: boolean): ShowOutline | null {
  const [outline, setOutline] = useState<ShowOutline | null>(null);
  useEffect(() => {
    if (id === null || !enabled) return;
    let alive = true;
    const cached = peekOutline(id);
    void (cached ?? fetchOutline(id)).then(
      (o) => alive && setOutline(o),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [id, enabled]);
  return outline && outline.id === id ? outline : null;
}

/** Сколько серий показывать в длинном сезоне до нажатия «Показать все». */
const COLLAPSED = 12;
const COLLAPSE_FROM = 16;

/**
 * «Серии»: переключатель сезонов и список с круглыми отметками, как в MyShows.
 * Отметка у сериала не из библиотеки добавляет его со статусом «Смотрю».
 */
export function EpisodeList({
  drama,
  entry,
  outline,
  desktop,
}: {
  drama: Drama;
  /** undefined — база ещё не ответила, null — записи нет. */
  entry: SavedDrama | null | undefined;
  outline: ShowOutline | null;
  desktop: boolean;
}) {
  const seasons = useMemo(() => (outline ? regularSeasons(outline) : []), [outline]);
  const [season, setSeason] = useState<number | null>(null);
  const [data, setData] = useState<SeasonData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Порядок серий уточняется по мере загрузки сезонов: держим версию, чтобы пересчитать.
  const [loadedTick, setLoadedTick] = useState(0);
  const today = todayKey();

  const order = useMemo(
    () => (outline ? episodeOrder(outline) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outline, loadedTick],
  );
  const watched = useMemo(() => resolveWatched(entry, order), [entry, order]);
  const total = drama.episodeCount ?? (order.length || undefined);

  // Начальный сезон: тот, где первая неотмеченная серия; всё отмечено — последний вышедший.
  useEffect(() => {
    if (season !== null || !outline || entry === undefined || seasons.length === 0) return;
    const started = seasons.filter((s) => !s.airDate || s.airDate <= today);
    const lastStarted = (started.length ? started[started.length - 1] : seasons[0]).number;
    const firstOpen = order.find((c) => !watched.has(c));
    const openSeason = firstOpen ? Number(/^s(\d+)/.exec(firstOpen)?.[1]) : NaN;
    if (watched.size === 0) setSeason(seasons[0].number);
    else if (seasons.some((s) => s.number === openSeason)) setSeason(Math.min(openSeason, lastStarted));
    else setSeason(lastStarted);
  }, [season, outline, entry, seasons, order, watched, today]);

  useEffect(() => {
    if (season === null || !outline) return;
    const ready = peekSeason(outline.id, season);
    setExpanded(false);
    setError(null);
    if (ready) {
      setData(ready);
      return;
    }
    setData(null);
    const controller = new AbortController();
    fetchSeason(outline.id, season, controller.signal)
      .then((d) => {
        setData(d);
        setLoadedTick((t) => t + 1);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [outline, season, attempt]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!outline || seasons.length === 0) return null;

  const busy = entry === undefined;
  const episodes = data && data.number === season ? data.episodes : null;
  const aired = (e: Episode) => isAired(e, outline, today);
  const seasonAired = episodes?.filter(aired) ?? [];
  const seasonDone = seasonAired.length > 0 && seasonAired.every((e) => watched.has(e.code));
  const seasonWatched = episodes?.filter((e) => watched.has(e.code)).length ?? 0;

  const change = (mutate: (set: Set<string>) => void) => {
    if (busy) return;
    void changeWatched(drama, order, mutate, drama.episodeCount);
  };

  const toggle = (e: Episode) =>
    change((set) => {
      if (set.has(e.code)) set.delete(e.code);
      else set.add(e.code);
    });

  // «Отметить все до этой»: все вышедшие серии по порядку до этой включительно.
  const markUpTo = (e: Episode) => {
    const idx = order.indexOf(e.code);
    if (idx < 0) return;
    change((set) => {
      for (const code of order.slice(0, idx + 1)) set.add(code);
    });
    setToast(`Отмечены все серии до ${e.season > 0 && seasons.length > 1 ? `S${e.season} E${e.number}` : `${e.number}-й`}`);
  };

  const toggleSeason = () => {
    if (!episodes) return;
    const done = seasonDone;
    change((set) => {
      for (const e of episodes) {
        if (done) set.delete(e.code);
        else if (aired(e)) set.add(e.code);
      }
    });
  };

  // Длинный сезон (ежедневные дорамы) — окно вокруг первой неотмеченной серии.
  let shown = episodes ?? [];
  let hiddenCount = 0;
  if (episodes && episodes.length > COLLAPSE_FROM && !expanded) {
    const next = episodes.findIndex((e) => !watched.has(e.code));
    const start = Math.max(0, Math.min((next < 0 ? episodes.length : next) - 3, episodes.length - COLLAPSED));
    shown = episodes.slice(start, start + COLLAPSED);
    hiddenCount = episodes.length - shown.length;
  }

  const seasonLabel = (n: number) => (n === 0 ? 'Спецвыпуски' : `Сезон ${n}`);

  return (
    <section className="block eps-block" aria-label="Серии">
      <h2>
        Серии
        {total ? (
          <span className="eps-count" aria-hidden="true">
            {entry?.episodesWatched ?? 0} из {total}
          </span>
        ) : null}
      </h2>

      {seasons.length > 1 &&
        (seasons.length <= 4 ? (
          <div className="segmented segmented-wide eps-seasons" role="tablist" aria-label="Сезоны">
            {seasons.map((s) => (
              <button
                key={s.number}
                type="button"
                role="tab"
                aria-selected={season === s.number}
                data-active={season === s.number}
                onClick={() => setSeason(s.number)}
              >
                {seasonLabel(s.number)}
              </button>
            ))}
          </div>
        ) : (
          <div className="chips eps-chips" role="tablist" aria-label="Сезоны">
            {seasons.map((s) => (
              <button
                key={s.number}
                type="button"
                role="tab"
                className="chip"
                aria-selected={season === s.number}
                data-active={season === s.number}
                onClick={() => setSeason(s.number)}
              >
                {seasonLabel(s.number)}
              </button>
            ))}
          </div>
        ))}

      {error ? (
        <div className="eps-error">
          <span>Серии не загрузились: {error}</span>
          <button className="link" onClick={() => setAttempt((n) => n + 1)}>
            Повторить
          </button>
        </div>
      ) : !episodes ? (
        <ul className="eps" aria-busy="true" aria-label="Загружаем серии">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="ep">
              {desktop && <span className="ep-still skeleton" />}
              <span className="ep-num" />
              <span className="ep-body">
                <span className="skeleton skeleton-line" style={{ width: '60%' }} />
                <span className="skeleton skeleton-line" style={{ width: '35%' }} />
              </span>
            </li>
          ))}
        </ul>
      ) : episodes.length === 0 ? (
        <p className="muted eps-empty">Список серий этого сезона пока не опубликован.</p>
      ) : (
        <>
          <ul className="eps">
            {shown.map((e) => (
              <EpisodeRow
                key={e.code}
                e={e}
                checked={watched.has(e.code)}
                aired={aired(e)}
                desktop={desktop}
                disabled={busy}
                onToggle={() => toggle(e)}
                onMarkUpTo={() => markUpTo(e)}
              />
            ))}
          </ul>
          <div className="eps-actions">
            {hiddenCount > 0 && (
              <button type="button" className="btn eps-more" onClick={() => setExpanded(true)}>
                Показать все {episodes.length}
              </button>
            )}
            {seasonAired.length > 0 && (
              <button
                type="button"
                className="btn eps-season-btn"
                data-done={seasonDone}
                disabled={busy}
                onClick={toggleSeason}
              >
                {seasonDone ? 'Снять отметки сезона' : 'Сезон просмотрен'}
              </button>
            )}
            <span className="eps-hint muted small">
              {seasonWatched} из {episodes.length} в сезоне
              {desktop ? ' · правый клик по кружку отметит все серии до этой' : ' · удерживайте кружок, чтобы отметить все до этой'}
            </span>
          </div>
        </>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </section>
  );
}

function EpisodeRow({
  e,
  checked,
  aired,
  desktop,
  disabled,
  onToggle,
  onMarkUpTo,
}: {
  e: Episode;
  checked: boolean;
  aired: boolean;
  desktop: boolean;
  disabled: boolean;
  onToggle: () => void;
  onMarkUpTo: () => void;
}) {
  const runtime = formatRuntime(e.runtime ?? undefined);
  const date = e.airDate ? fullDate(e.airDate) : null;
  const meta = [date ?? (aired ? null : 'Дата не объявлена'), runtime].filter(Boolean).join(' · ');

  // Долгое нажатие на отметку — «отметить все до этой»; обычное нажатие после него не срабатывает.
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const startPress = () => {
    longPressed.current = false;
    if (!aired) return;
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      navigator.vibrate?.(10);
      onMarkUpTo();
    }, 550);
  };
  const cancelPress = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <li className="ep" data-checked={checked} data-future={!aired}>
      {desktop && (
        <span className="ep-still">
          {e.stillPath ? (
            <img src={`https://image.tmdb.org/t/p/w300${e.stillPath}`} alt="" loading="lazy" decoding="async" draggable={false} />
          ) : (
            <span className="ep-still-empty">{e.number}</span>
          )}
        </span>
      )}
      {!desktop && <span className="ep-num">{e.number}</span>}
      <span className="ep-body">
        <span className="ep-name">
          {desktop && <span className="ep-code">{e.season > 0 ? `S${e.season} E${e.number}` : `E${e.number}`}</span>}
          {e.name}
        </span>
        {meta && <span className="ep-meta">{meta}</span>}
      </span>
      {aired ? (
        <button
          type="button"
          className="ep-check"
          aria-pressed={checked}
          aria-label={`Отметить серию ${e.number}`}
          title={checked ? 'Просмотрено' : 'Отметить просмотренной'}
          disabled={disabled}
          onClick={() => {
            if (longPressed.current) {
              longPressed.current = false;
              return;
            }
            onToggle();
          }}
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          onContextMenu={(ev) => {
            ev.preventDefault();
            cancelPress();
            if (!longPressed.current) {
              longPressed.current = true;
              onMarkUpTo();
            }
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6.5 12.5l3.6 3.6L17.5 8.7" />
          </svg>
        </button>
      ) : (
        <span className="ep-soon">{e.airDate ? untilAir(e.airDate) : 'скоро'}</span>
      )}
    </li>
  );
}

/** Сколько ждать серию: «завтра», «через 5 дней», «через 3 недели»; дальше — месяц и число. */
function untilAir(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  const days = Math.round((new Date(y, m - 1, d).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days < 14) return `через ${days} ${plural(days, 'день', 'дня', 'дней')}`;
  if (days < 50) {
    const w = Math.round(days / 7);
    return `через ${w} ${plural(w, 'неделю', 'недели', 'недель')}`;
  }
  return formatAirDate(iso);
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function fullDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  const sameYear = y === new Date().getFullYear();
  return date
    .toLocaleDateString('ru-RU', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' })
    .replace(' г.', '');
}
