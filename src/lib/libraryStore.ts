import { liveQuery } from 'dexie';
import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from 'react';
import { db } from './db';
import type { ActivityDay, SavedDrama } from './types';

/**
 * Видна ли вкладка, в которой рисуется компонент. Вкладки смонтированы все сразу (чтобы хранить
 * прокрутку), и раньше каждое изменение базы перерисовывало все четыре. Скрытая вкладка теперь
 * держит последние показанные данные и обновляется, когда её открывают. Вне вкладок (оверлеи) — true.
 */
export const ScreenActiveContext = createContext(true);

interface LiveStore<T> {
  subscribe: (fn: () => void) => () => void;
  get: () => T | undefined;
}

/**
 * Один запрос к базе на всё приложение вместо отдельного useLiveQuery в каждом экране:
 * изменение записи читает таблицу один раз, и все экраны получают один и тот же массив.
 * Подписка на Dexie живёт всё время работы приложения: оверлеи часто открываются и закрываются.
 */
function liveStore<T>(query: () => Promise<T>): LiveStore<T> {
  let value: T | undefined;
  let started = false;
  const listeners = new Set<() => void>();
  return {
    subscribe(fn) {
      listeners.add(fn);
      if (!started) {
        started = true;
        liveQuery(query).subscribe({
          next: (v) => {
            value = v;
            for (const l of [...listeners]) l();
          },
          error: (e) => console.error('[library]', e),
        });
      }
      return () => {
        listeners.delete(fn);
      };
    },
    get: () => value,
  };
}

const itemsStore = liveStore<SavedDrama[]>(() => db.items.toArray());
const activityStore = liveStore<ActivityDay[]>(() => db.activity.toArray());

function useLive<T>(store: LiveStore<T>): T | undefined {
  const active = useContext(ScreenActiveContext);
  const shown = useRef<T | undefined>(undefined);
  const getSnapshot = useCallback(() => {
    const v = store.get();
    // Скрытая вкладка отдаёт то, что показывала, и React её не трогает.
    if (active || shown.current === undefined) shown.current = v;
    return shown.current;
  }, [active, store]);
  return useSyncExternalStore(store.subscribe, getSnapshot);
}

/** Пустой список-заглушка, один и тот же: `?? []` в каждом рендере ломал бы useMemo. */
export const NOTHING: never[] = [];

/** Вся библиотека; undefined — база ещё не ответила. */
export function useLibraryItems(): SavedDrama[] | undefined {
  return useLive(itemsStore);
}

/** Активность по дням; undefined — база ещё не ответила. */
export function useActivityDays(): ActivityDay[] | undefined {
  return useLive(activityStore);
}
