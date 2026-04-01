// @ts-check
import { defineConfig } from 'astro/config';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@astrojs/react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @param {string | undefined} raw */
function normalizeAstroBase(raw) {
  if (raw == null) return '/';
  const s = String(raw).trim();
  if (s === '' || s === '/') return '/';
  const inner = s.replace(/^\/+|\/+$/g, '');
  if (!inner) return '/';
  return `/${inner}/`;
}

// https://astro.build/config
// For GitHub Pages project sites: ASTRO_BASE_PATH=my-repo (or /my-repo/) → base /my-repo/
export default defineConfig({
  base: normalizeAstroBase(process.env.ASTRO_BASE_PATH),
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