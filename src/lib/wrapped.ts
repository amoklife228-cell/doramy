import { countryLabel, minutesPerUnit, todayKey, type ActivityDay, type SavedDrama } from './types';

/**
 * «Итоги года»: всё считается локально из таблицы активности (дни) и записей библиотеки,
 * добавленных или изменённых в этом году. Активность не знает, какой сериал смотрели в какой день,
 * поэтому жанры, страны и топ взвешиваются прогрессом самих записей.
 */

export interface WrappedTitle {
  item: SavedDrama;
  /** Серий (фильм = 1), которые засчитываем записи в этом году. */
  units: number;
  minutes: number;
}

export interface WrappedShare {
  label: string;
  units: number;
  /** Доля от всего просмотренного за год, 0..1. */
  share: number;
  items: SavedDrama[];
}

export interface WrappedData {
  year: number;
  hasData: boolean;
  minutes: number;
  hours: number;
  /** Серии и фильмы вместе (как units в активности). */
  units: number;
  episodes: number;
  movies: number;
  /** Записи года, больше всего серий — первыми. */
  titles: WrappedTitle[];
  genres: WrappedShare[];
  countries: WrappedShare[];
  activeDays: number;
  longestStreak: { length: number; start: string; end: string } | null;
  busiestDay: { day: string; units: number; minutes: number } | null;
  top: WrappedTitle[];
  /** 12 месяцев: серии и минуты. */
  months: { units: number; minutes: number }[];
  peakMonth: number;
}

function yearOfTs(ts: number): number {
  return new Date(ts).getFullYear();
}

function unitsOf(s: SavedDrama): number {
  if (s.mediaType === 'movie') return s.status === 'completed' ? 1 : 0;
  return Math.max(0, s.episodesWatched);
}

/** Записи, которые «смотрели в этом году»: есть прогресс и запись добавлена или менялась в этом году. */
export function titlesOfYear(items: SavedDrama[], year: number): WrappedTitle[] {
  return items
    .filter((s) => yearOfTs(s.addedAt) === year || yearOfTs(s.updatedAt) === year)
    .map((item) => {
      const units = unitsOf(item);
      return { item, units, minutes: units * minutesPerUnit(item) };
    })
    .filter((t) => t.units > 0)
    .sort((a, b) => b.units - a.units || b.item.updatedAt - a.item.updatedAt);
}

function shares(titles: WrappedTitle[], total: number, labelsOf: (s: SavedDrama) => string[]): WrappedShare[] {
  const map = new Map<string, WrappedShare>();
  for (const t of titles) {
    for (const label of labelsOf(t.item)) {
      if (!label) continue;
      const row = map.get(label) ?? { label, units: 0, share: 0, items: [] };
      row.units += t.units;
      row.items.push(t.item);
      map.set(label, row);
    }
  }
  return [...map.values()]
    .map((r) => ({ ...r, share: total > 0 ? Math.min(1, r.units / total) : 0 }))
    .sort((a, b) => b.units - a.units || b.items.length - a.items.length);
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function nextDay(day: string): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + 1);
  return todayKey(d);
}

export function computeWrapped(items: SavedDrama[], activity: ActivityDay[], year: number): WrappedData {
  const prefix = `${year}-`;
  const days = activity.filter((d) => d.day.startsWith(prefix) && d.units > 0).sort((a, b) => a.day.localeCompare(b.day));

  const actUnits = days.reduce((a, d) => a + d.units, 0);
  const actMinutes = days.reduce((a, d) => a + d.minutes, 0);

  const titles = titlesOfYear(items, year);
  const titleUnits = titles.reduce((a, t) => a + t.units, 0);
  const movies = titles.filter((t) => t.item.mediaType === 'movie').length;

  // Нет активности (например, библиотека импортирована) — оцениваем по прогрессу записей.
  const minutes = actMinutes > 0 ? actMinutes : titles.reduce((a, t) => a + t.minutes, 0);
  const units = actUnits > 0 ? actUnits : titleUnits;
  const episodes = actUnits > 0 ? Math.max(0, actUnits - movies) : titleUnits - movies;

  const genres = shares(titles, titleUnits, (s) => s.genreNames ?? []);
  const countries = shares(titles, titleUnits, (s) => [countryLabel(s.originCountries)]);

  // Самая длинная серия дней подряд внутри года.
  let longestStreak: WrappedData['longestStreak'] = null;
  let runStart = '';
  let runLen = 0;
  let prev = '';
  for (const d of days) {
    if (prev && nextDay(prev) === d.day) runLen += 1;
    else {
      runStart = d.day;
      runLen = 1;
    }
    if (!longestStreak || runLen > longestStreak.length) longestStreak = { length: runLen, start: runStart, end: d.day };
    prev = d.day;
  }

  let busiestDay: WrappedData['busiestDay'] = null;
  for (const d of days) {
    if (!busiestDay || d.units > busiestDay.units || (d.units === busiestDay.units && d.minutes > busiestDay.minutes)) {
      busiestDay = { day: d.day, units: d.units, minutes: d.minutes };
    }
  }

  const months = Array.from({ length: 12 }, () => ({ units: 0, minutes: 0 }));
  for (const d of days) {
    const m = Number(d.day.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) {
      months[m].units += d.units;
      months[m].minutes += d.minutes;
    }
  }
  let peakMonth = 0;
  months.forEach((m, i) => {
    if (m.units > months[peakMonth].units) peakMonth = i;
  });

  // Топ: сначала высокие оценки, без оценки — как нейтральные 6, при равенстве — больше серий.
  const top = titles
    .slice()
    .sort((a, b) => (b.item.userRating ?? 6) - (a.item.userRating ?? 6) || b.units - a.units)
    .slice(0, 5);

  return {
    year,
    hasData: units > 0 || titles.length > 0,
    minutes,
    hours: Math.floor(minutes / 60),
    units,
    episodes,
    movies,
    titles,
    genres,
    countries,
    activeDays: days.length,
    longestStreak,
    busiestDay,
    top,
    months,
    peakMonth,
  };
}

