import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Session } from '@supabase/supabase-js';
import { BottomSheet } from '../components/BottomSheet';
import { IconColors, IosRow, IosSection, RowIcons } from '../components/IosList';
import { Poster } from '../components/Poster';
import { Refreshable } from '../components/Refreshable';
import { WrappedBanner } from '../components/WrappedBanner';
import { db } from '../lib/db';
import { useDesktop } from '../lib/media';
import { navigate, openDrama, openSettings } from '../lib/router';
import { syncNow } from '../lib/sync';
import { buildHeatmap, computeAchievements, computeStats, type Achievement, type ProfileStats } from '../lib/stats';
import { kindOf, LIBRARY_KINDS, type LibraryKind, type SavedDrama } from '../lib/types';
import './Profile.css';

export function Profile({ session }: { session: Session | null | undefined }) {
  const items = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const activity = useLiveQuery(() => db.activity.toArray(), []) ?? [];
  const [menuOpen, setMenuOpen] = useState(false);
  // id держим и после закрытия, чтобы шторка не опустела во время анимации ухода.
  const [achId, setAchId] = useState<string | null>(null);
  const [achOpen, setAchOpen] = useState(false);

  const stats = useMemo(() => computeStats(items, activity), [items, activity]);
  // На компьютере места хватает на целый год, на телефоне — полгода.
  const desktop = useDesktop();
  const weeks = useMemo(() => buildHeatmap(activity, desktop ? 52 : 26), [activity, desktop]);
  const achievements = useMemo(() => computeAchievements(stats), [stats]);
  const selectedAch = achievements.find((a) => a.id === achId) ?? null;

  const email = session?.user.email ?? null;
  const name = email ? email.split('@')[0] : 'Гость';
  const initial = name.slice(0, 1).toUpperCase();

  const notesCount = items.filter((s) => s.notes.trim().length > 0).length;
  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };
  const openAch = (id: string) => {
    setAchId(id);
    setAchOpen(true);
  };

  return (
    <>
      <header className="topbar profile-bar">
        <span className="profile-bar-spacer" />
        <h1 className="profile-name">{name}</h1>
        <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Меню" aria-haspopup="dialog">
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

        <WrappedBanner items={items} activity={activity} />

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
              <AchievementCard key={a.id} a={a} onOpen={() => openAch(a.id)} />
            ))}
          </div>
        </section>
      </Refreshable>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} label="Меню профиля">
        <ProgressRows stats={stats} achievements={achievements} />
        <div className="profile-menu">
          <IosSection>
            <IosRow
              icon={MenuIcons.heart}
              iconColor={IconColors.red}
              label="Избранное"
              value={String(stats.favorites)}
              chevron
              onClick={() => go('/library/favorites')}
            />
            <IosRow
              icon={MenuIcons.note}
              iconColor={IconColors.orange}
              label="Заметки"
              value={String(notesCount)}
              chevron
              onClick={() => go('/notes')}
            />
            <IosRow
              icon={MenuIcons.history}
              iconColor={IconColors.blue}
              label="История просмотров"
              value={`${stats.days} ${plural(stats.days, 'день', 'дня', 'дней')}`}
              chevron
              onClick={() => go('/history')}
            />
            <IosRow
              icon={RowIcons.sparkles}
              iconColor={IconColors.purple}
              label="Итоги года"
              value={String(new Date().getFullYear())}
              chevron
              onClick={() => go('/wrapped')}
            />
            <IosRow
              icon={RowIcons.calendar}
              iconColor={IconColors.green}
              label="Календарь"
              chevron
              onClick={() => go('/calendar')}
            />
            <IosRow icon={MenuIcons.gear} iconColor={IconColors.gray} label="Настройки" chevron onClick={() => go('/settings')} />
          </IosSection>
        </div>
      </BottomSheet>

      <BottomSheet open={achOpen && !!selectedAch} onClose={() => setAchOpen(false)} label={selectedAch?.title ?? 'Достижение'}>
        {selectedAch && <AchievementDetail a={selectedAch} />}
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

type KindMode = 'completed' | 'planned';
const KIND_MODES: { id: KindMode; label: string }[] = [
  { id: 'completed', label: 'Посмотрел' },
  { id: 'planned', label: 'Буду смотреть' },
];

