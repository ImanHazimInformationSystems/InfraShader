# Refinement WP4 4.3 — favicon, icons and sharing metadata (23 November 2026)

Feature ID: S01 (visual refinement; no domain behaviour change). Branch `refine/customer-ready`; not
deployed.

## Baseline

- `apps/web/index.html` had no favicon, touch icon or manifest.
- `theme-color` was `#123b31`, a green left over from before the maroon/silver identity.
- There was no social-sharing metadata.

## Changes

- `apps/web/public/favicon.svg`: an original, project-authored mark (silver leaf and site line on
  maroon `#701f36`). The app's Lucide `Leaf` icon path was not copied.
- `scripts/render-brand-assets.mjs`: renders `favicon-32.png`, `apple-touch-icon.png` (180),
  `icon-192.png`, `icon-512.png` and `social-card.png` (1200×630) from the SVG with the Playwright
  browser already in devDependencies. No new dependency.
- `apps/web/public/site.webmanifest`: name, maroon theme colour, icons.
- `apps/web/index.html`:
  - maroon `theme-color`;
  - icon, touch icon and manifest links;
  - an accurate description of both workspaces;
  - Open Graph / Twitter card metadata.

  The existing title is unchanged.
- `tests/integration-browser/brand.spec.mjs`: the production bundle serves every referenced asset with the
  right content type, the manifest icons resolve, and title and theme colour match.

## Checks

| Command | Result |
|---|---|
| `node scripts/render-brand-assets.mjs` | rendered 5 PNGs; the social card and 32 px icon were inspected visually |
| `npm run build` | built; all assets emitted to `dist/` |
| `npx playwright test --config playwright.integration.config.mjs brand` | 1 passed |

## Remaining

- `og:image` is a relative URL: no public domain or canonical URL is approved. Some crawlers need an
  absolute URL, so set one with the public website (WP5).
- The social card uses the brief's *suggested* positioning line ("Plan outdoor work. Explain the price.
  Deliver a clearer proposal."). Replace it if the user refines the positioning.
- Brand-token unification is not done. `--brand-maroon` is `#701f36` in `styles.css` and `#72233d` in
  `product/product.css`. The font evaluation (WP4 4.1/4.2) is also still to do.
