import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Session } from '@supabase/supabase-js';
import { Poster } from '../components/Poster';
import { db } from '../lib/db';
import { navigate, openDrama, openSettings } from '../lib/router';
import { buildHeatmap, computeAchievements, computeStats, type Achievement } from '../lib/stats';
import { kindOf, LIBRARY_KINDS, type LibraryKind, type SavedDrama } from '../lib/types';

export function Profile({ session }: { session: Session | null | undefined }) {
  const items = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const activity = useLiveQuery(() => db.activity.toArray(), []) ?? [];

  const stats = useMemo(() => computeStats(items, activity), [items, activity]);
  const weeks = useMemo(() => buildHeatmap(activity, 26), [activity]);
  const achievements = useMemo(() => computeAchievements(stats), [stats]);

  const email = session?.user.email ?? null;
  const name = email ? email.split('@')[0] : 'Гость';
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <>
      <header className="topbar profile-bar">
        <span className="profile-bar-spacer" />
        <h1 className="profile-name">{name}</h1>
        <button className="icon-btn" onClick={openSettings} aria-label="Настройки">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </header>

      <div className="content profile">
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
      </div>
    </>
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
  const catalogTarget = kind === 'movie' ? '/catalog' : '/catalog';

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
          <button className="btn btn-light" onClick={() => navigate(catalogTarget)}>
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
      <div className="ach-sub muted small">
        {a.unlocked ? 'Получено' : `${a.current} / ${a.goal}`}
      </div>
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

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
