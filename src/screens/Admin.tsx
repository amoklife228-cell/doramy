import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AdminError,
  checkAdmin,
  loadFeed,
  loadOverview,
  loadUser,
  loadUsers,
  type AdminDay,
  type AdminFeedRow,
  type AdminOverview,
  type AdminUser,
  type AdminUserDetail,
} from '../lib/admin';
import { tmdbImg } from '../lib/img';
import { timeAgo } from '../lib/news';
import { goBack, navigate, openDrama } from '../lib/router';
import { STATUSES } from '../lib/types';
import { NavBar } from '../components/NavBar';
import { plural } from './Profile';
import './Admin.css';

type Tab = 'summary' | 'people' | 'feed';
type Metric = 'devices' | 'opens' | 'actions' | 'units';

const METRICS: { id: Metric; title: string; unit: [string, string, string] }[] = [
  { id: 'devices', title: 'Люди', unit: ['устройство', 'устройства', 'устройств'] },
  { id: 'opens', title: 'Открытия', unit: ['открытие', 'открытия', 'открытий'] },
  { id: 'actions', title: 'Действия', unit: ['действие', 'действия', 'действий'] },
  { id: 'units', title: 'Серии', unit: ['серия', 'серии', 'серий'] },
];

const STATUS_TITLE = new Map(STATUSES.map((s) => [s.id, s.title]));

function fmtDay(iso: string, long = false): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', long ? { day: 'numeric', month: 'long', weekday: 'short' } : { day: 'numeric', month: 'short' });
}

function n(v: number, forms: [string, string, string]) {
  return `${v} ${plural(v, ...forms)}`;
}

function hours(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.round(minutes / 6) / 10;
  return `${String(h).replace('.', ',')} ч`;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Вкладка и открытый пользователь переживают переход в карточку сериала и обратно (экран монтируется заново).
let keptTab: Tab = 'summary';
let keptUser: string | null = null;

export function Admin({ session }: { session: Session | null | undefined }) {
  const [state, setState] = useState<'checking' | 'admin' | 'denied' | 'not_installed' | 'error'>('checking');
  const [error, setError] = useState('');
  const [tab, setTabState] = useState<Tab>(keptTab);
  const [userId, setUserState] = useState<string | null>(keptUser);
  const setTab = (t: Tab) => setTabState((keptTab = t));
  const setUserId = (id: string | null) => setUserState((keptUser = id));
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (userId ? setUserId(null) : goBack());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [userId]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    setState('checking');
    checkAdmin().then(
      (ok) => alive && setState(ok === null ? 'not_installed' : ok ? 'admin' : 'denied'),
      (e) => {
        if (!alive) return;
        setError(errorText(e));
        setState('error');
      },
    );
    return () => {
      alive = false;
    };
  }, [session, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  let body: React.ReactNode;
  if (session === undefined || (session && state === 'checking')) {
    body = <div className="adm-loading">Загрузка…</div>;
  } else if (!session) {
    body = (
      <div className="empty">
        <div className="empty-title">Нужен вход</div>
        <div>Войдите в аккаунт администратора в настройках.</div>
        <button type="button" className="btn empty-action" onClick={() => navigate('/settings')}>
          Открыть настройки
        </button>
      </div>
    );
  } else if (state === 'not_installed' || state === 'denied') {
    body = <Setup session={session} installed={state === 'denied'} onRetry={reload} />;
  } else if (state === 'error') {
    body = (
      <div className="empty">
        <div className="empty-title">Не удалось загрузить</div>
        <div>{error}</div>
        <button type="button" className="btn empty-action" onClick={reload}>
          Повторить
        </button>
      </div>
    );
  } else if (userId) {
    body = <UserView id={userId} reloadKey={reloadKey} />;
  } else {
    body = (
      <>
        <div className="adm-seg" role="tablist">
          {(
            [
              ['summary', 'Сводка'],
              ['people', 'Люди'],
              ['feed', 'Лента'],
            ] as const
          ).map(([id, title]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'active' : ''}
              onClick={() => setTab(id)}
            >
              {title}
            </button>
          ))}
        </div>
        {tab === 'summary' && <Summary reloadKey={reloadKey} />}
        {tab === 'people' && <People reloadKey={reloadKey} onOpen={setUserId} />}
        {tab === 'feed' && <Feed reloadKey={reloadKey} onOpen={setUserId} />}
      </>
    );
  }

  return (
    <div className="detail" role="dialog" aria-modal="true">
      <NavBar
        backLabel={userId ? 'Люди' : 'Назад'}
        onBack={userId ? () => setUserId(null) : goBack}
        title={userId ? 'Пользователь' : undefined}
        right={
          state === 'admin' ? (
            <button type="button" className="adm-refresh" onClick={reload} aria-label="Обновить">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />
              </svg>
            </button>
          ) : undefined
        }
      />
      <div className="content detail-content ios-page adm">
        {!userId && <h1 className="ios-large-title">Админ-панель</h1>}
        {body}
      </div>
    </div>
  );
}

