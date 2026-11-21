# ui/showcase: design decisions

Covers `ui/showcase/`: the component showcase, its specimens and generated props tables.

## Specimen contract

Every page under `specimens/` exports `specimen: Specimen` (listed in its folder's `index.ts`) and `sources: string[]`, the `@houston-ai/*` symbols it documents spelled exactly as a consumer imports them. Helper modules (`*-parts.tsx`, `sample.tsx`) export neither. `scripts/read-specimens.mjs` reads both from source text, not imports, so the generator stays a plain Node script and a page that forgets `sources` throws instead of reporting no usage; Foundations pages document the design system itself and are exempt. `tests/registry.test.tsx` walks the folders so an unregistered specimen file fails, holds group names to the declared list, and server-renders every page, failing on console errors. Specimen ids are the URL hash, so renaming one breaks links. Lives in `ui/showcase/src/specimen.tsx`, `ui/showcase/scripts/read-specimens.mjs`, `ui/showcase/tests/registry.test.tsx`.

## Props tables

A props table is a static ordered document, so rows are keyed by position; `name` is not unique when a table documents a component family (several rows named `children`). Lives in `ui/showcase/src/specimen.tsx`.

## Rail tiers and landing page

The rail has three tiers: Foundations (palette and canvas effects, at the top because every component applies them), Primitives (inventory by kind; catalog rows are primitives), and Product areas (inventory by where the user meets it, named after the app's own surfaces). Declared product areas with no specimens are kept and show "No specimens yet", because the areas are the map of the product. Mis-filed specimens render in a trailing tier rather than being dropped. The component count excludes Foundations pages. The landing page is pinned by id (the colors page), falling back to the first routable id only if deleted. The rail filter keeps a whole branch when a tier or group name matches and otherwise narrows by title, never returning an empty heading. Subgroups start open and only collapsed ones are remembered; a filter overrides collapse. Lives in `ui/showcase/src/registry.ts`, `ui/showcase/src/nav-filter.ts`, `ui/showcase/src/showcase-nav.tsx`.

## Usage map generation

`scripts/gen-usage.mjs` builds the "Used in" map from real imports in the app frontends, the store website and every `ui/*` package except the showcase. It is lexical (inputs are Biome-formatted) and dependency-free. Type-only imports are excluded because they paint no pixel. Relative imports inside the owning package count as internal usage (how `AIBoard` composes `KanbanBoard`), but only for symbols the package's `src/index.ts` exports, so a local helper sharing a name is not credited; `export { a as B }` publishes the name after `as`. A file counts once per surface. Output is fully sorted so regeneration is byte-identical, and `tests/usage.test.ts` fails on a stale `src/usage.gen.json`. The scanner also matches import statements that appear inside comments, so a comment sweep requires regenerating the map. Lives in `ui/showcase/scripts/gen-usage.mjs` and `ui/showcase/scripts/scan-imports.mjs`.

## Surface labels

Path prefixes map to the product's own navigation words (from `app/src/locales/en/shell.json` `sidebar`); longest prefix wins, and an unclaimed path falls back to its top-level folder so missing rules stay visible. Some per-agent labels are historical tab names kept because the team still uses them; a label is a wayfinding hint, not a route. Lives in `ui/showcase/scripts/surface-rules.mjs`.

## Rendering surface

The showcase imports core's token bridge and `canvas.css` after it, so components are reviewed on the real canvas; Tailwind scans the showcase and package sources through node_modules symlinks. Core locks body overflow for the app shell, so the showcase unlocks it, while canvas.css owns the page color. Store screens are previewed inside the app's screen pane, never on the bare gutter. The search input hides Chrome's UA-colored clear glyph and renders its own always-visible clear button; spell-check and autocomplete are off for component names. The theme defaults to dark, persists in localStorage (wrapped because private Safari throws), and `index.html` replays it before first paint. The selected specimen lives in the URL hash. Vite uses a strict port so it fails instead of drifting. The showcase is never built or shipped. Lives in `ui/showcase/src/globals.css`, `ui/showcase/src/showcase.tsx`, `ui/showcase/src/use-showcase-state.ts`, `ui/showcase/vite.config.ts`.

## Foundations pages

Token names are read from the design-token JSON so the page cannot fall behind the palette; the plain-English words are hand-written in the vocabulary module, which may lag the palette but never lead it (a test enforces that). Live values are read with `getComputedStyle` and re-read on theme change, showing a dash until read; only opaque `rgb()` is converted to hex, since translucent values are the point. The canvas effects are copied value for value from `ui/core/src/canvas.css` because a stylesheet cannot be imported into TypeScript; if they disagree, canvas.css wins. Sample avatars are inline `data:` SVGs so the showcase renders without network. Lives in `ui/showcase/specimens/foundations/`.
