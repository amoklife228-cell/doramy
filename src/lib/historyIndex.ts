/**
 * Номер текущей записи в истории браузера. Нужен, чтобы отличить «Назад» от перехода вперёд:
 * страница актёра остаётся под открытой с неё карточкой, но снимается, когда с неё ушли назад.
 * Новая запись (location.hash = …) приходит без state — помечаем её номером «предыдущая + 1»;
 * при возврате state уже есть, и номер берётся из него.
 */

let last = 0;

export function historyIndex(): number {
  const state = (history.state ?? null) as Record<string, unknown> | null;
  const stamped = state?.doramyIdx;
  if (typeof stamped === 'number') {
    last = stamped;
    return stamped;
  }
  const idx = last + 1;
  try {
    history.replaceState({ ...(state ?? {}), doramyIdx: idx }, '');
  } catch {
    // некоторые встроенные браузеры запрещают replaceState: живём без номеров
  }
  last = idx;
  return idx;
}
