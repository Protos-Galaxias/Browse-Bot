// vite.config.firefox.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest-firefox';
import { resolve } from 'path'; // Импортируем resolve из path

export default defineConfig({
  plugins: [
    svelte(),
    crx({ manifest }),
  ],
  // Явно указываем папку для сборки
  build: {
    outDir: 'dist-firefox',
    // Добавляем этот блок, чтобы гарантировать включение index.html
    rollupOptions: {
      input: {
        // Явно определяем, что наш главный HTML файл - это точка входа.
        // Vite/CRX плагин должен делать это сам, но мы подстрахуемся.
        sidebar: resolve(__dirname, 'index.html'),
      },
      output: {
        // Убедимся, что файл называется index.html в корне сборки
        entryFileNames: (chunkInfo) => {
          // Для фонового скрипта оставляем имя service_worker.js
          if (chunkInfo.name === 'src/service_worker') {
            return 'src/service_worker.js';
          }
          // Для остальных JS файлов используем стандартный шаблон
          return 'assets/[name]-[hash].js';
        },
        assetFileNames: (assetInfo) => {
          // Если это наш главный HTML, кладем его в корень
          if (assetInfo.name === 'index.html') {
            return 'index.html';
          }
          // Остальные ассеты кладем в папку assets
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  }
});