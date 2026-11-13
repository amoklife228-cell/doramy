import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { applyAppearance, loadAppearance } from './lib/appearance';
import { fixLibraryTitles } from './lib/db';
import { imageMode, installImageProbe, subscribeImageMode } from './lib/img';
import { installEdgeSwipe } from './lib/edgeSwipe';
import { installStripArrows } from './lib/stripArrows';
import { installTracking } from './lib/track';
import './styles.css';
// Раскладка для компьютера: только внутри медиазапросов, телефонный вид не меняет.
import './desktop.css';
// Нижняя полоса в приложении с экрана «Домой» на iPhone.
import './viewportFix.css';
import { installViewportFix } from './lib/viewportFix';

installViewportFix();
applyAppearance(loadAppearance());
installEdgeSwipe();
installStripArrows();
// iOS возвращает приложение с экрана «Домой» из памяти без перезагрузки, и браузер сам
// не проверяет новую версию. Проверяем при каждом возвращении в приложение и раз в час.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => void registration.update().catch(() => undefined);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    setInterval(check, 60 * 60 * 1000);
  },
});

// Через пару секунд после запуска, чтобы не мешать первой загрузке экрана.
setTimeout(() => {
  if (navigator.onLine) void fixLibraryTitles().catch(() => undefined);
}, 2500);

installImageProbe();
installTracking();

// Переход по нажатию на уведомление, когда окно уже открыто (service worker просит сменить адрес).
navigator.serviceWorker?.addEventListener('message', (e) => {
  const data = e.data as { type?: string; hash?: string } | undefined;
  if (data?.type === 'navigate' && data.hash) location.hash = data.hash.replace(/^#/, '');
});

/**
 * Если сервер картинок TMDB оказался недоступен, адреса меняются на прокси (lib/img.ts).
 * Адреса считаются при отрисовке, поэтому перемонтируем приложение: маршрут в адресе, он сохранится.
 */
function Root() {
  const mode = React.useSyncExternalStore(subscribeImageMode, imageMode);
  return <App key={mode} />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
