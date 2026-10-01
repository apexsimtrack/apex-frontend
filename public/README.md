# Public assets

Files here are served at the site root (`/filename`).

| Asset                                                                                                          | Purpose                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `logo.png`                                                                                                     | In-app header logo                                                                                                                                     |
| `og-default.png`                                                                                               | Default Open Graph / Twitter share image (1200×630)                                                                                                   |
| `favicon.ico`, `favicon-96x96.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `site.webmanifest` | Favicon set (Apex emblem). Sizes are multiples of 48px as Google Search requires; keep URLs stable (no `?v=` busting) so Google keeps the cached icon. |
| `robots.txt`                                                                                                   | Crawler rules                                                                                                                                          |
| `sitemap.xml`, `sitemap-static.xml`                                                                            | `sitemap.xml` is an index. `sitemap-static.xml` is generated from `src/config/publicSeoRoutes.ts` via `pnpm seo:sitemap` (runs on `prebuild`). `/sitemap-dynamic.xml` is served by middleware. |
| `sims/*.svg`                                                                                                   | Sim logos (e.g. iRacing, F1) used by `SimLogo` / `lib/sim.ts`                                                                                          |

When adding assets, reference them as `/your-file.ext` in components or `index.html`.
