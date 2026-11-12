import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Библиотеки в отдельных чанках: меняются редко, поэтому кэш переживает обновления кода приложения. */
function vendorChunk(id: string): string | undefined {
  const m = /[\\/]node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(id);
  if (!m) return undefined;
  const pkg = m[1].replace(/\\/g, '/');
  if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') return 'react';
  if (pkg === 'dexie' || pkg === 'dexie-react-hooks') return 'dexie';
  // Грузится только динамически (lib/supabase.ts), чанк остаётся ленивым.
  if (pkg.startsWith('@supabase/')) return 'supabase';
  return undefined;
}

export default defineConfig({
  base: '/doramy/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Дорамы',
        short_name: 'Дорамы',
        description: 'Каталог дорам и личная библиотека просмотра',
        lang: 'ru',
        start_url: '/doramy/',
        scope: '/doramy/',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Сердце занимает центр, фон на весь квадрат: безопасная зона маски соблюдена.
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/doramy/index.html',
        runtimeCaching: [
          {
            // Адрес приходит с ?t=..., поэтому без якоря $ и с ignoreSearch: одна запись, свежая при сети.
            urlPattern: /\/doramy\/news\.json(\?.*)?$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'news',
              networkTimeoutSeconds: 6,
              matchOptions: { ignoreSearch: true },
              expiration: { maxEntries: 1 },
            },
          },
          {
            // Проверка доступности (?probe=…, lib/img.ts) идёт мимо кэша, иначе он ответил бы за сеть.
            urlPattern: ({ url }) => url.hostname === 'image.tmdb.org' && !url.searchParams.has('probe'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-images',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Те же картинки через прокси, когда image.tmdb.org недоступен.
            urlPattern: /^https:\/\/wsrv\.nl\/\?url=image\.tmdb\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-images-proxy',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/api\.themoviedb\.org\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tmdb-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
});
