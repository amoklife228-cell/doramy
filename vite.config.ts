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
      // Свой service worker (src/sw.ts): нужен обработчик push-уведомлений, которого нет в generateSW.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
      },
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
    }),
  ],
});
