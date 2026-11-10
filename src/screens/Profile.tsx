import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Session } from '@supabase/supabase-js';
import { BottomSheet } from '../components/BottomSheet';
import { Poster } from '../components/Poster';
import { Refreshable } from '../components/Refreshable';
import { db } from '../lib/db';
import { navigate, openDrama, openSettings } from '../lib/router';
import { syncNow } from '../lib/sync';
import { buildHeatmap, computeAchievements, computeStats, type Achievement, type ProfileStats } from '../lib/stats';
import { kindOf, LIBRARY_KINDS, type LibraryKind, type SavedDrama } from '../lib/types';

export function Profile({ session }: { session: Session | null | undefined }) {
  const items = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const activity = useLiveQuery(() => db.activity.toArray(), []) ?? [];
  const [menuOpen, setMenuOpen] = useState(false);

  const stats = useMemo(() => computeStats(items, activity), [items, activity]);
  const weeks = useMemo(() => buildHeatmap(activity, 26), [activity]);
  const achievements = useMemo(() => computeAchievements(stats), [stats]);

  const email = session?.user.email ?? null;
  const name = email ? email.split('@')[0] : 'Гость';
  const initial = name.slice(0, 1).toUpperCase();

  const notesCount = items.filter((s) => s.notes.trim().length > 0).length;
  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  return (
    <>
      <header className="topbar profile-bar">
        <span className="profile-bar-spacer" />
        <h1 className="profile-name">{name}</h1>
        <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Меню">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </header>

      <Refreshable onRefresh={() => syncNow()} className="profile">
        <div className="avatar" aria-hidden>
          {email ? initial : <GlassesIcon />}
        </div>
        {!email && (
          <p className="muted small center">
            Вы не вошли в аккаунт. Статистика ведётся на этом устройстве.{' '}
            <button className="link" onClick={openSettings}>
              Войти
            </button>
          </p>
        )}

        <dl className="counters">
          <Counter value={stats.units} label={plural(stats.units, 'эпизод', 'эпизода', 'эпизодов')} />
          <Counter value={stats.hours} label={plural(stats.hours, 'час', 'часа', 'часов')} />
          <Counter value={stats.days} label={plural(stats.days, 'день', 'дня', 'дней')} />
        </dl>

        <section className="pblock">
          <div className="pblock-head">
            <h2>Статистика по дням</h2>
            {stats.streak > 0 && <span className="muted small">{stats.streak} {plural(stats.streak, 'день', 'дня', 'дней')} подряд</span>}
          </div>
          <Heatmap weeks={weeks} />
        </section>

        {LIBRARY_KINDS.map((k) => (
          <KindSection key={k.id} kind={k.id} title={k.title} items={items} />
        ))}

        <section className="pblock">
          <div className="pblock-head">
            <h2>Достижения</h2>
            <span className="muted small">
              {achievements.filter((a) => a.unlocked).length} из {achievements.length}
            </span>
          </div>
          <div className="achievements">
            {achievements.map((a) => (
              <AchievementCard key={a.id} a={a} />
            ))}
          </div>
        </section>
      </Refreshable>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} label="Меню профиля">
        <ProgressRows stats={stats} achievements={achievements} />
        <ul className="menu">
          <MenuItem title="Избранное" sub={`(${stats.favorites})`} onClick={() => go('/library/favorites')} icon={<HeartIcon />} />
          <MenuItem title="Заметки" sub={`(${notesCount})`} onClick={() => go('/notes')} icon={<NoteIcon />} />
          <MenuItem title="История просмотров" sub={`(${stats.days} ${plural(stats.days, 'день', 'дня', 'дней')})`} onClick={() => go('/history')} icon={<PlayIcon />} />
          <MenuItem title="Настройки" onClick={() => go('/settings')} icon={<GearIcon />} />
        </ul>
      </BottomSheet>
    </>
  );
}

/** Верх шторки: полоски прогресса в стиле панели лимитов. */
function ProgressRows({ stats, achievements }: { stats: ProfileStats; achievements: Achievement[] }) {
  const doramaDone = stats.byKind.dorama.completed;
  const doramaTotal = stats.byKind.dorama.total;
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const streakGoal = stats.streak >= 7 ? (stats.streak >= 30 ? 100 : 30) : 7;

  const rows = [
    {
      title: 'Дорамы досмотрено',
      value: doramaTotal ? doramaDone / doramaTotal : 0,
      sub: doramaTotal ? `${doramaDone} из ${doramaTotal} в библиотеке` : 'Пока нет дорам в библиотеке',
    },
    {
      title: 'Достижения',
      value: unlocked / achievements.length,
      sub: `${unlocked} из ${achievements.length} получено`,
    },
    {
      title: 'Серия дней',
      value: stats.streak / streakGoal,
      sub: stats.streak ? `${stats.streak} из ${streakGoal} ${plural(streakGoal, 'дня', 'дней', 'дней')} подряд` : 'Посмотрите серию сегодня, чтобы начать',
    },
  ];

  return (
    <div className="prog">
      {rows.map((r) => (
        <div key={r.title} className="prog-row">
          <div className="prog-head">
            <span>{r.title}</span>
            <span>{Math.round(Math.min(1, r.value) * 100)}%</span>
          </div>
          <div className="prog-bar">
            <div className="prog-fill" style={{ width: `${Math.round(Math.min(1, r.value) * 100)}%` }} />
          </div>
          <div className="prog-sub">{r.sub}</div>
        </div>
      ))}
    </div>
  );
}

