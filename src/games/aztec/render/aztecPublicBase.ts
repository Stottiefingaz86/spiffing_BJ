/**
 * Prefix for files in `public/aztec/*`. Must match Astro/Vite `base` (set `base` in astro.config
 * when deploying under a subpath, e.g. GitHub Pages project sites).
 */
export function aztecPublicBase(): string {
  const raw = import.meta.env.BASE_URL;
  const b = raw == null || raw === '' ? '/' : String(raw);
  return b.endsWith('/') ? b : `${b}/`;
}
