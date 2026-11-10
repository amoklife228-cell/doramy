import { useEffect, useRef, useState, type RefObject } from 'react';

const THRESHOLD = 72;

/**
 * Обновление потягиванием вниз для прокручиваемого контейнера.
 * Внутренние скролл-контейнеры не получают системный pull-to-refresh, поэтому свой.
 */
export function usePullToRefresh(ref: RefObject<HTMLElement>, onRefresh: () => Promise<unknown> | unknown) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const handler = useRef(onRefresh);
  handler.current = onRefresh;
  const pullRef = useRef(0);
  pullRef.current = pull;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let active = false;

    const onStart = (e: TouchEvent) => {
      if (el.scrollTop <= 0 && !refreshing) {
        startY.current = e.touches[0].clientY;
        active = true;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!active || startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || el.scrollTop > 0) {
        setPull(0);
        return;
      }
      // Сопротивление: чем дальше тянем, тем медленнее растёт.
      setPull(Math.min(120, dy * 0.55));
      if (dy > 10 && e.cancelable) e.preventDefault();
    };
    const onEnd = async () => {
      if (!active) return;
      active = false;
      startY.current = null;
      if (pullRef.current >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD * 0.7);
        try {
          await handler.current();
        } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, refreshing]);

  return { pull, refreshing, ready: pull >= THRESHOLD };
}
