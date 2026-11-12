import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { applyAppearance, loadAppearance } from './lib/appearance';
import { fixLibraryTitles } from './lib/db';
import { installEdgeSwipe } from './lib/edgeSwipe';
import { installStripArrows } from './lib/stripArrows';
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

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
