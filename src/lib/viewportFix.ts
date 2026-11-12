/**
 * Ошибка iOS у приложений с экрана «Домой» со строкой состояния black-translucent:
 * страница рисуется с самого верха (под часами), но высота окна (innerHeight) занижена
 * на высоту строки состояния. Всё, что прижато к низу окна (position: fixed; bottom: 0),
 * заканчивается выше края экрана, и снизу остаётся пустая полоса около 47–59 pt.
 *
 * Измеряем нехватку: высота экрана минус высота окна. Если она есть и не больше верхнего
 * безопасного отступа (строка состояния), записываем её в --ios-gap, а полноэкранные слои
 * растягиваются вниз на эту величину (стили в viewportFix.css). В браузере и на компьютере
 * нехватки нет — ничего не меняется.
 */
const PROBE_STYLE = 'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none';

function isStandalone(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

function safeTop(): number {
  const probe = document.createElement('div');
  probe.style.cssText = PROBE_STYLE;
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h;
}

/** Текущая нехватка высоты окна, px (0 — ошибки нет). */
export function measureIosGap(): number {
  if (!isStandalone()) return 0;
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  // screen.width/height на iOS не меняются при повороте.
  const screenH = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  const gap = Math.round(screenH - window.innerHeight);
  const top = safeTop();
  // Именно эта ошибка: окно короче экрана примерно на строку состояния.
  return gap > 0 && top > 0 && gap <= top + 12 ? gap : 0;
}

export function currentIosGap(): number {
  return Number(document.documentElement.dataset.iosGap ?? 0) || 0;
}

export function installViewportFix() {
  const apply = () => {
    const gap = measureIosGap();
    const root = document.documentElement;
    if (gap > 0) {
      root.style.setProperty('--ios-gap', `${gap}px`);
      root.dataset.iosGap = String(gap);
    } else {
      root.style.removeProperty('--ios-gap');
      delete root.dataset.iosGap;
    }
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 350));
  // iOS иногда отдаёт окончательный размер окна не сразу после запуска.
  setTimeout(apply, 500);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && setTimeout(apply, 300));
}
