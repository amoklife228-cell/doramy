/**
 * Стрелки «влево / вправо» у горизонтальных лент на компьютере (мышь, тачпад).
 * Колёсиком мыши такие ленты не прокрутить, поэтому при наведении на ленту по её краям
 * появляются круглые кнопки. Пара кнопок одна на всё приложение и живёт в body поверх экрана:
 * разметку React не трогаем, ленты находим по классам через делегирование событий.
 */

const SELECTOR = [
  '.rec-strip',
  '.genre-cards',
  '.chips',
  '.chips-row',
  '.strip',
  '.strip-row',
  '.continue-strip',
  '.cast-strip',
  '.achievements',
  '.trailer-chips',
].join(', ');

/** Элементы, по центру которых ставим стрелки по вертикали (постер, а не постер с подписью). */
const ANCHOR = '.strip-poster-wrap, .strip-poster, .rec-img, .cast-photo, .ach-art, .continue-card, .genre-card';

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

let installed = false;

function isScroller(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const ox = getComputedStyle(el).overflowX;
  return (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 2;
}

function scrollerFrom(target: EventTarget | null): HTMLElement | null {
  let n: Element | null = target instanceof Element ? target : null;
  while (n) {
    const m: Element | null = n.closest(SELECTOR);
    if (!m) return null;
    if (isScroller(m)) return m as HTMLElement;
    n = m.parentElement;
  }
  return null;
}

function chevron(dir: -1 | 1): string {
  const d = dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

/** Куда прокрутить, чтобы следующий «экран» начинался ровно с карточки. */
function targetLeft(el: HTMLElement, dir: -1 | 1): number {
  const max = el.scrollWidth - el.clientWidth;
  const base = el.getBoundingClientRect().left + el.clientLeft;
  const padLeft = parseFloat(getComputedStyle(el).paddingLeft) || 0;
  const items = Array.from(el.children)
    .filter((c): c is HTMLElement => c instanceof HTMLElement && c.offsetWidth > 0)
    .map((c) => {
      const r = c.getBoundingClientRect();
      return { left: r.left - base + el.scrollLeft - padLeft, right: r.right - base + el.scrollLeft };
    });
  const viewLeft = el.scrollLeft;
  const viewRight = el.scrollLeft + el.clientWidth;
  const page = Math.round(el.clientWidth * 0.9);
  let to: number;
  if (dir > 0) {
    // Первая карточка, которая видна не целиком, становится первой слева.
    const next = items.find((i) => i.right > viewRight + 1);
    to = next && next.left > viewLeft + 8 ? next.left : viewLeft + page;
  } else {
    // Листаем на экран назад и выравниваем по ближайшей карточке, которая влезает целиком.
    const want = viewLeft - el.clientWidth;
    const prev = items.find((i) => i.left >= want - 1 && i.left < viewLeft - 8);
    to = prev ? prev.left : viewLeft - page;
  }
  return Math.max(0, Math.min(max, Math.round(to)));
}

export function installStripArrows(): void {
  if (installed || typeof window === 'undefined' || !window.matchMedia) return;
  installed = true;

  const fine = window.matchMedia(FINE_POINTER);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  const box = document.createElement('div');
  box.className = 'sa-root';
  box.setAttribute('aria-hidden', 'true');
  const make = (dir: -1 | 1) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.className = `sa-btn sa-${dir < 0 ? 'prev' : 'next'}`;
    b.setAttribute('aria-label', dir < 0 ? 'Прокрутить влево' : 'Прокрутить вправо');
    b.innerHTML = chevron(dir);
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!current) return;
      current.scrollTo({ left: targetLeft(current, dir), behavior: reduced.matches ? 'auto' : 'smooth' });
    });
    box.appendChild(b);
    return b;
  };
  const prev = make(-1);
  const next = make(1);
  document.body.appendChild(box);

  let current: HTMLElement | null = null;
  let frame = 0;
  let hideTimer = 0;

  const hide = () => {
    current = null;
    prev.dataset.show = 'false';
    next.dataset.show = 'false';
  };

  const place = () => {
    frame = 0;
    const el = current;
    if (!el || !el.isConnected || !fine.matches || el.closest('[aria-hidden="true"]') || !isScroller(el)) {
      hide();
      return;
    }
    const r = el.getBoundingClientRect();
    // Видимая часть ленты: её родитель с прокруткой по вертикали (обычно .content) обрезает сверху и снизу.
    const clip = el.closest('.content')?.getBoundingClientRect();
    const top = Math.max(r.top, clip?.top ?? 0);
    const bottom = Math.min(r.bottom, clip?.bottom ?? window.innerHeight);
    if (bottom - top < 36) {
      prev.dataset.show = 'false';
      next.dataset.show = 'false';
      return;
    }
    const anchor = el.querySelector(ANCHOR)?.getBoundingClientRect();
    let cy = anchor && anchor.height > 0 ? anchor.top + anchor.height / 2 : r.top + r.height / 2;
    const small = (anchor?.height ?? r.height) < 64;
    const size = small ? 32 : 44;
    cy = Math.max(top + size / 2, Math.min(bottom - size / 2, cy));
    const y = Math.round(cy - size / 2);
    const inset = small ? 0 : 8;

    for (const b of [prev, next]) {
      b.dataset.size = small ? 'small' : 'normal';
      b.style.top = `${y}px`;
    }
    prev.style.left = `${Math.round(r.left + inset)}px`;
    next.style.left = `${Math.round(r.right - inset - size)}px`;
    prev.dataset.show = String(el.scrollLeft > 2);
    next.dataset.show = String(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(place);
  };

  document.addEventListener(
    'pointerover',
    (e) => {
      if (e.pointerType !== 'mouse' || !fine.matches) return;
      const t = e.target;
      if (t instanceof Node && box.contains(t)) {
        window.clearTimeout(hideTimer);
        return;
      }
      const el = scrollerFrom(t);
      if (el) {
        window.clearTimeout(hideTimer);
        if (el !== current) current = el;
        schedule();
      } else if (current) {
        // Небольшая задержка: курсор мог просто переехать с ленты на стрелку.
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(hide, 80);
      }
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => hide());
  // Любая прокрутка (сама лента или страница под ней) — пересчитываем положение.
  document.addEventListener('scroll', () => current && schedule(), { capture: true, passive: true });
  window.addEventListener('resize', () => current && schedule());
  window.addEventListener('hashchange', hide);
  fine.addEventListener?.('change', hide);
}
