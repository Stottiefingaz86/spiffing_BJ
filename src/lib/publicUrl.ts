/**
 * URL for a file in `public/` with Astro/Vite `base` applied (subpath deploys).
 * Pass path without leading slash, e.g. `publicAssetUrl('bandits/logo.png')`.
 */
export function publicAssetUrl(path: string): string {
  const trimmed = path.replace(/^\/+/, '');
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL != null
      ? String(import.meta.env.BASE_URL)
      : '/';
  if (raw === '' || raw === '/') return `/${trimmed}`;
  const base = raw.endsWith('/') ? raw.slice(0, -1) : raw;
  return `${base}/${trimmed}`;
}
