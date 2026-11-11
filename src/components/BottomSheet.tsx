import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './BottomSheet.css';

/** Насколько надо стянуть шторку вниз, чтобы она закрылась. */
const CLOSE_DISTANCE = 100;
/** Скорость «смахивания» вниз (px/мс), при которой шторка закрывается и без 100 px. */
const FLICK_VELOCITY = 0.5;
/** Верхняя полоса шторки, за которую её можно тянуть. */
const GRAB_ZONE = 40;
const EXIT_MS = 300;
const EXIT_MS_REDUCED = 200;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

type DragMode = 'grab' | 'content';
type Drag = {
  mode: DragMode;
  startX: number;
  startY: number;
  lastY: number;
  lastT: number;
  velocity: number;
  active: boolean;
  dy: number;
};

/**
 * Шторка снизу в духе iOS: закрывается по фону, Escape, свайпом вниз за ручку (или за содержимое,
 * когда оно не прокручено). При закрытии уезжает вниз, а не исчезает сразу.
 * Рисуется порталом в body: экраны-вкладки имеют position: fixed и создают свой слой,
 * иначе панель вкладок перекрывала бы шторку.
 */
export function BottomSheet({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const mountedRef = useRef(mounted);
  mountedRef.current = mounted;

  // Открытие — сразу; закрытие — после анимации ухода.
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mountedRef.current) return;
    setClosing(true);
    const t = window.setTimeout(
      () => {
        setMounted(false);
        setClosing(false);
      },
      reducedMotion() ? EXIT_MS_REDUCED : EXIT_MS,
    );
    return () => window.clearTimeout(t);
  }, [open]);

  // Повторное открытие во время ухода: сбрасываем следы свайпа.
  useLayoutEffect(() => {
    if (!open) return;
    for (const el of [sheetRef.current, backdropRef.current]) {
      if (!el) continue;
      el.style.transform = '';
      el.style.transition = '';
      el.style.animation = '';
      el.style.opacity = '';
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Фокус внутрь шторки, после закрытия — обратно на то, что её открыло.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, [mounted]);

  // Свайп вниз.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!mounted || !sheet) return;
    let drag: Drag | null = null;
    let suppressClick = false;

    const modeAt = (target: EventTarget | null, clientY: number, mouse: boolean): DragMode | null => {
      const el = target instanceof Element ? target : null;
      if (el?.closest('.bs-grab')) return 'grab';
      // Прокрученное содержимое не перехватываем — пусть листается.
      if (sheet.scrollTop > 0) return null;
      const inTop = clientY - sheet.getBoundingClientRect().top <= GRAB_ZONE;
      if (mouse) return inTop ? 'grab' : null;
      if (el?.closest('input, textarea, select, [contenteditable="true"], [data-sheet-no-drag]')) return null;
      for (let n: Element | null = el; n && n !== sheet; n = n.parentElement) {
        if (n.scrollTop > 0) return null;
      }
      return inTop ? 'grab' : 'content';
    };

    const begin = (x: number, y: number, t: number, mode: DragMode) => {
      drag = { mode, startX: x, startY: y, lastY: y, lastT: t, velocity: 0, active: false, dy: 0 };
    };

    /** Возвращает true, если жест наш и прокрутку надо отменить. */
    const move = (x: number, y: number, t: number): boolean => {
      if (!drag) return false;
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      if (!drag.active) {
        if (drag.mode === 'content') {
          // Решаем по первым пикселям: вниз и больше по вертикали — тянем шторку, иначе отдаём прокрутке.
          if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return false;
          if (dy <= 0 || Math.abs(dx) > dy) {
            drag = null;
            return false;
          }
        } else if (Math.abs(dy) < 2 && Math.abs(dx) < 2) {
          return true;
        }
        drag.active = true;
        sheet.style.animation = 'none';
        sheet.style.transition = 'none';
        if (backdropRef.current) backdropRef.current.style.transition = 'none';
      }
      const dt = t - drag.lastT;
      if (dt > 0) drag.velocity = 0.7 * ((y - drag.lastY) / dt) + 0.3 * drag.velocity;
      drag.lastY = y;
      drag.lastT = t;
      // Вверх шторка почти не тянется — лёгкое сопротивление, как в iOS.
      drag.dy = dy >= 0 ? dy : -Math.min(12, Math.sqrt(-dy) * 1.5);
      sheet.style.transform = `translateY(${drag.dy}px)`;
      if (backdropRef.current) {
        const h = sheet.offsetHeight || 1;
        backdropRef.current.style.opacity = String(Math.max(0, 1 - Math.max(0, drag.dy) / h));
      }
      return true;
    };

    const end = (t: number, cancelled: boolean) => {
      const d = drag;
      drag = null;
      if (!d?.active) return;
      // Дрожание пальца на пару пикселей — всё ещё нажатие, а не свайп: клик не глушим.
      if (Math.abs(d.dy) > 6) {
        suppressClick = true;
        window.setTimeout(() => (suppressClick = false), 0);
      }
      const velocity = t - d.lastT > 100 ? 0 : d.velocity;
      const shouldClose = !cancelled && (d.dy > CLOSE_DISTANCE || (velocity > FLICK_VELOCITY && d.dy > 10));
      sheet.style.transition = '';
      const backdrop = backdropRef.current;
      if (backdrop) {
        backdrop.style.transition = '';
        backdrop.style.opacity = '';
      }
      if (shouldClose) {
        // Уезжает вниз с того места, где отпустили (при «меньше движения» — просто гаснет на месте).
        if (!reducedMotion()) sheet.style.transform = 'translateY(calc(100% + 24px))';
        onCloseRef.current();
      } else {
        sheet.style.transform = '';
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        if (drag?.active) end(e.timeStamp, true);
        drag = null;
        return;
      }
      const touch = e.touches[0];
      const mode = modeAt(e.target, touch.clientY, false);
      if (mode) begin(touch.clientX, touch.clientY, e.timeStamp, mode);
      else drag = null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!drag) return;
      const touch = e.touches[0];
      if (move(touch.clientX, touch.clientY, e.timeStamp) && e.cancelable) e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => end(e.timeStamp, false);
    const onTouchCancel = (e: TouchEvent) => end(e.timeStamp, true);

    // Мышь (для проверки на компьютере): только за ручку.
    const onPointerMove = (e: PointerEvent) => {
      move(e.clientX, e.clientY, e.timeStamp);
    };
    const onPointerUp = (e: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      end(e.timeStamp, e.type === 'pointercancel');
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (modeAt(e.target, e.clientY, true) !== 'grab') return;
      e.preventDefault();
      begin(e.clientX, e.clientY, e.timeStamp, 'grab');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    };
    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClick) return;
      e.stopPropagation();
      e.preventDefault();
    };

    sheet.addEventListener('touchstart', onTouchStart, { passive: true });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', onTouchEnd);
    sheet.addEventListener('touchcancel', onTouchCancel);
    sheet.addEventListener('pointerdown', onPointerDown);
    sheet.addEventListener('click', onClickCapture, true);
    return () => {
      sheet.removeEventListener('touchstart', onTouchStart);
      sheet.removeEventListener('touchmove', onTouchMove);
      sheet.removeEventListener('touchend', onTouchEnd);
      sheet.removeEventListener('touchcancel', onTouchCancel);
      sheet.removeEventListener('pointerdown', onPointerDown);
      sheet.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(
    <div className="bs-root" data-state={closing ? 'closing' : 'open'}>
      <div ref={backdropRef} className="bs-backdrop" onClick={() => onCloseRef.current()} aria-hidden />
      <div
        ref={sheetRef}
        className="bs-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        <div className="bs-grab" aria-hidden />
        <button type="button" className="bs-sr-close" onClick={() => onCloseRef.current()}>
          Закрыть
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