function KindSection({ kind, title, items }: { kind: LibraryKind; title: string; items: SavedDrama[] }) {
  const [mode, setMode] = useState<KindMode>('completed');
  const uid = useId();
  const mine = useMemo(() => items.filter((s) => kindOf(s) === kind), [items, kind]);
  const completed = mine.filter((s) => s.status === 'completed');
  const planned = mine.filter((s) => s.status === 'planned');
  const counts: Record<KindMode, number> = { completed: completed.length, planned: planned.length };
  const list = (mode === 'completed' ? completed : planned).sort((a, b) => b.updatedAt - a.updatedAt);

  const emptyText = kind === 'movie' ? 'Нет фильмов' : kind === 'series' ? 'Нет сериалов' : 'Нет дорам';
  const tabId = (m: KindMode) => `${uid}-tab-${m}`;
  const panelId = `${uid}-panel`;

  // Стрелки влево/вправо переключают вкладки, как у системного сегмент-контрола.
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: KindMode = mode === 'completed' ? 'planned' : 'completed';
    setMode(next);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <section className="pblock">
      <button className="pblock-head pblock-link" onClick={() => navigate(`/library/${kind}`)} aria-label={`${title}: открыть все`}>
        <h2>{title}</h2>
        <ChevronIcon />
      </button>
      <div className="segmented segmented-wide" role="tablist" aria-label={title}>
        {KIND_MODES.map((m) => (
          <button
            key={m.id}
            id={tabId(m.id)}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            aria-controls={panelId}
            tabIndex={mode === m.id ? 0 : -1}
            data-active={mode === m.id}
            onClick={() => setMode(m.id)}
            onKeyDown={onTabKey}
          >
            <span className="seg-num">{counts[m.id]}</span>
            <span className="seg-label">{m.label}</span>
          </button>
        ))}
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(mode)}>
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
                <Poster path={s.posterPath} alt={s.title} size="w342" className="strip-poster" />
                <span className="strip-title">{s.title}</span>
              </button>
            ))}
            {list.length > 12 && (
              <button
                className="strip-item strip-more"
                onClick={() => navigate(`/library/${kind}`)}
                aria-label={`Все: ещё ${list.length - 12}`}
              >
                <span className="strip-poster strip-more-box">+{list.length - 12}</span>
                <span className="strip-title">Все</span>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function achStatus(a: Achievement): string {
  return a.unlocked ? 'Получено' : `${a.current} / ${a.goal}`;
}

function AchievementCard({ a, onOpen }: { a: Achievement; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="ach"
      data-unlocked={a.unlocked}
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${a.title}. ${a.unlocked ? 'Получено' : `Прогресс ${a.current} из ${a.goal}`}`}
    >
      <div className="ach-art" aria-hidden>
        <div className="ach-wave" style={{ height: `${Math.max(12, Math.round(a.progress * 100))}%` }} />
      </div>
      <div className="ach-title">{a.title}</div>
      <div className="ach-sub muted small">{achStatus(a)}</div>
    </button>
  );
}

function AchievementDetail({ a }: { a: Achievement }) {
  const pct = Math.round(a.progress * 100);
  return (
    <div className="ach-detail">
      <div className="ach" data-unlocked={a.unlocked} aria-hidden>
        <div className="ach-art">
          <div className="ach-wave" style={{ height: `${Math.max(12, pct)}%` }} />
          {a.unlocked ? <MedalIcon /> : <LockIcon />}
        </div>
      </div>
      <h2 className="ach-detail-title">{a.title}</h2>
      <p className="ach-detail-desc">{a.description}</p>
      {a.unlocked ? (
        <div className="ach-detail-done">
          <CheckIcon />
          Получено
        </div>
      ) : (
        <div className="prog-row">
          <div className="prog-head">
            <span>Прогресс</span>
            <span>{pct}%</span>
          </div>
          <div
            className="prog-bar"
            role="progressbar"
            aria-label="Прогресс достижения"
            aria-valuemin={0}
            aria-valuemax={a.goal}
            aria-valuenow={Math.min(a.current, a.goal)}
          >
            <div className="prog-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="prog-sub">
            {Math.min(a.current, a.goal)} из {a.goal}. Осталось {a.goal - Math.min(a.current, a.goal)}
          </div>
        </div>
      )}
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

function ChevronIcon() {
  return (
    <svg className="pblock-chevron" viewBox="0 0 9 16" fill="none" aria-hidden>
      <path d="M1.5 1.5L7.5 8l-6 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* Однотонные белые иконки на цветном квадрате (как RowIcons в IosList). */
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const MenuIcons = {
  heart: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 20.3s-7.8-4.7-7.8-10.6A4.4 4.4 0 0 1 12 6.9a4.4 4.4 0 0 1 7.8 2.8c0 5.9-7.8 10.6-7.8 10.6z"
        fill="currentColor"
      />
    </svg>
  ),
  note: (
    <svg viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M6 3.5h8.5L19 8v12.5H6z" />
      <path d="M14 3.5V8h5M9 12.5h6.5M9 16h4.5" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M3.8 12a8.2 8.2 0 1 0 2.4-5.8" />
      <path d="M3.5 3.8v4h4" />
      <path d="M12 8v4.3l2.9 1.8" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" aria-hidden {...stroke} strokeWidth={1.7}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

function MedalIcon() {
  return (
    <svg className="ach-detail-icon" viewBox="0 0 24 24" aria-hidden {...stroke} strokeWidth={1.6}>
      <path d="M8 3h8l-1.5 5h-5z" />
      <circle cx="12" cy="14.5" r="6" />
      <path d="M12 11.6l.9 1.9 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="ach-detail-icon" viewBox="0 0 24 24" aria-hidden {...stroke} strokeWidth={1.6}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...stroke} strokeWidth={2.2}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
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
