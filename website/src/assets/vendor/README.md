# Vendored motion libraries

Self-hosted, minified production builds used only by the landing page's hero
motion (`/assets/hero-motion.js`). Loaded `defer`, landing-only, and gated behind
`prefers-reduced-motion: no-preference` — under reduced motion or with these
scripts absent, the page behaves exactly as its static markup.

They are copied here (not fetched from a CDN) so the site ships a fixed,
audited byte-for-byte build with no third-party runtime request.

| File | Package | Version | Global | License |
| --- | --- | --- | --- | --- |
| `gsap.min.js` | [gsap](https://www.npmjs.com/package/gsap) | 3.15.0 | `window.gsap` | GreenSock Standard "No Charge" license — https://gsap.com/standard-license (free for this use; no Club/SplitText/paid plugins are used) |
| `ScrollTrigger.min.js` | gsap (bonus plugin) | 3.15.0 | `window.ScrollTrigger` | GreenSock Standard "No Charge" license (same as above) |
| `lenis.min.js` | [lenis](https://www.npmjs.com/package/lenis) | 1.3.25 | `globalThis.Lenis` | MIT |

## Provenance

Fetched from the npm registry with `npm pack <pkg>` and copied verbatim from each
tarball's `dist/`:

- `gsap.min.js` ← `gsap/dist/gsap.min.js`
- `ScrollTrigger.min.js` ← `gsap/dist/ScrollTrigger.min.js`
- `lenis.min.js` ← `lenis/dist/lenis.min.js` (the dangling `//# sourceMappingURL`
  comment was stripped, since the `.map` is not shipped)

To update: re-pack the pinned version, re-copy the same dist files, and bump the
versions in this table.

## Notes

- The GSAP license copyright header is preserved inside each `.min.js`.
- Lenis's helper stylesheet (`html.lenis, html.lenis body { height: auto }` and
  the `data-lenis-prevent` rules) is inlined into `assets/css/landing-motion.css`
  rather than shipped as a separate render-blocking request — those rules only
  take effect once the `lenis` class is added to `<html>` at runtime.
