// vite.config.chrome.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest-chrome'; // <-- Указываем манифест для Chrome
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    svelte(),
    crx({ manifest }),
  ],
  define: {
    __BROWSER__: JSON.stringify('chrome')
  },
  build: {
    outDir: 'dist-chrome',
    rollupOptions: {
      input: {
        sidebar: resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          console.log('chunkInfo', chunkInfo);
          if (chunkInfo.name === 'src/service_worker') {
            return 'src/service_worker.js';
          }
          if (chunkInfo.name === 'src/content') {
            return 'src/content.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: (chunkInfo) => {
          const id = chunkInfo.facadeModuleId || '';
          if (id.endsWith('/src/content.ts') || id.endsWith('\\src\\content.ts')) {
            return 'src/content.js';
          }
          if (chunkInfo.name === 'src/service_worker') {
            return 'src/service_worker.js';
          }
          return 'assets/[name]-[hash].js';
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'index.html') {
            return 'index.html';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  }
});