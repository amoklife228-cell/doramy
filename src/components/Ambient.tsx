import { useEffect, useRef, useState } from 'react';

/** Через сколько пикселей прокрутки свечение полностью гаснет. */
const FADE_DISTANCE = 700;

/**
 * Цветное «свечение» за верхом страницы на компьютере: сильно размытый кадр (backdrop) с низкой
 * непрозрачностью. При смене кадра новый слой плавно проявляется поверх старого, а при прокрутке
 * страницы вниз свечение гаснет, чтобы не мутить фон под лентами.
 * На телефоне слой скрыт (desktop.css), а сам компонент рендерят только при useDesktop().
 */
export function Ambient({ path, tint }: { path: string | null | undefined; tint?: string }) {
  // Последние два кадра: старый остаётся под новым, пока тот проявляется.
  const [layers, setLayers] = useState<string[]>(() => (path ? [path] : []));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!path) return;
    setLayers((prev) => (prev[prev.length - 1] === path ? prev : [...prev.filter((p) => p !== path), path].slice(-2)));
  }, [path]);

  // Прокручивается соседний .content того же экрана или оверлея.
  useEffect(() => {
    const el = ref.current;
    const scroller = el?.parentElement?.querySelector<HTMLElement>(':scope > .content');
    if (!el || !scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      el.style.opacity = String(Math.max(0, 1 - scroller.scrollTop / FADE_DISTANCE));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="ambient"
      aria-hidden="true"
      style={tint ? ({ '--ambient-tint': tint } as React.CSSProperties) : undefined}
    >
      {layers.map((p) => (
        <img key={p} className="ambient-img" src={`https://image.tmdb.org/t/p/w300${p}`} alt="" decoding="async" draggable={false} />
      ))}
    </div>
  );
}
