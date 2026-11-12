import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { NavBar } from '../components/NavBar';
import { Poster } from '../components/Poster';
import { db } from '../lib/db';
import { addDays, cachedCalendar, calendarRange, loadCalendar, trackedShows, type CalendarEpisode } from '../lib/calendar';
import { useConfigured } from '../lib/hooks';
import { useDesktop } from '../lib/media';
import { timeAgo } from '../lib/news';
import { goBack, navigate, openDrama } from '../lib/router';
import { todayKey, type SavedDrama } from '../lib/types';
import { plural } from './Profile';
import './Calendar.css';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Серии одного сериала за один день (дорамы часто выходят по две серии сразу). */
interface Row {
  item: SavedDrama;
  eps: CalendarEpisode[];
}

/** Календарь выхода серий по сериалам из библиотеки: сетка месяца и список по дням. */
export function Calendar() {
  const configured = useConfigured();
  const desktop = useDesktop();
  // undefined, пока база не ответила: так не мелькает пустое состояние.
  const library = useLiveQuery(() => db.items.toArray(), []);
  const tracked = useMemo(() => trackedShows(library ?? []), [library]);
  const basis = useMemo(() => tracked.map((s) => s.key).sort().join(','), [tracked]);

  const [episodes, setEpisodes] = useState<CalendarEpisode[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(0);
  const [force, setForce] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const today = todayKey();
  const range = calendarRange(today);
  const [month, setMonth] = useState(() => today.slice(0, 7));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && goBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (library === undefined || !configured) return;
    if (!basis) {
      setEpisodes([]);
      return;
    }
    let alive = true;
    // Сначала кэш (мгновенно), потом догружаем недостающее и устаревшее.
    const cached = cachedCalendar(library);
    if (force === 0 && (cached.episodes.length || cached.complete)) {
      setEpisodes(cached.episodes);
      setCheckedAt(cached.at);
    }
    if (cached.complete && force === 0) return;
    setLoading(true);
    void loadCalendar(library, { force: force > 0 }).then((r) => {
      if (!alive) return;
      setEpisodes(r.episodes);
      setCheckedAt(r.at);
      setFailed(r.failed);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basis, configured, force, library === undefined]);

  const byKey = useMemo(() => new Map(tracked.map((s) => [s.key, s])), [tracked]);

  // Серии по дням в пределах диапазона: прошлая неделя и два месяца вперёд.
  const byDay = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const ep of episodes ?? []) {
      if (ep.airDate < range.from || ep.airDate > range.to) continue;
      const item = byKey.get(ep.key);
      if (!item) continue;
      if (!map.has(ep.airDate)) map.set(ep.airDate, []);
      const rows = map.get(ep.airDate)!;
      const row = rows.find((r) => r.item.key === ep.key);
      if (row) row.eps.push(ep);
      else rows.push({ item, eps: [ep] });
    }
    for (const rows of map.values()) {
      for (const r of rows) r.eps.sort((a, b) => a.season - b.season || a.episode - b.episode);
      rows.sort((a, b) => a.item.title.localeCompare(b.item.title, 'ru'));
    }
    return map;
  }, [episodes, byKey, range.from, range.to]);

  const days = useMemo(() => [...byDay.keys()].sort(), [byDay]);
  const upcomingDays = days.filter((d) => d >= today);
  const pastDays = days.filter((d) => d < today).reverse();
  const upcomingCount = upcomingDays.reduce((n, d) => n + epCount(byDay.get(d)!), 0);

  const minMonth = range.from.slice(0, 7);
  const maxMonth = range.to.slice(0, 7);

  const pickDay = (day: string) => {
    setSelected((cur) => (cur === day ? null : day));
    if (desktop) return;
    // На телефоне список под сеткой: показываем его начало.
    requestAnimationFrame(() => document.querySelector('.cal-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const empty = library !== undefined && tracked.length === 0;

  return (
    <div className="detail cal-screen" role="dialog" aria-modal="true" aria-label="Календарь">
      <NavBar
        backLabel="Назад"
        right={
          !empty && configured ? (
            <button
              type="button"
              className="cal-refresh"
              onClick={() => setForce((n) => n + 1)}
              disabled={loading}
              aria-label="Обновить календарь"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" data-spin={loading}>
                <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                <path d="M20 4v4.5h-4.5" />
              </svg>
            </button>
          ) : null
        }
      />
      <div className="content detail-content cal-page">
        <h1 className="ios-large-title">Календарь</h1>
        {library === undefined ? null : empty ? (
          <div className="empty cal-empty">
            <CalendarArt />
            <div className="empty-title">Календарь пуст</div>
            <div className="empty-text">
              Добавьте сериалы со статусом «Смотрю» или «Хочу посмотреть», и здесь появятся даты выхода новых серий.
            </div>
            <div className="empty-action">
              <button className="btn btn-primary" onClick={() => navigate('/catalog')}>
                Открыть каталог
              </button>
            </div>
          </div>
        ) : !configured ? (
          <div className="empty">
            <div className="empty-title">Нет доступа к TMDB</div>
            <div className="empty-text">Укажите ключ TMDB в «Настройках», чтобы узнать даты выхода серий.</div>
          </div>
        ) : (
          <div className="cal-layout">
            <div className="cal-side">
              <MonthGrid
                month={month}
                today={today}
                range={range}
                byDay={byDay}
                selected={selected}
                onPick={pickDay}
                canPrev={month > minMonth}
                canNext={month < maxMonth}
                onMonth={(delta) => setMonth((m) => shiftMonth(m, delta))}
              />
              <p className="cal-summary muted small">
                {episodes === null
                  ? 'Загружаем расписание…'
                  : `${tracked.length} ${plural(tracked.length, 'сериал', 'сериала', 'сериалов')} в календаре · ${
                      upcomingCount
                        ? `${upcomingCount} ${plural(upcomingCount, 'серия', 'серии', 'серий')} впереди`
                        : 'новых серий пока не объявлено'
                    }`}
                {checkedAt && episodes !== null ? ` · обновлено ${timeAgo(checkedAt)}` : ''}
                {failed > 0 ? ` · не обновилось: ${failed}` : ''}
              </p>
            </div>

            <div className="cal-list">
              {episodes === null ? (
                <ListSkeleton />
              ) : selected ? (
                <>
                  <div className="cal-filter">
                    <span>{dayTitle(selected, today)}</span>
                    <button type="button" className="link" onClick={() => setSelected(null)}>
                      Все дни
                    </button>
                  </div>
                  {byDay.get(selected) ? (
                    <DayGroup rows={byDay.get(selected)!} />
                  ) : (
                    <p className="cal-none">В этот день новых серий нет.</p>
                  )}
                </>
              ) : days.length === 0 ? (
                <div className="empty cal-nothing">
                  <div className="empty-title">Новых серий не ожидается</div>
                  <div className="empty-text">
                    В ближайшие два месяца у сериалов из библиотеки не объявлено новых серий. Даты появятся, как только их опубликуют на TMDB.
                  </div>
                </div>
              ) : (
                <>
                  {upcomingDays.map((d) => (
                    <DaySection key={d} day={d} today={today} rows={byDay.get(d)!} />
                  ))}
                  {upcomingDays.length === 0 && <p className="cal-none">Ближайших новых серий пока не объявлено.</p>}
                  {pastDays.length > 0 && <h2 className="cal-divider">Недавно вышли</h2>}
                  {pastDays.map((d) => (
                    <DaySection key={d} day={d} today={today} rows={byDay.get(d)!} past />
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MonthGrid({
  month,
  today,
  range,
  byDay,
  selected,
  onPick,
  canPrev,
  canNext,
  onMonth,
}: {
  month: string;
  today: string;
  range: { from: string; to: string };
  byDay: Map<string, Row[]>;
  selected: string | null;
  onPick: (day: string) => void;
  canPrev: boolean;
  canNext: boolean;
  onMonth: (delta: number) => void;
}) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysIn }, (_, i) => todayKey(new Date(y, m - 1, i + 1))),
  ];
  while (cells.length % 7) cells.push(null);
  const title = first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(' г.', '');

  return (
    <div className="cal-month">
      <div className="cal-month-head">
        <button type="button" className="cal-nav" onClick={() => onMonth(-1)} disabled={!canPrev} aria-label="Предыдущий месяц">
          <svg viewBox="0 0 12 21" aria-hidden="true">
            <path d="M10 2L2 10.5 10 19" />
          </svg>
        </button>
        <h2 className="cal-month-title">{title[0].toUpperCase() + title.slice(1)}</h2>
        <button type="button" className="cal-nav" onClick={() => onMonth(1)} disabled={!canNext} aria-label="Следующий месяц">
          <svg viewBox="0 0 12 21" aria-hidden="true">
            <path d="M2 2l8 8.5L2 19" />
          </svg>
        </button>
      </div>
      <div className="cal-grid" role="group" aria-label={title}>
        {WEEKDAYS.map((w, i) => (
          <span key={w} className="cal-wd" data-weekend={i >= 5} aria-hidden="true">
            {w}
          </span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={`x${i}`} className="cal-cell cal-blank" aria-hidden="true" />;
          const rows = byDay.get(day) ?? [];
          const inRange = day >= range.from && day <= range.to;
          const num = Number(day.slice(8));
          const n = epCount(rows);
          const label = `${new Date(y, m - 1, num).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}${
            n ? `: ${n} ${plural(n, 'серия', 'серии', 'серий')}` : ''
          }`;
          const posters = rows.map((r) => r.item);
          return (
            <button
              key={day}
              type="button"
              className="cal-cell"
              data-day={day}
              data-today={day === today}
              data-past={day < today}
              data-has={rows.length > 0}
              data-selected={selected === day}
              disabled={!inRange}
              aria-label={label}
              aria-pressed={selected === day}
              onClick={() => onPick(day)}
            >
              <span className="cal-num">{num}</span>
              {rows.length > 0 && (
                <>
                  <span className="cal-dots" aria-hidden="true">
                    {posters.slice(0, 3).map((p) => (
                      <i key={p.key} />
                    ))}
                  </span>
                  <span className="cal-thumbs" aria-hidden="true">
                    {posters.slice(0, 2).map((p) => (
                      <Poster key={p.key} path={p.posterPath} alt="" size="w185" className="cal-thumb" />
                    ))}
                    {posters.length > 2 && <span className="cal-thumb-more">+{posters.length - 2}</span>}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DaySection({ day, today, rows, past }: { day: string; today: string; rows: Row[]; past?: boolean }) {
  return (
    <section className="cal-day" data-past={!!past} data-day={day}>
      <h3 className="cal-day-title" data-today={day === today}>
        {dayTitle(day, today)}
      </h3>
      <DayGroup rows={rows} />
    </section>
  );
}

function DayGroup({ rows }: { rows: Row[] }) {
  return (
    <ul className="cal-items">
      {rows.map(({ item, eps }) => (
        <li key={item.key}>
          <button type="button" className="cal-item" onClick={() => openDrama('tv', item.tmdbId)}>
            <Poster path={item.posterPath} alt={item.title} size="w185" className="cal-poster" />
            <span className="cal-item-body">
              <span className="cal-item-title">{item.title}</span>
              <span className="cal-item-sub">
                <span className="cal-code">{episodeCodes(eps)}</span>
                {eps.length === 1
                  ? eps[0].name
                    ? ` · ${eps[0].name}`
                    : ''
                  : ` · ${eps.length} ${plural(eps.length, 'серия', 'серии', 'серий')}`}
              </span>
            </span>
            <svg className="ios-chevron" viewBox="0 0 8 14" fill="none" aria-hidden="true">
              <path d="M1 1l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загружаем расписание">
      {[0, 1].map((g) => (
        <section key={g} className="cal-day">
          <div className="skeleton skeleton-line" style={{ width: 140, height: 16, margin: '0 0 10px 4px' }} />
          <ul className="cal-items">
            {[0, 1].map((i) => (
              <li key={i}>
                <div className="cal-item">
                  <div className="cal-poster skeleton" />
                  <span className="cal-item-body">
                    <span className="skeleton skeleton-line" style={{ width: '55%' }} />
                    <span className="skeleton skeleton-line" style={{ width: '35%' }} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CalendarArt() {
  return (
    <svg className="cal-art" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="9" y="13" width="46" height="42" rx="9" />
      <path d="M9 25h46M21 8v10M43 8v10" />
      <circle cx="23" cy="36" r="2.4" />
      <circle cx="32" cy="36" r="2.4" />
      <circle cx="41" cy="36" r="2.4" />
      <circle cx="23" cy="45" r="2.4" />
    </svg>
  );
}

const epCount = (rows: Row[]) => rows.reduce((n, r) => n + r.eps.length, 0);

/** «S1 E7», «S1 E7–E8» (подряд), иначе «S1 E7, E9». */
function episodeCodes(eps: CalendarEpisode[]): string {
  const first = eps[0];
  const last = eps[eps.length - 1];
  if (eps.length === 1) return `S${first.season} E${first.episode}`;
  const sameSeason = eps.every((e) => e.season === first.season);
  const consecutive = sameSeason && eps.every((e, i) => e.episode === first.episode + i);
  if (consecutive) return `S${first.season} E${first.episode}–E${last.episode}`;
  return eps.map((e) => `S${e.season} E${e.episode}`).join(', ');
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** «Сегодня», «Завтра», «Вчера» или «Пт, 14 ноября». */
export function dayTitle(day: string, today: string): string {
  if (day === today) return 'Сегодня';
  if (day === addDays(today, 1)) return 'Завтра';
  if (day === addDays(today, -1)) return 'Вчера';
  const [y, m, d] = day.split('-').map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
  return s[0].toUpperCase() + s.slice(1);
}
