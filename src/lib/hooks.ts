import { useEffect, useRef, useState } from 'react';
import { CONFIG_EVENT, isConfigured } from './tmdb';

/** true, когда ключ TMDB сохранён; обновляется при изменении в настройках. */
export function useConfigured(): boolean {
  const [configured, setConfigured] = useState(isConfigured);
  useEffect(() => {
    const onChange = () => setConfigured(isConfigured());
    window.addEventListener(CONFIG_EVENT, onChange);
    return () => window.removeEventListener(CONFIG_EVENT, onChange);
  }, []);
  return configured;
}

/** Возвращает ref для элемента-сторожа: когда он виден, вызывает onVisible. */
export function useInfiniteScroll(onVisible: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onVisible);
  callback.current = onVisible;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    // root — ближайший прокручиваемый .content, чтобы запас в 400px работал внутри прокрутки.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) callback.current();
      },
      { root: el.closest('.content'), rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);

  return ref;
}

export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
