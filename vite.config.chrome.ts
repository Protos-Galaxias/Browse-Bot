// vite.config.chrome.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest-chrome'; // <-- Указываем манифест для Chrome

export default defineConfig({
  plugins: [
    svelte(),
    crx({ manifest }),
  ],
});