import { kindOf, todayKey, type ActivityDay, type LibraryKind, type SavedDrama } from './types';

export interface ProfileStats {
  units: number; // серий + фильмов
  minutes: number;
  hours: number;
  days: number; // дней с активностью
  completed: number; // записей со статусом «Просмотрено»
  byKind: Record<LibraryKind, { completed: number; planned: number; total: number }>;
  favorites: number;
  rated: number;
  streak: number; // дней подряд, заканчивая сегодня или вчера
}

export function computeStats(items: SavedDrama[], activity: ActivityDay[]): ProfileStats {
  const byKind: ProfileStats['byKind'] = {
    dorama: { completed: 0, planned: 0, total: 0 },
    series: { completed: 0, planned: 0, total: 0 },
    movie: { completed: 0, planned: 0, total: 0 },
  };
  let completed = 0;
  let favorites = 0;
  let rated = 0;
  for (const s of items) {
    const k = byKind[kindOf(s)];
    k.total += 1;
    if (s.status === 'completed') {
      k.completed += 1;
      completed += 1;
    }
    if (s.status === 'planned') k.planned += 1;
    if (s.isFavorite) favorites += 1;
    if (s.userRating !== null) rated += 1;
  }

  const units = activity.reduce((a, d) => a + d.units, 0);
  const minutes = activity.reduce((a, d) => a + d.minutes, 0);
  const activeDays = new Set(activity.filter((d) => d.units > 0).map((d) => d.day));

  // Серия подряд: считаем назад от сегодня (или от вчера, если сегодня ещё ничего не смотрели).
  let streak = 0;
  const cursor = new Date();
  if (!activeDays.has(todayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (activeDays.has(todayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    units,
    minutes,
    hours: Math.floor(minutes / 60),
    days: activeDays.size,
    completed,
    byKind,
    favorites,
    rated,
    streak,
  };
}

/* ---------- календарь активности ---------- */

export interface HeatCell {
  day: string;
  units: number;
  level: 0 | 1 | 2 | 3 | 4;
  isFuture: boolean;
}

export interface HeatWeek {
  cells: HeatCell[]; // 7 ячеек, понедельник — первая
  monthLabel: string | null; // подпись, если в этой неделе начинается месяц
}

const MONTHS = ['янв.', 'фев.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];

/** Последние `weeks` недель, по столбцу на неделю, как на GitHub. */
export function buildHeatmap(activity: ActivityDay[], weeks = 26): HeatWeek[] {
  const byDay = new Map(activity.map((d) => [d.day, d.units]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = todayKey(today);

  // Начало: понедельник недели, отстоящей на (weeks - 1) назад.
  const start = new Date(today);
  const dow = (start.getDay() + 6) % 7; // 0 = понедельник
  start.setDate(start.getDate() - dow - (weeks - 1) * 7);

  const max = Math.max(1, ...activity.map((d) => d.units));
  const level = (units: number): HeatCell['level'] => {
    if (units <= 0) return 0;
    const r = units / max;
    if (r <= 0.25) return 1;
    if (r <= 0.5) return 2;
    if (r <= 0.75) return 3;
    return 4;
  };

  const result: HeatWeek[] = [];
  const cursor = new Date(start);
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const cells: HeatCell[] = [];
    let monthLabel: string | null = null;
    for (let i = 0; i < 7; i++) {
      const key = todayKey(cursor);
      const units = byDay.get(key) ?? 0;
      const isFuture = key > todayStr;
      cells.push({ day: key, units: isFuture ? 0 : units, level: isFuture ? 0 : level(units), isFuture });
      if (cursor.getDate() <= 7 && cursor.getMonth() !== lastMonth && i === 0) {
        monthLabel = MONTHS[cursor.getMonth()];
        lastMonth = cursor.getMonth();
      } else if (i === 0 && cursor.getMonth() !== lastMonth && cursor.getDate() <= 7) {
        lastMonth = cursor.getMonth();
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    // Месяц начинается внутри недели — подписываем столбец, если ещё не подписали этот месяц.
    if (!monthLabel) {
      const firstOfMonth = cells.find((c) => c.day.endsWith('-01'));
      if (firstOfMonth) {
        const m = Number(firstOfMonth.day.slice(5, 7)) - 1;
        if (m !== lastMonth) {
          monthLabel = MONTHS[m];
          lastMonth = m;
        }
      }
    }
    result.push({ cells, monthLabel });
  }
  return result;
}

/* ---------- достижения ---------- */

export interface Achievement {
  id: string;
  title: string;
  description: string;
  progress: number; // 0..1
  unlocked: boolean;
  current: number;
  goal: number;
}

export function computeAchievements(stats: ProfileStats): Achievement[] {
  const def = (id: string, title: string, description: string, current: number, goal: number): Achievement => ({
    id,
    title,
    description,
    current,
    goal,
    progress: Math.min(1, current / goal),
    unlocked: current >= goal,
  });
  return [
    def('first', 'Первая серия', 'Посмотреть первую серию', stats.units, 1),
    def('ep10', 'Разогрев', '10 серий', stats.units, 10),
    def('ep100', 'Марафонец', '100 серий', stats.units, 100),
    def('ep500', 'Легенда', '500 серий', stats.units, 500),
    def('done1', 'Финал', 'Досмотреть первый сериал или фильм', stats.completed, 1),
    def('done10', 'Коллекционер', 'Досмотреть 10', stats.completed, 10),
    def('h24', 'Сутки в дорамах', '24 часа просмотра', stats.hours, 24),
    def('h100', 'Сто часов', '100 часов просмотра', stats.hours, 100),
    def('streak7', 'Неделя подряд', '7 дней без пропусков', stats.streak, 7),
    def('movie1', 'Киноман', 'Посмотреть первый фильм', stats.byKind.movie.completed, 1),
    def('fav5', 'Любимчики', '5 записей в избранном', stats.favorites, 5),
    def('rated10', 'Критик', 'Оценить 10 записей', stats.rated, 10),
  ];
}
