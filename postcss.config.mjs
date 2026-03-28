/** Tailwind v4 via PostCSS — avoids @tailwindcss/vite transform hooks conflicting with Astro + Vite 7. */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
