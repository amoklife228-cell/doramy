/// <reference lib="webworker" />
/**
 * Service worker приложения.
 *
 * Раньше его целиком генерировал workbox (generateSW). Для push-уведомлений нужен свой обработчик
 * события push, поэтому worker теперь пишется вручную (injectManifest): кэширование переносим один в
 * один из прежней настройки, а снизу добавлены показ уведомления и переход по нему.
 */
import { clientsClaim } from 'workbox-core';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);

// Любой переход внутри приложения обслуживается из кэша оболочки (одностраничное приложение).
registerRoute(new NavigationRoute(createHandlerBoundToURL('/doramy/index.html')));

// Лента новостей: свежая при сети, старая при её отсутствии. Адрес с ?t=…, поэтому ignoreSearch.
registerRoute(
  ({ url }) => url.pathname.endsWith('/doramy/news.json'),
  new NetworkFirst({
    cacheName: 'news',
    networkTimeoutSeconds: 6,
    matchOptions: { ignoreSearch: true },
    plugins: [new ExpirationPlugin({ maxEntries: 1 })],
  }),
);

// Картинки TMDB напрямую. Проверка доступности (?probe=…) идёт мимо кэша.
registerRoute(
  ({ url }) => url.hostname === 'image.tmdb.org' && !url.searchParams.has('probe'),
  new CacheFirst({
    cacheName: 'tmdb-images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  }),
);

// Те же картинки через прокси, когда image.tmdb.org недоступен.
registerRoute(
  ({ url }) => url.hostname === 'wsrv.nl' && url.search.includes('image.tmdb.org'),
  new CacheFirst({
    cacheName: 'tmdb-images-proxy',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  }),
);

// Ответы TMDB API: свежие при сети, с запасом на офлайн.
registerRoute(
  ({ url }) => url.hostname === 'api.themoviedb.org',
  new NetworkFirst({
    cacheName: 'tmdb-api',
    networkTimeoutSeconds: 4,
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 })],
  }),
);

/* ---------- push-уведомления ---------- */

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  let data: PushPayload = { title: 'Дорамы', body: '' };
  try {
    if (event.data) data = { ...data, ...(event.data.json() as PushPayload) };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/doramy/icon-192.png',
      badge: '/doramy/icon-192.png',
      data: { url: data.url ?? '/doramy/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? '/doramy/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Уже открытое окно приложения — показываем его и переходим по адресу уведомления.
      for (const client of all) {
        if (client.url.includes('/doramy/')) {
          await client.focus();
          const hash = target.includes('#') ? target.slice(target.indexOf('#')) : '';
          if (hash && 'navigate' in client) {
            try {
              await (client as WindowClient).navigate(target);
            } catch {
              client.postMessage({ type: 'navigate', hash });
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
