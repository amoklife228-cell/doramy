import { goBack } from './router';

/**
 * Свайп от левого края экрана для возврата назад, как в iOS.
 * В режиме «На экран Домой» у Safari нет своего жеста «назад», поэтому делаем свой:
 * верхний `.detail` едет за пальцем, при отпускании либо уезжает вправо и вызывается
 * goBack(), либо возвращается на место.
 */

const EDGE = 20; // ширина зоны у левого края, px
const LOCK_DX = 10; // сдвиг, после которого жест захватывается
const BAIL_DY = 6; // вертикальный сдвиг, после которого отдаём касание скроллу
const COMMIT_RATIO = 0.35; // доля ширины экрана для срабатывания
const FLICK_VELOCITY = 0.5; // px/мс — быстрый взмах вправо
const FLICK_MIN_DX = 30;
const DURATION = 200; // мс
const PARALLAX = 0.3; // насколько нижний экран сдвинут влево в начале
const SHADE_OPACITY = 0.25;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

type State = 'idle' | 'pending' | 'dragging' | 'settling';

let installed = false;

function topOverlays(): { top: HTMLElement | null; below: HTMLElement | null } {
  // Только самостоятельные оверлеи, не вложенные в другой `.detail`.
  const list = Array.from(document.querySelectorAll<HTMLElement>('.detail')).filter(
    (el) => !el.parentElement?.closest('.detail'),
  );
  return { top: list[list.length - 1] ?? null, below: list[list.length - 2] ?? null };
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function installEdgeSwipe(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  let state: State = 'idle';
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let width = 0;
  let top: HTMLElement | null = null;
  let below: HTMLElement | null = null;
  let shade: HTMLDivElement | null = null;
  let samples: { x: number; t: number }[] = [];

  const render = (x: number, transition: boolean) => {
    if (!top) return;
    const p = width ? Math.min(1, Math.max(0, x / width)) : 0;
    const tr = transition ? `transform ${DURATION}ms ${EASE}` : 'none';
    top.style.transition = tr;
    top.style.transform = `translate3d(${x}px, 0, 0)`;
    if (below) {
      below.style.transition = tr;
      below.style.transform = `translate3d(${-(1 - p) * width * PARALLAX}px, 0, 0)`;
    }
    if (shade) {
      shade.style.transition = transition ? `opacity ${DURATION}ms ${EASE}` : 'none';
      shade.style.opacity = String(SHADE_OPACITY * (1 - p));
    }
  };

  const lock = () => {
    if (!top) return;
    state = 'dragging';
    // Анимация появления перекрывает inline-transform — отключаем её на время жеста.
    // `animation: none` оставляем навсегда: иначе при снятии slide-in проиграется заново.
    top.style.animation = 'none';
    top.style.willChange = 'transform';
    top.style.boxShadow = '-6px 0 24px rgba(0, 0, 0, 0.18)';
    if (below) {
      below.style.willChange = 'transform';
    } else {
      // Под оверлеем вкладка — затемняем её отдельным слоем (оверлей имеет z-index 20).
      shade = document.createElement('div');
      shade.setAttribute('aria-hidden', 'true');
      shade.style.cssText =
        `position:fixed;top:0;right:0;bottom:0;left:0;z-index:19;background:#000;` +
        `opacity:${SHADE_OPACITY};pointer-events:none;`;
      document.body.appendChild(shade);
    }
  };

  const cleanup = (el: HTMLElement | null, lower: HTMLElement | null, sh: HTMLDivElement | null) => {
    if (el) {
      el.style.transition = '';
      el.style.transform = '';
      el.style.willChange = '';
      el.style.boxShadow = '';
    }
    if (lower) {
      lower.style.transition = '';
      lower.style.transform = '';
      lower.style.willChange = '';
    }
    sh?.remove();
  };

  const reset = () => {
    state = 'idle';
    top = null;
    below = null;
    shade = null;
    samples = [];
    dx = 0;
  };

  const finish = (commit: boolean) => {
    const el = top;
    const lower = below;
    const sh = shade;
    const instant = reducedMotion();
    state = 'settling';

    const done = () => {
      if (commit) {
        goBack();
        // Оверлей снимется по hashchange; убираем остатки чуть позже, если элемент остался.
        window.setTimeout(() => {
          cleanup(el, lower, sh);
          reset();
        }, 60);
      } else {
        cleanup(el, lower, sh);
        reset();
      }
    };

    if (instant) {
      if (commit && el) el.style.transform = `translate3d(${width}px, 0, 0)`;
      done();
      return;
    }

    render(commit ? width : 0, true);
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      el?.removeEventListener('transitionend', onEnd);
      done();
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === 'transform') end();
    };
    el?.addEventListener('transitionend', onEnd);
    window.setTimeout(end, DURATION + 80); // страховка, если transitionend не придёт
  };

  const onStart = (e: TouchEvent) => {
    if (state !== 'idle' || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX > EDGE) return;
    // Открыта шторка или фильтр поверх — свайп назад не нужен.
    // Поверх открыта шторка (меню профиля, достижение) или фильтр каталога — свайп не перехватываем.
    if (document.querySelector('.bs-root, .fs-backdrop, .sheet-backdrop, .filter, .pv-root')) return;
    const found = topOverlays();
    if (!found.top) return;
    top = found.top;
    below = found.below;
    startX = t.clientX;
    startY = t.clientY;
    dx = 0;
    width = window.innerWidth || document.documentElement.clientWidth;
    samples = [{ x: t.clientX, t: e.timeStamp }];
    state = 'pending';
  };

  const onMove = (e: TouchEvent) => {
    if (state !== 'pending' && state !== 'dragging') return;
    if (e.touches.length !== 1) {
      if (state === 'dragging') finish(false);
      else reset();
      return;
    }
    const t = e.touches[0];
    const mx = t.clientX - startX;
    const my = t.clientY - startY;

    if (state === 'pending') {
      // Вертикальное или влево — обычный скролл, жест не трогаем.
      if (mx < 0 || (Math.abs(my) > Math.abs(mx) && Math.abs(my) > BAIL_DY)) {
        reset();
        return;
      }
      if (Math.abs(my) >= Math.abs(mx)) return; // ещё непонятно
      if (mx <= LOCK_DX) {
        // Горизонталь преобладает, но порог не набран: не даём iOS начать скролл,
        // иначе дальнейшие touchmove станут неотменяемыми.
        if (e.cancelable) e.preventDefault();
        return;
      }
      lock();
    }

    if (e.cancelable) e.preventDefault();
    // Внутренние обработчики (pull-to-refresh на .content) не должны видеть движение.
    e.stopPropagation();
    dx = Math.max(0, mx);
    samples.push({ x: t.clientX, t: e.timeStamp });
    if (samples.length > 6) samples.shift();
    render(dx, false);
  };

  const onEnd = (e: TouchEvent) => {
    if (state === 'pending') {
      reset();
      return;
    }
    if (state !== 'dragging') return;
    if (e.type === 'touchcancel') {
      finish(false);
      return;
    }
    const last = samples[samples.length - 1];
    const recent = samples.find((s) => last.t - s.t <= 100) ?? samples[0];
    const dt = last.t - recent.t;
    const v = dt > 0 ? (last.x - recent.x) / dt : 0;
    const commit = dx > width * COMMIT_RATIO || (v > FLICK_VELOCITY && dx > FLICK_MIN_DX);
    finish(commit);
  };

  // Фаза захвата на window — раньше обработчиков внутренних скроллеров.
  window.addEventListener('touchstart', onStart, { capture: true, passive: true });
  window.addEventListener('touchmove', onMove, { capture: true, passive: false });
  window.addEventListener('touchend', onEnd, { capture: true, passive: true });
  window.addEventListener('touchcancel', onEnd, { capture: true, passive: true });
}