/** Годы, за которые есть активность или записи с прогрессом: новые первыми. */
export function yearsWithData(items: SavedDrama[], activity: ActivityDay[]): number[] {
  const set = new Set<number>();
  for (const d of activity) if (d.units > 0) set.add(Number(d.day.slice(0, 4)));
  for (const s of items) {
    if (unitsOf(s) > 0) {
      set.add(yearOfTs(s.updatedAt));
      set.add(yearOfTs(s.addedAt));
    }
  }
  return [...set].filter((y) => Number.isFinite(y) && y > 1990).sort((a, b) => b - a);
}

/** Год для баннера в профиле: текущий, а в январе — прошлый, если в текущем ещё пусто. */
export function bannerYear(activity: ActivityDay[], now = new Date()): number | null {
  const y = now.getFullYear();
  const active = (year: number) => activity.some((d) => d.units > 0 && d.day.startsWith(`${year}-`));
  if (active(y)) return y;
  if (now.getMonth() === 0 && active(y - 1)) return y - 1;
  return null;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = Math.abs(n) % 10;
  const m100 = Math.abs(n) % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** «14 февраля» */
export function dayLabel(day: string): string {
  const d = parseDay(day);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

/** «с 3 по 11 марта», «с 28 марта по 2 апреля» */
export function rangeLabel(start: string, end: string): string {
  if (start === end) return dayLabel(start);
  const a = parseDay(start);
  const b = parseDay(end);
  if (a.getMonth() === b.getMonth()) return `с ${a.getDate()} по ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
  return `с ${dayLabel(start)} по ${dayLabel(end)}`;
}

/** Текст для «Поделиться». */
export function shareText(w: WrappedData, actorName?: string | null): string {
  const lines: string[] = [];
  const parts = [`${w.hours} ${plural(w.hours, 'час', 'часа', 'часов')}`];
  if (w.episodes > 0) parts.push(`${w.episodes} ${plural(w.episodes, 'серия', 'серии', 'серий')}`);
  if (w.movies > 0) parts.push(`${w.movies} ${plural(w.movies, 'фильм', 'фильма', 'фильмов')}`);
  lines.push(`Мой ${w.year} в дорамах: ${parts.join(', ')}.`);
  const facts: string[] = [];
  if (w.genres[0]) facts.push(`любимый жанр — ${w.genres[0].label.toLowerCase()}`);
  if (w.countries[0]) facts.push(`страна года — ${w.countries[0].label} (${Math.round(w.countries[0].share * 100)}%)`);
  if (actorName) facts.push(`актёр года — ${actorName}`);
  if (facts.length) lines.push(facts[0][0].toUpperCase() + facts.join(', ').slice(1) + '.');
  if (w.top.length) lines.push(`Топ года: ${w.top.map((t, i) => `${i + 1}. ${t.item.title}`).join(', ')}.`);
  if (w.longestStreak && w.longestStreak.length > 1) {
    lines.push(`Рекорд — ${w.longestStreak.length} ${plural(w.longestStreak.length, 'день', 'дня', 'дней')} подряд.`);
  }
  lines.push('Итоги года в приложении «Дорамы»');
  return lines.join('\n');
}
