import { detailsList, discoverAsia, trendingAsia, type Page } from './tmdb';
import { DRAMA_TV_TYPES, itemKey, NOT_DRAMA, type Drama, type MediaType } from './types';

/* Подборки главной каталога. Динамические собираются из TMDB, «Выбор редакции» и «Премии» — свои списки:
   готовых редакторских подборок и данных о наградах в TMDB нет. Награды сверены с Википедией
   (Baeksang Arts Award for Best Drama, списки лауреатов «Оскара», Канн, Венеции, Берлина, «Эмми»). */

export type CollectionId = 'new' | 'trending' | 'discussed' | 'editors' | 'top500' | 'awards';

export interface CuratedItem {
  id: number;
  note?: string;
}

export interface Collection {
  id: CollectionId;
  title: Record<MediaType, string>;
  subtitle: Record<MediaType, string>;
  /** Показывать место в рейтинге на карточке. */
  ranked?: boolean;
  /** Подпись под карточкой (награда) по ключу `${type}:${id}`. */
  notes?: Map<string, string>;
  fetchPage: (mediaType: MediaType, page: number, signal: AbortSignal) => Promise<Page<Drama>>;
}

function isoDay(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- свои списки ---------- */

const EDITORS: Record<MediaType, CuratedItem[]> = {
  tv: [
    { id: 64010 }, // Ответ в 1988
    { id: 76662 }, // Мой мистер
    { id: 94796 }, // Аварийная посадка любви
    { id: 96102 }, // Мудрая жизнь в больнице
    { id: 75820 }, // Мистер Саншайн
    { id: 197067 }, // Необычный адвокат У Ён У
    { id: 93097 }, // Когда цветёт камелия
    { id: 96571 }, // Переезд в рай
    { id: 74821 }, // Мудрая тюремная жизнь
    { id: 135897 }, // Наше любимое лето
    { id: 129888 }, // Двадцать пять, двадцать один
    { id: 70593 }, // Королевство
    { id: 126485 }, // Движение
    { id: 64197 }, // Список Ланъя
    { id: 47008 }, // Полуночная закусочная
    { id: 90761 }, // Неукротимый
    { id: 83639 }, // Девочка из ниоткуда
    { id: 200709 }, // Слабый герой
    { id: 205319 }, // Ежедневная доза солнца
    { id: 215720 }, // Королева слёз
    { id: 230923 }, // Прекрасный бегун
    { id: 67915 }, // Токкэби
    { id: 70626 }, // Тайный лес
  ],
  movie: [
    { id: 11423 }, // Воспоминания об убийстве
    { id: 290098 }, // Служанка
    { id: 491584 }, // Пылающий
    { id: 396535 }, // Поезд в Пусан
    { id: 293670 }, // Вопль
    { id: 437068 }, // Таксист
    { id: 843 }, // Любовное настроение
    { id: 372058 }, // Твоё имя
    { id: 838209 }, // Эксгумация
    { id: 30018 }, // Мать
    { id: 49797 }, // Я видел дьявола
    { id: 13855 }, // Преследователь
    { id: 387426 }, // Окча
    { id: 670 }, // Олдбой
    { id: 129 }, // Унесённые призраками
    { id: 505192 }, // Магазинные воришки
  ],
};

const AWARDS: Record<MediaType, CuratedItem[]> = {
  tv: [
    { id: 219246, note: 'Пэксан 2025 · лучшая драма' },
    { id: 126308, note: 'Эмми 2024 · лучший драматический сериал' },
    { id: 206693, note: 'Пэксан 2024 · лучшая драма' },
    { id: 136283, note: 'Пэксан 2023 · лучшая драма' },
    { id: 93405, note: 'Эмми 2022 · режиссура, главная мужская роль' },
    { id: 110534, note: 'Пэксан 2022 · лучшая драма' },
    { id: 116612, note: 'Пэксан 2021 · лучшая драма' },
    { id: 95484, note: 'Пэксан 2020 · лучшая драма' },
    { id: 76662, note: 'Пэксан 2019 · лучшая драма' },
    { id: 76092, note: 'Пэксан 2018 · лучшая драма' },
    { id: 66434, note: 'Пэксан 2017 · лучшая драма' },
    { id: 64840, note: 'Пэксан 2016 · лучшая драма' },
  ],
  movie: [
    { id: 508883, note: 'Оскар 2024 · анимационный фильм' },
    { id: 940721, note: 'Оскар 2024 · визуальные эффекты' },
    { id: 976893, note: 'Канны 2023 · лучший актёр' },
    { id: 1050035, note: 'Канны 2023 · лучший сценарий' },
    { id: 1156125, note: 'Венеция 2023 · Гран-при жюри' },
    { id: 705996, note: 'Канны 2022 · лучший режиссёр' },
    { id: 758866, note: 'Оскар 2022 · международный фильм' },
    { id: 615643, note: 'Оскар 2021 · женская роль второго плана' },
    { id: 496243, note: 'Оскар 2020 · лучший фильм; Золотая пальмовая ветвь' },
    { id: 505192, note: 'Канны 2018 · Золотая пальмовая ветвь' },
    { id: 123377, note: 'Венеция 2012 · Золотой лев' },
    { id: 38368, note: 'Канны 2010 · Золотая пальмовая ветвь' },
    { id: 47909, note: 'Канны 2010 · лучший сценарий' },
    { id: 16804, note: 'Оскар 2009 · фильм на иностранном языке' },
    { id: 670, note: 'Канны 2004 · Гран-при' },
    { id: 129, note: 'Оскар 2003 · анимационный фильм; Золотой медведь' },
    { id: 146, note: 'Оскар 2001 · фильм на иностранном языке' },
  ],
};

function notesOf(lists: Record<MediaType, CuratedItem[]>): Map<string, string> {
  const map = new Map<string, string>();
  for (const type of ['tv', 'movie'] as MediaType[]) {
    for (const it of lists[type]) if (it.note) map.set(itemKey(type, it.id), it.note);
  }
  return map;
}

async function curatedPage(
  list: CuratedItem[],
  mediaType: MediaType,
  signal: AbortSignal,
  shuffled: boolean,
): Promise<Page<Drama>> {
  const ids = (shuffled ? shuffle(list) : list).map((x) => x.id);
  const { items, partial } = await detailsList(mediaType, ids, signal);
  return { items, page: 1, totalPages: 1, partial };
}

/* ---------- подборки ---------- */

const TOP_MIN_VOTES: Record<MediaType, string> = { tv: '150', movie: '500' };

/** Без аниме, детского, новостей, реалити и ток-шоу (NOT_DRAMA в types.ts). */
const withoutNonDrama = (mediaType: MediaType): Record<string, string> => ({
  without_genres: NOT_DRAMA[mediaType].join(','),
  ...(mediaType === 'tv' ? { with_type: DRAMA_TV_TYPES } : {}),
});

export const COLLECTIONS: Record<CollectionId, Collection> = {
  new: {
    id: 'new',
    title: { tv: 'Новинки', movie: 'Новинки' },
    subtitle: { tv: 'Сериалы, вышедшие за последние три месяца', movie: 'Фильмы последних четырёх месяцев' },
    fetchPage: (mediaType, page, signal) =>
      discoverAsia(
        mediaType,
        mediaType === 'tv'
          ? { sort_by: 'popularity.desc', 'first_air_date.gte': isoDay(-90), 'first_air_date.lte': isoDay(0), ...withoutNonDrama(mediaType) }
          : { sort_by: 'popularity.desc', 'primary_release_date.gte': isoDay(-120), 'primary_release_date.lte': isoDay(0), ...withoutNonDrama(mediaType) },
        page,
        signal,
      ),
  },
  trending: {
    id: 'trending',
    title: { tv: 'Сериалы в тренде', movie: 'Фильмы в тренде' },
    subtitle: { tv: 'Самое популярное в мире за неделю', movie: 'Самое популярное в мире за неделю' },
    fetchPage: async (mediaType, page, signal) => {
      const r = await trendingAsia(mediaType, page, signal, NOT_DRAMA[mediaType]);
      // Неделя без азиатских хитов — показываем самое популярное за последний год.
      if (page === 1 && r.items.length < 6) {
        const extra = await discoverAsia(
          mediaType,
          mediaType === 'tv'
            ? { sort_by: 'popularity.desc', 'first_air_date.gte': isoDay(-365), ...withoutNonDrama(mediaType) }
            : { sort_by: 'popularity.desc', 'primary_release_date.gte': isoDay(-365), 'primary_release_date.lte': isoDay(0), ...withoutNonDrama(mediaType) },
          1,
          signal,
        );
        const have = new Set(r.items.map((d) => d.id));
        return {
          items: [...r.items, ...extra.items.filter((d) => !have.has(d.id))],
          page: 1,
          totalPages: 1,
          partial: r.partial,
        };
      }
      return r;
    },
  },
  discussed: {
    id: 'discussed',
    title: { tv: 'Сейчас обсуждают', movie: 'Сейчас обсуждают' },
    subtitle: { tv: 'Прямо сейчас выходят новые серии', movie: 'Недавние премьеры, о которых больше всего отзывов' },
    fetchPage: (mediaType, page, signal) =>
      discoverAsia(
        mediaType,
        mediaType === 'tv'
          ? { sort_by: 'popularity.desc', 'air_date.gte': isoDay(-7), 'air_date.lte': isoDay(7), 'vote_count.gte': '3', ...withoutNonDrama(mediaType) }
          : { sort_by: 'vote_count.desc', 'primary_release_date.gte': isoDay(-75), 'primary_release_date.lte': isoDay(0), ...withoutNonDrama(mediaType) },
        page,
        signal,
      ),
  },
  editors: {
    id: 'editors',
    title: { tv: 'Выбор редакции', movie: 'Выбор редакции' },
    subtitle: { tv: 'Азиатские сериалы, которые стоит увидеть', movie: 'Азиатские фильмы, которые стоит увидеть' },
    fetchPage: (mediaType, _page, signal) => curatedPage(EDITORS[mediaType], mediaType, signal, true),
  },
  top500: {
    id: 'top500',
    title: { tv: 'Сериалы из ТОП-500', movie: 'Фильмы из ТОП-500' },
    subtitle: { tv: 'Самые высокие оценки зрителей TMDB', movie: 'Самые высокие оценки зрителей TMDB' },
    ranked: true,
    fetchPage: async (mediaType, page, signal) => {
      const r = await discoverAsia(
        mediaType,
        { sort_by: 'vote_average.desc', 'vote_count.gte': TOP_MIN_VOTES[mediaType], ...withoutNonDrama(mediaType) },
        page,
        signal,
      );
      return { ...r, totalPages: Math.min(r.totalPages, 25) }; // 25 страниц по 20 = 500
    },
  },
  awards: {
    id: 'awards',
    title: { tv: 'Премии', movie: 'Премии' },
    subtitle: {
      tv: 'Лауреаты премий «Пэксан» и «Эмми»',
      movie: 'Лауреаты «Оскара», Каннского, Венецианского и Берлинского фестивалей',
    },
    notes: notesOf(AWARDS),
    fetchPage: (mediaType, _page, signal) => curatedPage(AWARDS[mediaType], mediaType, signal, false),
  },
};

/** Порядок на главной: до блока настроений и после него. */
export const HOME_TOP: CollectionId[] = ['new', 'trending', 'discussed'];
export const HOME_BOTTOM: CollectionId[] = ['editors', 'top500', 'awards'];

export function isCollectionId(s: string): s is CollectionId {
  return s in COLLECTIONS;
}