function MenuItem({ title, sub, onClick, icon }: { title: string; sub?: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <li>
      <button className="menu-item" onClick={onClick}>
        <span className="menu-icon">{icon}</span>
        <span className="menu-text">
          <span className="menu-title">{title}</span>
          {sub && <span className="menu-sub">{sub}</span>}
        </span>
        <span className="chevron" aria-hidden>
          ›
        </span>
      </button>
    </li>
  );
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <div className="counter">
      <dt>
        <strong>{value}</strong> {label}
      </dt>
      <dd />
    </div>
  );
}

function Heatmap({ weeks }: { weeks: ReturnType<typeof buildHeatmap> }) {
  return (
    <div className="heatmap">
      <div className="heatmap-months">
        {weeks.map((w, i) => (
          <span key={i} className="heatmap-month">
            {w.monthLabel ?? ''}
          </span>
        ))}
      </div>
      <div className="heatmap-grid">
        {weeks.map((w, i) => (
          <div key={i} className="heatmap-week">
            {w.cells.map((c) => (
              <span
                key={c.day}
                className="heatmap-cell"
                data-level={c.level}
                data-future={c.isFuture}
                title={c.isFuture ? '' : `${c.day}: ${c.units}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="heatmap-legend">
        <span className="muted small">Меньше</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className="heatmap-cell" data-level={l} />
        ))}
        <span className="muted small">Больше</span>
      </div>
    </div>
  );
}

function KindSection({ kind, title, items }: { kind: LibraryKind; title: string; items: SavedDrama[] }) {
  const [mode, setMode] = useState<'completed' | 'planned'>('completed');
  const mine = useMemo(() => items.filter((s) => kindOf(s) === kind), [items, kind]);
  const completed = mine.filter((s) => s.status === 'completed');
  const planned = mine.filter((s) => s.status === 'planned');
  const list = (mode === 'completed' ? completed : planned).sort((a, b) => b.updatedAt - a.updatedAt);

  const emptyText = kind === 'movie' ? 'Нет фильмов' : kind === 'series' ? 'Нет сериалов' : 'Нет дорам';

  return (
    <section className="pblock">
      <button className="pblock-head pblock-link" onClick={() => navigate(`/library/${kind}`)}>
        <h2>{title}</h2>
        <span className="chevron" aria-hidden>
          ›
        </span>
      </button>
      <div className="segmented segmented-wide">
        <button data-active={mode === 'completed'} onClick={() => setMode('completed')}>
          <span className="seg-num">{completed.length}</span>
          <span className="seg-label">Посмотрел</span>
        </button>
        <button data-active={mode === 'planned'} onClick={() => setMode('planned')}>
          <span className="seg-num">{planned.length}</span>
          <span className="seg-label">Буду смотреть</span>
        </button>
      </div>
      {list.length === 0 ? (
        <div className="pblock-empty">
          <div className="empty-title">{emptyText}</div>
          <button className="btn btn-light" onClick={() => navigate('/catalog')}>
            Добавить
          </button>
        </div>
      ) : (
        <div className="strip">
          {list.slice(0, 12).map((s) => (
            <button key={s.key} className="strip-item" onClick={() => openDrama(s.mediaType, s.tmdbId)}>
              <Poster path={s.posterPath} alt={s.title} size="w185" className="strip-poster" />
              <span className="strip-title">{s.title}</span>
            </button>
          ))}
          {list.length > 12 && (
            <button className="strip-item strip-more" onClick={() => navigate(`/library/${kind}`)}>
              <span className="strip-poster strip-more-box">+{list.length - 12}</span>
              <span className="strip-title">Все</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function AchievementCard({ a }: { a: Achievement }) {
  return (
    <div className="ach" data-unlocked={a.unlocked} title={a.description}>
      <div className="ach-art">
        <div className="ach-wave" style={{ height: `${Math.max(12, Math.round(a.progress * 100))}%` }} />
      </div>
      <div className="ach-title">{a.title}</div>
      <div className="ach-sub muted small">{a.unlocked ? 'Получено' : `${a.current} / ${a.goal}`}</div>
    </div>
  );
}

function GlassesIcon() {
  return (
    <svg viewBox="0 0 48 24" aria-hidden className="glasses">
      <rect x="2" y="6" width="18" height="12" rx="4" />
      <rect x="28" y="6" width="18" height="12" rx="4" />
      <path d="M20 12h8M2 10l-2-4M46 10l2-4" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M5 4h10l4 4v12H5z" />
      <path d="M15 4v4h4M8 13h8M8 17h5" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l5.5-3.5z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </svg>
  );
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
