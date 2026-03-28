// @ts-check
import { defineConfig } from 'astro/config';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@astrojs/react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
  devToolbar: { enabled: false },
  integrations: [react()],

  vite: {
    // Tailwind runs via postcss.config.mjs + @tailwindcss/postcss (see global.css @import).
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    optimizeDeps: {
      include: ['pixi.js'],
    },
  },
});