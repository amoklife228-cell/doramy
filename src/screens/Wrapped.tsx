import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useMediaQuery } from '../lib/media';
import { navigate } from '../lib/router';
import { posterUrl } from '../lib/tmdb';
import type { SavedDrama } from '../lib/types';
import {
  computeWrapped,
  dayLabel,
  MONTHS_NOM,
  MONTHS_SHORT,
  plural,
  rangeLabel,
  shareText,
  yearsWithData,
  type WrappedData,
  type WrappedTitle,
} from '../lib/wrapped';
import { actorCandidates, favouriteActor, type FavouriteActor } from '../lib/wrappedActor';
import './Wrapped.css';

/** Сколько показывается одна карточка, мс. */
export const STORY_MS = 6000;

const Reduced = createContext(false);

function yearFromHash(): number {
  const m = location.hash.match(/^#\/wrapped\/(\d{4})/);
  const y = m ? Number(m[1]) : NaN;
  return Number.isFinite(y) && y > 1990 && y < 3000 ? y : new Date().getFullYear();
}

function useHashYear(): number {
  const [year, setYear] = useState(yearFromHash);
  useEffect(() => {
    const onChange = () => setYear(yearFromHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return year;
}

function close() {
  if (history.length > 1) history.back();
  else navigate('/profile');
}

type ActorState = { status: 'loading' } | { status: 'done'; actor: FavouriteActor } | { status: 'none' };

/** Актёр года из TMDB; без сети или без подходящих записей — карточки просто нет. */
function useActor(data: WrappedData | null): ActorState {
  const pool = data ? actorCandidates(data.titles) : [];
  const key = pool.map((t) => t.item.key).join(',');
  const titlesRef = useRef<WrappedTitle[]>([]);
  titlesRef.current = data?.titles ?? [];
  const [state, setState] = useState<ActorState>({ status: 'loading' });
  useEffect(() => {
    if (!key) {
      setState({ status: 'none' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    favouriteActor(titlesRef.current, controller.signal)
      .then((actor) => setState(actor ? { status: 'done', actor } : { status: 'none' }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'none' });
      });
    return () => controller.abort();
  }, [key]);
  return state;
}

interface Card {
  id: string;
  theme: string;
  /** Постер для размытого фона карточки (и подложки на компьютере). */
  art?: string | null;
  label: string;
  node: ReactNode;
}

export function Wrapped() {
  const year = useHashYear();
  const items = useLiveQuery(() => db.items.toArray(), []);
  const activity = useLiveQuery(() => db.activity.toArray(), []);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const data = useMemo(
    () => (items && activity ? computeWrapped(items, activity, year) : null),
    [items, activity, year],
  );
  const years = useMemo(() => (items && activity ? yearsWithData(items, activity) : []), [items, activity]);
  const actor = useActor(data?.hasData ? data : null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const share = async () => {
    if (!data) return;
    const text = shareText(data, actor.status === 'done' ? actor.actor.name : null);
    const url = `${location.origin}${location.pathname}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Мой ${data.year} в дорамах`, text, url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    setToast((await copyText(`${text}\n${url}`)) ? 'Текст скопирован' : 'Не удалось скопировать');
  };

  const otherYears = years.filter((y) => y !== year);
  const cards = useMemo(
    () => (data ? buildCards(data, actor, otherYears, share) : []),
    // share меняется каждый рендер, но читает только data и actor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, actor, otherYears.join(',')],
  );

  return (
    <Reduced.Provider value={reduced}>
      {data === null ? (
        <div className="wr ios-gap-fill" role="dialog" aria-modal="true" aria-label="Итоги года" data-theme="intro" />
      ) : (
        <Stories key={year} year={year} cards={cards} reduced={reduced} toast={toast} />
      )}
    </Reduced.Provider>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/* ---------- просмотрщик историй ---------- */

function Stories({
  year,
  cards,
  reduced,
  toast,
}: {
  year: number;
  cards: Card[];
  reduced: boolean;
  toast: string | null;
}) {
  const [curId, setCurId] = useState<string | undefined>(cards[0]?.id);
  const lastIdx = useRef(0);
  let idx = cards.findIndex((c) => c.id === curId);
  // Карточка пропала (актёр не нашёлся) — остаёмся на том же месте списка.
  if (idx < 0) idx = Math.max(0, Math.min(lastIdx.current, cards.length - 1));
  lastIdx.current = idx;
  const card = cards[idx];

  const [round, setRound] = useState(0);
  const [held, setHeld] = useState(false);
  const [manualPause, setManualPause] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [dragY, setDragY] = useState(0);
  const paused = held || manualPause || hidden;
  const auto = !reduced && cards.length > 1;

  const goTo = (i: number) => {
    if (i < 0) {
      setRound((r) => r + 1);
      return;
    }
    if (i >= cards.length) return;
    setCurId(cards[i].id);
    setRound((r) => r + 1);
  };
  const next = () => goTo(idx + 1);
  const prev = () => goTo(idx - 1);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const keyRef = useRef({ next, prev });
  keyRef.current = { next, prev };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') keyRef.current.next();
      else if (e.key === 'ArrowLeft') keyRef.current.prev();
      else if (e.key === ' ' && !(e.target as Element | null)?.closest?.('button, a')) {
        e.preventDefault();
        setManualPause((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Жесты: короткое касание — вперёд/назад по половинам, удержание — пауза, вниз — закрыть.
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('button, a')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setHeld(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dy = e.clientY - s.y;
    const dx = e.clientX - s.x;
    setDragY(dy > 6 && dy > Math.abs(dx) ? dy : 0);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    setHeld(false);
    setDragY(0);
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const dt = performance.now() - s.t;
    if (dy > 110 || (dy > 50 && dt < 300 && dy > 2 * Math.abs(dx))) {
      close();
      return;
    }
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 600) {
      if (dx < 0) next();
      else prev();
      return;
    }
    if (dt < 400 && Math.hypot(dx, dy) < 14) {
      const rect = e.currentTarget.getBoundingClientRect();
      if (e.clientX - rect.left < rect.width / 2) prev();
      else next();
    }
  };
  const onPointerCancel = () => {
    start.current = null;
    setHeld(false);
    setDragY(0);
  };

  if (!card) return null;
  const artUrl = card.art ? posterUrl(card.art, 'w342') : null;
  const frameStyle: CSSProperties | undefined = dragY
    ? { transform: `translateY(${dragY}px) scale(${Math.max(0.86, 1 - dragY / 1600)})`, transition: 'none' }
    : undefined;

  return (
    <div
      className="wr ios-gap-fill"
      role="dialog"
      aria-modal="true"
      aria-label={`Итоги ${year} года`}
      data-theme={card.theme}
      data-dragging={dragY > 0}
      style={dragY ? ({ '--wr-fade': String(Math.max(0.2, 1 - dragY / 500)) } as CSSProperties) : undefined}
    >
      <div className="wr-backdrop" aria-hidden="true">
        {artUrl && <img key={artUrl} src={artUrl} alt="" draggable={false} />}
      </div>

      <button type="button" className="wr-arrow wr-arrow-prev" onClick={prev} aria-label="Предыдущая карточка" disabled={idx === 0}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>

      <div
        className="wr-frame"
        data-theme={card.theme}
        data-held={held}
        style={frameStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="wr-bg" aria-hidden="true">
          {artUrl && <img key={artUrl} className="wr-bg-art" src={artUrl} alt="" draggable={false} />}
          <span className="wr-blob wr-blob-1" />
          <span className="wr-blob wr-blob-2" />
          <span className="wr-blob wr-blob-3" />
          <span className="wr-grain" />
        </div>

        <div className="wr-chrome">
          <div className="wr-segs" role="progressbar" aria-label="Карточки" aria-valuemin={1} aria-valuemax={cards.length} aria-valuenow={idx + 1}>
            {cards.map((c, i) => (
              <span key={c.id} className="wr-seg">
                <i
                  key={i === idx ? `${c.id}:${round}` : c.id}
                  className="wr-seg-fill"
                  data-state={i < idx ? 'done' : i > idx ? 'todo' : auto ? 'run' : 'done'}
                  style={
                    i === idx && auto
                      ? { animationDuration: `${STORY_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }
                      : undefined
                  }
                  onAnimationEnd={i === idx && auto ? next : undefined}
                />
              </span>
            ))}
          </div>
          <div className="wr-head">
            <span className="wr-brand">
              <span className="wr-logo" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M9 7.5v9l7.5-4.5z" />
                </svg>
              </span>
              Итоги {year}
            </span>
            {auto && (
              <button
                type="button"
                className="wr-icon-btn"
                onClick={() => setManualPause((v) => !v)}
                aria-label={manualPause ? 'Продолжить' : 'Пауза'}
                aria-pressed={manualPause}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {manualPause ? <path d="M8 5.5v13l10.5-6.5z" className="wr-fill" /> : <path d="M8.5 5.5v13M15.5 5.5v13" />}
                </svg>
              </button>
            )}
            <button type="button" className="wr-icon-btn wr-close" onClick={close} aria-label="Закрыть">
              ✕
            </button>
          </div>
        </div>

        <section className="wr-card" key={card.id} data-card={card.id} aria-label={card.label} aria-live="polite">
          {card.node}
        </section>

        {toast && (
          <div className="wr-toast" role="status">
            {toast}
          </div>
        )}
      </div>

      <button
        type="button"
        className="wr-arrow wr-arrow-next"
        onClick={next}
        aria-label="Следующая карточка"
        disabled={idx >= cards.length - 1}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

/* ---------- карточки ---------- */

function buildCards(w: WrappedData, actor: ActorState, otherYears: number[], onShare: () => void): Card[] {
  if (!w.hasData) {
    return [{ id: 'empty', theme: 'empty', label: 'Пока пусто', node: <EmptyCard year={w.year} otherYears={otherYears} /> }];
  }
  const cards: Card[] = [];
  const lead = w.top[0]?.item ?? w.titles[0]?.item;
  cards.push({
    id: 'intro',
    theme: 'intro',
    art: lead?.posterPath,
    label: `Ваш ${w.year} в дорамах`,
    node: <IntroCard w={w} otherYears={otherYears} />,
  });
  if (w.minutes > 0) cards.push({ id: 'hours', theme: 'hours', label: 'Время у экрана', node: <HoursCard w={w} /> });
  if (w.genres.length) {
    cards.push({
      id: 'genre',
      theme: 'genre',
      art: w.genres[0].items[0]?.posterPath,
      label: 'Любимый жанр',
      node: <GenreCard w={w} />,
    });
  }
  if (w.countries.length) {
    cards.push({
      id: 'country',
      theme: 'country',
      art: w.countries[0].items[0]?.posterPath,
      label: 'Страна года',
      node: <CountryCard w={w} />,
    });
  }
  if (actor.status !== 'none') {
    cards.push({
      id: 'actor',
      theme: 'actor',
      art: actor.status === 'done' ? actor.actor.titles[0]?.posterPath : null,
      label: 'Актёр года',
      node: <ActorCard actor={actor.status === 'done' ? actor.actor : null} />,
    });
  }
  if (w.longestStreak && w.busiestDay) cards.push({ id: 'streak', theme: 'streak', label: 'Серия дней', node: <StreakCard w={w} /> });
  if (w.top.length) {
    cards.push({ id: 'top', theme: 'top', art: w.top[0].item.posterPath, label: 'Топ-5 года', node: <TopCard w={w} /> });
  }
  if (w.months.some((m) => m.units > 0)) cards.push({ id: 'months', theme: 'months', label: 'Год по месяцам', node: <MonthsCard w={w} /> });
  cards.push({
    id: 'outro',
    theme: 'outro',
    art: lead?.posterPath,
    label: 'Итог',
    node: <OutroCard w={w} actor={actor.status === 'done' ? actor.actor : null} onShare={onShare} />,
  });
  return cards;
}

/** Элемент с появлением снизу; d — порядковый номер для задержки. */
function In({ d = 0, className = '', children, as = 'div' }: { d?: number; className?: string; children: ReactNode; as?: 'div' | 'p' | 'h2' | 'span' }) {
  const Tag = as;
  return (
    <Tag className={`wr-in ${className}`} style={{ '--d': d } as CSSProperties}>
      {children}
    </Tag>
  );
}

function CountUp({ value }: { value: number }) {
  const reduced = useContext(Reduced);
  const [n, setN] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced || value <= 0) {
      setN(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 1300);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return (
    <span className="wr-count" data-value={value}>
      {n.toLocaleString('ru-RU')}
    </span>
  );
}

function Art({ item, className = '', size = 'w342' }: { item: SavedDrama; className?: string; size?: 'w185' | 'w342' | 'w500' }) {
  const [failed, setFailed] = useState(false);
  const url = posterUrl(item.posterPath, size);
  if (!url || failed) {
    return (
      <span className={`wr-art wr-art-empty ${className}`} aria-hidden="true">
        {item.title.slice(0, 1)}
      </span>
    );
  }
  return <img className={`wr-art ${className}`} src={url} alt="" draggable={false} decoding="async" onError={() => setFailed(true)} />;
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <In d={0} className="wr-kicker">
      {children}
    </In>
  );
}

function YearPills({ years }: { years: number[] }) {
  if (years.length === 0) return null;
  return (
    <div className="wr-years">
      <span className="wr-years-label">Другие годы</span>
      {years.slice(0, 4).map((y) => (
        <button key={y} type="button" className="wr-pill" onClick={() => location.replace(`#/wrapped/${y}`)}>
          {y}
        </button>
      ))}
    </div>
  );
}

function IntroCard({ w, otherYears }: { w: WrappedData; otherYears: number[] }) {
  const fan = (w.top.length ? w.top : w.titles).slice(0, 5).map((t) => t.item);
  return (
    <div className="wr-body wr-body-intro">
      <Kicker>Дорамы · итоги года</Kicker>
      <In d={1} className="wr-year" as="div">
        {w.year}
      </In>
      <In d={2} as="h2" className="wr-title">
        Ваш {w.year} в дорамах
      </In>
      <In d={3} as="p" className="wr-lead">
        Часы у экрана, любимые истории и те, кто был рядом весь год.
      </In>
      {fan.length > 0 && (
        <div className="wr-fan" data-count={fan.length} aria-hidden="true">
          {fan.map((s, i) => (
            <span key={s.key} className="wr-fan-item" style={{ '--i': i, '--n': fan.length } as CSSProperties}>
              <Art item={s} />
            </span>
          ))}
        </div>
      )}
      <YearPills years={otherYears} />
    </div>
  );
}

function hoursFacts(minutes: number): { value: number; unit: string; facts: string[] } {
  const hours = minutes / 60;
  const facts: string[] = [];
  const days = Math.floor(hours / 24);
  if (days >= 1) facts.push(`Это ${days} ${plural(days, 'полный день', 'полных дня', 'полных дней')} без сна и перерывов`);
  const trips = Math.floor(hours / 18);
  if (trips >= 1) facts.push(`Или перелёт Москва — Сеул туда и обратно ${trips} ${plural(trips, 'раз', 'раза', 'раз')}`);
  else if (hours >= 9) facts.push('Хватило бы на перелёт Москва — Сеул');
  else facts.push(`Это ${Math.max(1, Math.round((hours / 9) * 100))}% перелёта Москва — Сеул`);
  if (hours < 1) return { value: Math.round(minutes), unit: plural(Math.round(minutes), 'минута', 'минуты', 'минут'), facts };
  const h = Math.round(hours);
  return { value: h, unit: plural(h, 'час', 'часа', 'часов'), facts };
}

function HoursCard({ w }: { w: WrappedData }) {
  const f = hoursFacts(w.minutes);
  const parts: string[] = [];
  if (w.episodes > 0) parts.push(`${w.episodes.toLocaleString('ru-RU')} ${plural(w.episodes, 'серия', 'серии', 'серий')}`);
  if (w.movies > 0) parts.push(`${w.movies} ${plural(w.movies, 'фильм', 'фильма', 'фильмов')}`);
  return (
    <div className="wr-body wr-body-center">
      <Kicker>Время у экрана</Kicker>
      <In d={1} className="wr-huge" as="div">
        <CountUp value={f.value} />
      </In>
      <In d={2} className="wr-huge-unit">
        {f.unit} в дорамах
      </In>
      {parts.length > 0 && (
        <In d={3} className="wr-chips">
          {parts.map((p) => (
            <span key={p} className="wr-chip">
              {p}
            </span>
          ))}
        </In>
      )}
      <div className="wr-facts">
        {f.facts.map((t, i) => (
          <In key={t} d={4 + i} as="p" className="wr-fact">
            {t}
          </In>
        ))}
      </div>
      <Plane />
    </div>
  );
}

const ROUTE = 'M10 100 C 90 10, 230 10, 310 100';

function Plane() {
  const reduced = useContext(Reduced);
  return (
    <svg className="wr-plane wr-in" style={{ '--d': 6 } as CSSProperties} viewBox="0 0 320 124" aria-hidden="true">
      <path className="wr-plane-route" d={ROUTE} />
      <circle cx="10" cy="100" r="5" />
      <circle cx="310" cy="100" r="5" />
      <g className="wr-plane-ship" transform={reduced ? 'translate(160 32.5)' : 'translate(10 100)'}>
        {/* Самолётик носом вправо; без «уменьшения движения» летит по дуге. */}
        <g>
          {!reduced && <animateMotion dur="5s" begin="0.6s" fill="freeze" rotate="auto" path="M0 0 C 80 -90, 220 -90, 300 0" calcMode="spline" keyTimes="0;1" keySplines="0.45 0 0.35 1" />}
          <path d="M-12 0 L10 -3 L14 0 L10 3 Z M-2 -1 L-6 -11 L-2 -11 L6 -1 Z M-2 1 L-6 11 L-2 11 L6 1 Z M-11 -1 L-14 -6 L-12 -6 L-8 -1 Z M-11 1 L-14 6 L-12 6 L-8 1 Z" />
        </g>
      </g>
      <text x="10" y="118" textAnchor="start">Москва</text>
      <text x="310" y="118" textAnchor="end">Сеул</text>
    </svg>
  );
}

function pct(share: number): number {
  return Math.max(1, Math.round(share * 100));
}

function GenreCard({ w }: { w: WrappedData }) {
  const g = w.genres[0];
  const rest = w.genres.slice(1, 4);
  const posters = g.items.slice(0, 3);
  return (
    <div className="wr-body">
      <Kicker>Любимый жанр</Kicker>
      <In d={1} className="wr-display" as="div">
        <span data-long={g.label.length > 11}>{g.label}</span>
      </In>
      <In d={2} as="p" className="wr-lead wr-lead-strong">
        {pct(g.share)}% всего, что вы смотрели
      </In>
      {posters.length > 0 && (
        <div className="wr-stack" aria-hidden="true">
          {posters.map((s, i) => (
            <span key={s.key} className="wr-stack-item wr-in" style={{ '--d': 3 + i, '--i': i } as CSSProperties}>
              <Art item={s} />
            </span>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <In d={6} className="wr-rest">
          <span className="wr-rest-label">А ещё</span>
          {rest.map((r) => (
            <span key={r.label} className="wr-chip">
              {r.label} · {pct(r.share)}%
            </span>
          ))}
        </In>
      )}
    </div>
  );
}

function CountryCard({ w }: { w: WrappedData }) {
  const c = w.countries[0];
  const rows = w.countries.slice(0, 4);
  return (
    <div className="wr-body">
      <Kicker>Страна года</Kicker>
      <In d={1} className="wr-display" as="div">
        <span data-long={c.label.length > 11}>{c.label}</span>
      </In>
      <In d={2} as="p" className="wr-lead wr-lead-strong">
        {c.label} — {pct(c.share)}% просмотренного
      </In>
      <div className="wr-bars">
        {rows.map((r, i) => (
          <In key={r.label} d={3 + i} className="wr-bar-row">
            <div className="wr-bar-head">
              <span>{r.label}</span>
              <span>{pct(r.share)}%</span>
            </div>
            <div className="wr-bar">
              <i style={{ '--w': `${pct(r.share)}%` } as CSSProperties} />
            </div>
          </In>
        ))}
      </div>
      <In d={7} className="wr-strip" as="div">
        {c.items.slice(0, 4).map((s) => (
          <Art key={s.key} item={s} size="w185" className="wr-strip-art" />
        ))}
      </In>
    </div>
  );
}

function ActorCard({ actor }: { actor: FavouriteActor | null }) {
  if (!actor) {
    return (
      <div className="wr-body wr-body-center" aria-busy="true">
        <Kicker>Актёр года</Kicker>
        <div className="wr-photo wr-photo-skeleton" />
        <p className="wr-lead">Ищем, кого вы видели чаще всех…</p>
      </div>
    );
  }
  const photo = actor.profilePath ? `https://image.tmdb.org/t/p/w342${actor.profilePath}` : null;
  const n = actor.titles.length;
  return (
    <div className="wr-body wr-body-center">
      <Kicker>Актёр года</Kicker>
      <In d={1} className="wr-photo">
        {photo ? <img src={photo} alt={actor.name} draggable={false} /> : <span className="wr-photo-initial">{actor.name.slice(0, 1)}</span>}
      </In>
      <In d={2} as="h2" className="wr-title wr-actor-name">
        {actor.name}
      </In>
      <In d={3} as="p" className="wr-lead wr-lead-strong">
        {n > 1
          ? `Был с вами в ${n} ${plural(n, 'истории', 'историях', 'историях')} этого года`
          : `Больше всего серий — вместе в «${actor.titles[0].title}»`}
      </In>
      {n > 1 && (
        <In d={4} className="wr-strip wr-strip-center" as="div">
          {actor.titles.slice(0, 4).map((s) => (
            <Art key={s.key} item={s} size="w185" className="wr-strip-art" />
          ))}
        </In>
      )}
    </div>
  );
}

function StreakCard({ w }: { w: WrappedData }) {
  const s = w.longestStreak!;
  const b = w.busiestDay!;
  const bh = Math.floor(b.minutes / 60);
  const bm = b.minutes % 60;
  const time = bh ? `${bh} ч${bm ? ` ${bm} мин` : ''}` : `${bm} мин`;
  return (
    <div className="wr-body">
      <Kicker>Без пропусков</Kicker>
      <In d={1} className="wr-huge" as="div">
        <CountUp value={s.length} />
      </In>
      <In d={2} className="wr-huge-unit">
        {plural(s.length, 'день', 'дня', 'дней')} подряд
      </In>
      <In d={3} as="p" className="wr-lead">
        Рекорд года: {rangeLabel(s.start, s.end)}
      </In>
      <In d={4} className="wr-panel">
        <span className="wr-panel-label">Самый насыщенный день</span>
        <span className="wr-panel-value">{dayLabel(b.day)}</span>
        <span className="wr-panel-sub">
          {b.units} {plural(b.units, 'серия', 'серии', 'серий')} · {time}
        </span>
      </In>
      <In d={5} as="p" className="wr-fact">
        Всего {w.activeDays} {plural(w.activeDays, 'день', 'дня', 'дней')} с дорамами за год
      </In>
    </div>
  );
}

function TopCard({ w }: { w: WrappedData }) {
  return (
    <div className="wr-body">
      <Kicker>Топ-5 года</Kicker>
      <In d={1} as="h2" className="wr-title">
        Главные истории
      </In>
      <ol className="wr-top">
        {w.top.map((t, i) => {
          const meta = [
            t.item.userRating !== null ? `★ ${t.item.userRating}` : null,
            t.item.mediaType === 'movie' ? 'фильм' : `${t.units} ${plural(t.units, 'серия', 'серии', 'серий')}`,
          ].filter(Boolean);
          return (
            <li key={t.item.key} className="wr-top-row wr-in" data-first={i === 0} style={{ '--d': 2 + i } as CSSProperties}>
              <span className="wr-top-rank">{i + 1}</span>
              <Art item={t.item} size="w185" className="wr-top-art" />
              <span className="wr-top-body">
                <span className="wr-top-title">{t.item.title}</span>
                <span className="wr-top-meta">{meta.join(' · ')}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MonthsCard({ w }: { w: WrappedData }) {
  const max = Math.max(1, ...w.months.map((m) => m.units));
  const peak = w.months[w.peakMonth];
  return (
    <div className="wr-body">
      <Kicker>Год по месяцам</Kicker>
      <In d={1} as="h2" className="wr-title">
        Пик — {MONTHS_NOM[w.peakMonth]}
      </In>
      <In d={2} as="p" className="wr-lead wr-lead-strong">
        {peak.units} {plural(peak.units, 'серия', 'серии', 'серий')} за месяц
      </In>
      <div className="wr-chart" role="img" aria-label={w.months.map((m, i) => `${MONTHS_NOM[i]}: ${m.units}`).join(', ')}>
        {w.months.map((m, i) => (
          <div key={i} className="wr-col" data-peak={i === w.peakMonth} data-empty={m.units === 0}>
            <span className="wr-col-value">{m.units > 0 ? m.units : ''}</span>
            <span className="wr-col-bar" style={{ '--h': `${Math.max(m.units > 0 ? 4 : 1.5, (m.units / max) * 100)}%`, '--i': i } as CSSProperties} />
            <span className="wr-col-label">{MONTHS_SHORT[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutroCard({ w, actor, onShare }: { w: WrappedData; actor: FavouriteActor | null; onShare: () => void }) {
  const f = hoursFacts(w.minutes);
  const tiles: { label: string; value: string }[] = [];
  if (w.minutes > 0) tiles.push({ label: f.unit, value: f.value.toLocaleString('ru-RU') });
  if (w.episodes > 0) tiles.push({ label: plural(w.episodes, 'серия', 'серии', 'серий'), value: w.episodes.toLocaleString('ru-RU') });
  tiles.push({ label: plural(w.titles.length, 'история', 'истории', 'историй'), value: String(w.titles.length) });
  if (w.longestStreak && w.longestStreak.length > 1) {
    tiles.push({ label: `${plural(w.longestStreak.length, 'день', 'дня', 'дней')} подряд`, value: String(w.longestStreak.length) });
  }
  const facts: { label: string; value: string }[] = [];
  if (w.genres[0]) facts.push({ label: 'Жанр', value: w.genres[0].label });
  if (w.countries[0]) facts.push({ label: 'Страна', value: w.countries[0].label });
  if (actor) facts.push({ label: 'Актёр', value: actor.name });
  if (w.top[0]) facts.push({ label: 'Номер один', value: w.top[0].item.title });
  return (
    <div className="wr-body">
      <Kicker>Это был ваш {w.year}</Kicker>
      <In d={1} as="h2" className="wr-title wr-title-sm">
        Спасибо, что смотрели вместе с нами
      </In>
      <div className="wr-tiles">
        {tiles.slice(0, 4).map((t, i) => (
          <In key={t.label} d={2 + i} className="wr-tile">
            <span className="wr-tile-value">{t.value}</span>
            <span className="wr-tile-label">{t.label}</span>
          </In>
        ))}
      </div>
      {facts.length > 0 && (
        <In d={6} className="wr-facts-list" as="div">
          {facts.slice(0, 3).map((x) => (
            <div key={x.label} className="wr-facts-row">
              <span>{x.label}</span>
              <span>{x.value}</span>
            </div>
          ))}
        </In>
      )}
      <In d={7} className="wr-actions">
        <button type="button" className="wr-btn wr-btn-primary" onClick={onShare}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 14V3m0 0L8.5 6.5M12 3l3.5 3.5" />
            <path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
          </svg>
          Поделиться
        </button>
      </In>
    </div>
  );
}

function EmptyCard({ year, otherYears }: { year: number; otherYears: number[] }) {
  return (
    <div className="wr-body wr-body-center">
      <Kicker>Итоги {year}</Kicker>
      <In d={1} className="wr-empty-art">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <rect x="22" y="30" width="44" height="64" rx="9" transform="rotate(-12 44 62)" />
          <rect x="56" y="26" width="44" height="64" rx="9" transform="rotate(10 78 58)" />
          <path d="M70 52v20l16-10z" />
        </svg>
      </In>
      <In d={2} as="h2" className="wr-title">
        В {year} пока тихо
      </In>
      <In d={3} as="p" className="wr-lead">
        Отмечайте серии и фильмы в карточках, и здесь появится история вашего года: часы, любимый жанр, актёр и топ-5.
      </In>
      <In d={4} className="wr-actions">
        <button type="button" className="wr-btn wr-btn-primary" onClick={() => navigate('/catalog')}>
          В каталог
        </button>
      </In>
      <YearPills years={otherYears} />
    </div>
  );
}