/** Подсказка, как включить панель: выполнить admin.sql и назначить себя администратором. */
function Setup({ session, installed, onRetry }: { session: Session; installed: boolean; onRetry: () => void }) {
  const [copied, setCopied] = useState(false);
  const sql = `insert into public.admins (user_id) values ('${session.user.id}') on conflict do nothing;`;
  const copy = () => {
    void navigator.clipboard?.writeText(sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="adm-setup">
      <p>
        {installed
          ? 'Этот аккаунт пока не администратор.'
          : 'На сервере ещё нет функций админ-панели.'}
      </p>
      <ol>
        {!installed && (
          <li>
            В Supabase откройте <b>SQL Editor</b>, вставьте содержимое файла <code>supabase/admin.sql</code> из репозитория и
            нажмите <b>Run</b>.
          </li>
        )}
        <li>
          Там же выполните строку ниже: она делает администратором аккаунт <b>{session.user.email}</b>.
        </li>
      </ol>
      <pre className="adm-sql">{sql}</pre>
      <div className="adm-setup-actions">
        <button type="button" className="btn btn-primary" onClick={copy}>
          {copied ? 'Скопировано' : 'Скопировать'}
        </button>
        <button type="button" className="btn" onClick={onRetry}>
          Проверить снова
        </button>
      </div>
    </div>
  );
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  useEffect(() => {
    let alive = true;
    setError(null);
    run().then(
      (d) => alive && setData(d),
      (e) => alive && setError(e instanceof AdminError ? e.message : errorText(e)),
    );
    return () => {
      alive = false;
    };
  }, [run]);
  return { data, error };
}

function Loading({ error }: { error: string | null }) {
  return <div className="adm-loading">{error ? `Ошибка: ${error}` : 'Загрузка…'}</div>;
}

function Summary({ reloadKey }: { reloadKey: number }) {
  const { data, error } = useLoad(() => loadOverview(30), [reloadKey]);
  const [metric, setMetric] = useState<Metric>('devices');
  if (!data) return <Loading error={error} />;
  const o: AdminOverview = data;
  const platforms = Object.entries(o.platforms).sort((a, b) => b[1] - a[1]);
  const maxPlatform = Math.max(1, ...platforms.map((p) => p[1]));
  return (
    <>
      <div className="adm-tiles">
        <Tile value={o.devices_today} label="сегодня" sub={n(o.opens_today, ['открытие', 'открытия', 'открытий'])} />
        <Tile value={o.devices_7} label="за 7 дней" sub={`новых ${o.new_devices_7}`} />
        <Tile value={o.devices_30} label="за 30 дней" sub={`всего ${o.devices_all}`} />
        <Tile value={o.users} label={plural(o.users, 'аккаунт', 'аккаунта', 'аккаунтов')} sub={`+${o.users_new_7} за неделю`} />
        <Tile value={o.installed_30} label="с экрана «Домой»" sub="за 30 дней" />
        <Tile value={o.units_7} label={plural(o.units_7, 'серия', 'серии', 'серий')} sub="за 7 дней" />
      </div>
      <p className="adm-note">
        Люди считаются по устройствам: каждый телефон или браузер — отдельно, с аккаунтом и без. Серии — только у тех, кто
        вошёл в аккаунт.
      </p>

      <section className="adm-card">
        <div className="adm-chips">
          {METRICS.map((m) => (
            <button key={m.id} type="button" className={metric === m.id ? 'active' : ''} onClick={() => setMetric(m.id)}>
              {m.title}
            </button>
          ))}
        </div>
        <BarChart days={o.days} metric={metric} />
      </section>

      {platforms.length > 0 && (
        <section className="adm-card">
          <h2 className="adm-card-title">Устройства за 30 дней</h2>
          {platforms.map(([name, count]) => (
            <div key={name} className="adm-hbar">
              <span className="adm-hbar-label">{name}</span>
              <span className="adm-hbar-track">
                <span className="adm-hbar-fill" style={{ width: `${(count / maxPlatform) * 100}%` }} />
              </span>
              <span className="adm-hbar-value">{count}</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function Tile({ value, label, sub }: { value: number; label: string; sub?: string }) {
  return (
    <div className="adm-tile">
      <div className="adm-tile-value">{value.toLocaleString('ru-RU')}</div>
      <div className="adm-tile-label">{label}</div>
      {sub && <div className="adm-tile-sub">{sub}</div>}
    </div>
  );
}

/** Столбики по дням, один ряд данных. Нажатие/наведение показывает значение дня. */
function BarChart({ days, metric }: { days: AdminDay[]; metric: Metric }) {
  const [sel, setSel] = useState<number | null>(null);
  const m = METRICS.find((x) => x.id === metric)!;
  const values = days.map((d) => d[metric]);
  const max = Math.max(1, ...values);
  const shown = sel ?? days.length - 1;
  const total = values.reduce((a, b) => a + b, 0);
  const W = 300;
  const H = 120;
  const step = W / days.length;
  const bw = Math.max(2, step - 2);
  return (
    <div className="adm-chart">
      <div className="adm-chart-head">
        <span className="adm-chart-value">{n(values[shown] ?? 0, m.unit)}</span>
        <span className="adm-chart-day">{days[shown] ? fmtDay(days[shown].day, true) : ''}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="adm-chart-svg"
        role="img"
        aria-label={`${m.title} по дням за ${days.length} дней, всего ${total}`}
        onPointerLeave={() => setSel(null)}
      >
        <line x1="0" x2={W} y1={0.5} y2={0.5} className="adm-grid" />
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="adm-axis" />
        {days.map((d, i) => {
          const v = values[i];
          const h = v > 0 ? Math.max(3, (v / max) * (H - 4)) : 0;
          const x = i * step + (step - bw) / 2;
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={d.day} onPointerEnter={() => setSel(i)} onPointerDown={() => setSel(i)}>
              <rect x={i * step} y={0} width={step} height={H} fill="transparent" />
              {h > 0 && (
                <path
                  className={i === shown ? 'adm-bar active' : 'adm-bar'}
                  d={`M${x},${H} V${H - h + r} Q${x},${H - h} ${x + r},${H - h} H${x + bw - r} Q${x + bw},${H - h} ${x + bw},${H - h + r} V${H} Z`}
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="adm-chart-axis">
        <span>{days[0] ? fmtDay(days[0].day) : ''}</span>
        <span>макс. {max}</span>
        <span>{days.length ? fmtDay(days[days.length - 1].day) : ''}</span>
      </div>
    </div>
  );
}

function People({ reloadKey, onOpen }: { reloadKey: number; onOpen: (id: string) => void }) {
  const { data, error } = useLoad(loadUsers, [reloadKey]);
  const [q, setQ] = useState('');
  const list = useMemo(
    () => (data ?? []).filter((u) => !q.trim() || (u.email ?? '').toLowerCase().includes(q.trim().toLowerCase())),
    [data, q],
  );
  if (!data) return <Loading error={error} />;
  return (
    <>
      <input
        className="adm-search"
        type="search"
        placeholder={`Поиск среди ${n(data.length, ['аккаунта', 'аккаунтов', 'аккаунтов'])}`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {list.length === 0 && <div className="adm-loading">Никого не найдено.</div>}
      <div className="adm-list">
        {list.map((u: AdminUser) => (
          <button key={u.id} type="button" className="adm-user" onClick={() => onOpen(u.id)}>
            <span className="adm-avatar">{(u.email ?? '?').slice(0, 1).toUpperCase()}</span>
            <span className="adm-user-main">
              <span className="adm-user-email">
                {u.email ?? 'без email'}
                {u.is_admin && <span className="adm-badge">админ</span>}
              </span>
              <span className="adm-user-sub">
                {n(u.titles, ['тайтл', 'тайтла', 'тайтлов'])} · {n(u.units, ['серия', 'серии', 'серий'])}
                {u.minutes > 0 ? ` · ${hours(u.minutes)}` : ''}
              </span>
            </span>
            <span className="adm-user-seen">{u.last_seen ? timeAgo(u.last_seen) : '—'}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function statusText(r: { status: string | null; episodes: number | null; episode_count: number | null; media_type: string }): string {
  const s = STATUS_TITLE.get((r.status ?? '') as never) ?? r.status ?? '';
  if (r.media_type === 'tv' && (r.episodes ?? 0) > 0) {
    return `${s} · ${r.episodes}${r.episode_count ? ` из ${r.episode_count}` : ''} сер.`;
  }
  return s;
}

function Feed({ reloadKey, onOpen }: { reloadKey: number; onOpen: (id: string) => void }) {
  const { data, error } = useLoad(() => loadFeed(100), [reloadKey]);
  if (!data) return <Loading error={error} />;
  if (data.length === 0) return <div className="adm-loading">Пока пусто: никто из вошедших ничего не добавил.</div>;
  return (
    <div className="adm-list">
      {data.map((r: AdminFeedRow, i) => (
        <div key={`${r.user_id}:${r.media_type}:${r.tmdb_id}:${i}`} className="adm-feed">
          <Thumb path={r.poster} />
          <div className="adm-feed-main">
            <button type="button" className="adm-link" onClick={() => onOpen(r.user_id)}>
              {r.email ?? 'без email'}
            </button>
            <div className="adm-feed-title">
              {r.deleted ? 'удалил(а) ' : ''}
              <button type="button" className="adm-title-link" onClick={() => openDrama(r.media_type, r.tmdb_id)}>
                {r.title ?? `#${r.tmdb_id}`}
              </button>
            </div>
            {!r.deleted && <div className="adm-feed-sub">{statusText(r)}</div>}
          </div>
          <span className="adm-user-seen">{timeAgo(r.updated_at)}</span>
        </div>
      ))}
    </div>
  );
}

function Thumb({ path }: { path: string | null }) {
  return path ? (
    <img className="adm-thumb" src={tmdbImg('w92', path)} alt="" loading="lazy" />
  ) : (
    <span className="adm-thumb" />
  );
}

function UserView({ id, reloadKey }: { id: string; reloadKey: number }) {
  const users = useLoad(loadUsers, [reloadKey]);
  const { data, error } = useLoad(() => loadUser(id), [id, reloadKey]);
  const u = users.data?.find((x) => x.id === id);
  if (!data) return <Loading error={error} />;
  const d: AdminUserDetail = data;
  // Активность за 30 дней, пустые дни — нулями.
  const byDay = new Map(d.activity.map((a) => [a.day.slice(0, 10), a]));
  const days: AdminDay[] = [];
  for (let i = 29; i >= 0; i--) {
    const t = new Date();
    t.setDate(t.getDate() - i);
    const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    days.push({ day: key, devices: 0, opens: 0, actions: 0, units: byDay.get(key)?.units ?? 0 });
  }
  const counts = new Map<string, number>();
  for (const r of d.library) counts.set(r.status ?? '', (counts.get(r.status ?? '') ?? 0) + 1);
  return (
    <>
      <div className="adm-profile">
        <span className="adm-avatar big">{(u?.email ?? '?').slice(0, 1).toUpperCase()}</span>
        <div>
          <div className="adm-profile-email">{u?.email ?? id}</div>
          {u && (
            <div className="adm-user-sub">
              с {fmtDay(u.created_at)} · был(а) {u.last_seen ? timeAgo(u.last_seen) : 'давно'} ·{' '}
              {n(u.devices, ['устройство', 'устройства', 'устройств'])}
            </div>
          )}
        </div>
      </div>
      {u && (
        <div className="adm-tiles">
          <Tile value={u.titles} label="в библиотеке" />
          <Tile value={u.units} label={plural(u.units, 'серия', 'серии', 'серий')} sub={hours(u.minutes)} />
          <Tile value={u.watching} label="смотрит" sub={`досмотрено ${u.completed}`} />
        </div>
      )}
      <section className="adm-card">
        <h2 className="adm-card-title">Серии за 30 дней</h2>
        <BarChart days={days} metric="units" />
      </section>
      <section className="adm-card">
        <h2 className="adm-card-title">
          Библиотека
          <span className="adm-card-meta">
            {STATUSES.filter((s) => counts.get(s.id))
              .map((s) => `${s.short} ${counts.get(s.id)}`)
              .join(' · ')}
          </span>
        </h2>
        {d.library.length === 0 && <div className="adm-loading">Пусто.</div>}
        <div className="adm-list flat">
          {d.library.map((r) => (
            <button key={r.key} type="button" className="adm-feed" onClick={() => openDrama(r.media_type, r.tmdb_id)}>
              <Thumb path={r.poster} />
              <span className="adm-feed-main">
                <span className="adm-feed-title">
                  {r.title ?? `#${r.tmdb_id}`}
                  {r.favorite ? <span className="adm-heart"> ♥</span> : null}
                </span>
                <span className="adm-feed-sub">
                  {statusText(r)}
                  {r.rating ? ` · ★ ${r.rating}` : ''}
                </span>
                {r.review && <span className="adm-review">«{r.review}»</span>}
              </span>
              <span className="adm-user-seen">{timeAgo(r.updated_at)}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
