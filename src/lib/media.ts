import { useEffect, useState } from 'react';

/** Ширина, с которой включается раскладка для компьютера (боковое меню, две колонки в карточке). */
export const DESKTOP_QUERY = '(min-width: 1024px)';

function matches(query: string): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
}

/** true, пока выполняется медиазапрос; обновляется при изменении размера окна. */
export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return;
    const onChange = () => setValue(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return value;
}

export function useDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}
