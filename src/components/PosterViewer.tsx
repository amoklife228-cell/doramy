import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './PosterViewer.css';

const IMG = 'https://image.tmdb.org/t/p/';
const ZOOM = 2.5;
/** Насколько смахнуть вниз, чтобы закрыть. */
const CLOSE_DRAG = 110;

/**
 * Постер во весь экран: сразу показывает уже загруженный w500, поверх подгружает оригинал.
 * Двойное нажатие — увеличить в точке касания (дальше двигать пальцем), ещё раз — обратно.
 * Закрыть: ✕, нажатие на фон, смахивание вниз, Escape.
 */
export function PosterViewer({ path, title, onClose }: { path: string; title: string; onClose: () => void }) {
  const [hiRes, setHiRes] = useState(false);
  const [zoom, setZoom] = useState<{ width: number; focusX: number; focusY: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const [closing, setClosing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const lastTap = useRef(0);
  const touch = useRef<{ y: number; x: number; active: boolean; moved: boolean } | null>(null);

  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 180);
  };

  // Escape закрывает только просмотр, а не карточку под ним (у карточки свой обработчик на window).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    closeBtn.current?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // После увеличения прокручиваем так, чтобы точка касания осталась под пальцем (по центру).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !zoom || !img.current) return;
    const w = img.current.offsetWidth;
    const h = img.current.offsetHeight;
    el.scrollLeft = zoom.focusX * w - el.clientWidth / 2;
    el.scrollTop = zoom.focusY * h - el.clientHeight / 2;
  }, [zoom]);

  const toggleZoom = (clientX: number, clientY: number) => {
    const el = img.current;
    if (!el) return;
    if (zoom) return setZoom(null);
    const r = el.getBoundingClientRect();
    const focusX = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const focusY = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    setZoom({ width: r.width * ZOOM, focusX, focusY });
  };

  const onImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      toggleZoom(e.clientX, e.clientY);
    } else {
      lastTap.current = now;
    }
  };

  // Смахивание вниз (только без увеличения: увеличенный постер двигается прокруткой).
  const onTouchStart = (e: React.TouchEvent) => {
    if (zoom || e.touches.length !== 1) return;
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, active: false, moved: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = touch.current;
    if (!t || zoom) return;
    const dy = e.touches[0].clientY - t.y;
    const dx = e.touches[0].clientX - t.x;
    if (!t.active) {
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      t.moved = true;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
        touch.current = null;
        return;
      }
      t.active = true;
    }
    setDrag(Math.max(0, dy));
  };
  const onTouchEnd = () => {
    const t = touch.current;
    touch.current = null;
    if (!t?.active) return;
    if (drag > CLOSE_DRAG) close();
    else setDrag(0);
  };

  const fade = Math.max(0, 1 - drag / 400);

  return createPortal(
    <div
      className="pv-root"
      data-closing={closing}
      role="dialog"
      aria-modal="true"
      aria-label={`Постер: ${title}`}
      style={{ backgroundColor: `rgba(0, 0, 0, ${0.94 * fade})` }}
      onClick={close}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div ref={scroller} className="pv-scroll" data-zoomed={!!zoom}>
        <div
          className="pv-stage"
          style={drag ? { transform: `translateY(${drag}px) scale(${1 - drag / 2000})`, transition: 'none' } : undefined}
        >
          <div className="pv-frame" style={zoom ? { width: zoom.width } : undefined}>
            <img
              ref={img}
              className="pv-img"
              src={`${IMG}w500${path}`}
              alt={title}
              draggable={false}
              onClick={onImageClick}
            />
            <img
              className="pv-img pv-hires"
              src={`${IMG}original${path}`}
              alt=""
              aria-hidden="true"
              draggable={false}
              data-loaded={hiRes}
              onLoad={() => setHiRes(true)}
              onClick={onImageClick}
            />
          </div>
        </div>
      </div>
      <button
        ref={closeBtn}
        type="button"
        className="pv-close"
        aria-label="Закрыть"
        style={{ opacity: fade }}
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
      >
        ✕
      </button>
      {!zoom && drag === 0 && <div className="pv-hint">Двойное нажатие — увеличить</div>}
    </div>,
    document.body,
  );
}
