import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/doramy/',
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
          { src: 'icon-192.png?v=3', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png?v=3', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/doramy/index.html',
        runtimeCaching: [
          {
            urlPattern: /\/doramy\/news\.json$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'news', networkTimeoutSeconds: 6, expiration: { maxEntries: 2 } },
          },
          {
            urlPattern: /^https:\/\/image\.tmdb\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-images',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/api\.themoviedb\.org\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tmdb-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
});
