/**
 * Пользовательские поправки внешнего вида. Хранятся в localStorage на устройстве
 * (не синхронизируются: на разных телефонах нужны разные значения).
 */
export type Appearance = {
  /** Сдвиг нижней панели и отступов снизу, px. Плюс поднимает панель, минус опускает. */
  bottomOffset: number;
  /** Расстояние между панелью вкладок и краем экрана, px. */
  tabbarGap: number;
};

export const DEFAULT_APPEARANCE: Appearance = { bottomOffset: 0, tabbarGap: 10 };
export const BOTTOM_OFFSET_RANGE = { min: -40, max: 60, step: 2 };
export const TABBAR_GAP_RANGE = { min: 0, max: 24, step: 2 };

const KEY = 'doramy:appearance';

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return {
      bottomOffset: clamp(parsed.bottomOffset, BOTTOM_OFFSET_RANGE.min, BOTTOM_OFFSET_RANGE.max, 0),
      tabbarGap: clamp(parsed.tabbarGap, TABBAR_GAP_RANGE.min, TABBAR_GAP_RANGE.max, DEFAULT_APPEARANCE.tabbarGap),
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(a: Appearance): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* приватный режим: просто не сохраняем */
  }
}

/** Применяет поправки через CSS-переменные на <html>; стили читают их в calc(). */
export function applyAppearance(a: Appearance): void {
  const root = document.documentElement.style;
  root.setProperty('--user-bottom', `${a.bottomOffset}px`);
  root.setProperty('--tabbar-gap', `${a.tabbarGap}px`);
}

export function isDefaultAppearance(a: Appearance): boolean {
  return a.bottomOffset === DEFAULT_APPEARANCE.bottomOffset && a.tabbarGap === DEFAULT_APPEARANCE.tabbarGap;
}
