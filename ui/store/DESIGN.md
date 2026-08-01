# Agent Store — design language

The Agent Store is one product with two front doors: the public catalog site
(`agentstore/`, Next.js) and the in-app store view (`app/`, Vite). Both render
the SAME components from `@houston-ai/store`, so the language has to be written
down once, here, and encoded once, in `src/primitives.ts`.

Read the repo-root `/DESIGN.md` first — this file does not replace it. Houston's
hard rules still apply: semantic `--ht-*` tokens only, Lucide icons only, both
themes on every screen, no webfonts, props-only `ui/` packages.

## 1. The identity: air

The store is a catalog someone browses, not a console someone operates. Its
identity is the space around the content, not the content's chrome. If a screen
feels tight, the screen is wrong.

| | value | utility |
|---|---|---|
| measure | 1040px, centred | `max-w-[1040px] mx-auto` |
| gutter | 24px mobile / 32px desktop | `px-6 md:px-8` |
| page top | 48px | `pt-12` |
| page bottom | 64px run-out | `pb-16` |
| between blocks | 40px mobile / 64px desktop | `gap-10 md:gap-16` |
| head → body | 24px | `gap-6` |

The between-blocks rhythm is a **flex gap on the page container**, never a
margin on the section. Margins collapse, fight each other, and make a section
un-droppable into a different parent. `StorePage` owns the stack; `StoreSection`
is margin-free.

## 2. Type

System font stack only — no webfonts, ever (repo `/DESIGN.md` §6). Four roles,
nothing outside them:

| role | size / leading | weight | token colour |
|---|---|---|---|
| display | 32px / 1.2, `tracking-tight` | 600 | `text-ink` |
| section title | 20px / 1.3, `tracking-tight` | 600 | `text-ink` |
| body | 15px / 1.55 | 400 | `text-ink` |
| meta | 13px / 1.4 | 400 | `text-ink-muted` |

Headings carry `text-balance`. Sentence case everywhere; never uppercase or
`tracking-wider`.

**Deliberate divergence from the app scale.** Repo `/DESIGN.md` §4 types an app
page title at 28px/400 — correct for a workspace pane sitting under a sidebar
and a toolbar. The store's title is the only thing on a wide, empty page and
has to hold that space, so it is 32px/600. This divergence is scoped to the
store surface; do not carry it back into app chrome.

## 3. Surfaces

Flat and calm. Depth comes from the token surface ladder plus a 1px hairline,
never from a shadow — in **either** theme (dark-mode shadows are already banned
repo-wide; the store bans them in light mode too, because a shadow grid is the
generic-marketplace tell).

| surface | classes |
|---|---|
| page plane | *(transparent — the shared canvas shows through)* |
| card | `rounded-2xl border border-line bg-card p-6` |
| card hover | `hover:bg-card-hover hover:border-line-input` |
| recessed panel | `rounded-2xl border border-line bg-chip-subtle p-6` |
| chip / badge | `rounded-full bg-chip text-chip-text` |

**The page plane is the shared Houston canvas, not a fill of ours.**
`@houston-ai/core/src/canvas.css` paints it once for every surface: `--ht-base`
on the `body`, and on `body::before` the slow-drifting **aurora** in dark
(blue/indigo/orange, 32s, off under `prefers-reduced-motion`) — nothing in
light, which stays the clean solid "Aurora" palette. The app shell, the
component showcase and the catalog site all import that file after `ui/core`'s
`globals.css`, so a card reviewed in the showcase sits on exactly the plane it
will sit on in the app.

Consequence for this package: **`storeLayout.page` carries no background.**
Every wrapper between the body and the content stays transparent, or it seals
the glow off — that is why `StorePage` is `min-h-full w-full text-ink` and not
`bg-gutter`. Never paint a page-level plane here; if a surface needs to read as
raised, step it UP the ladder (`bg-card`, `bg-chip-subtle`), never fill the
canvas behind it.

**`bg-gutter`, not `bg-base`.** The token is `--ht-base`, but `ui/core`'s bridge
deliberately exports it as `--color-gutter`: naming it `base` would make
Tailwind emit `text-base` as a *colour* utility and silently paint every 16px
heading. See the comment in `ui/core/src/globals.css`.

`bg-card` is translucent in both themes (`rgba(255,255,255,.68)` light,
`rgba(40,40,40,.5)` dark) and `canvas.css` frosts it (`backdrop-filter` blur +
a 1px top sheen). Over the canvas that reads as a calm tint with the aurora
faintly behind it, which is the intended card presence — do not chase it with a
solid. The cards stay flat and quiet **on** a live canvas: one accent per view,
no shadows, no lift.

## 4. Density

Card padding 24px. Grid gap 24px. List row gap 16px. Concentric radii: a 16px
card with 24px padding takes an 8px inner radius on anything nested against its
edge.

## 5. Colour

Neutral surfaces, neutral text. The accent (`bg-action`) appears on **exactly
one** control per view — the primary CTA. Everything else is
`storeSurface.ctaSecondary` or a plain link. Chips and badges are `bg-chip`;
colour on a chip has to mean something (status), never decorate.

## 6. Motion

150ms `ease-out`, on **colour and border only**. No lift, no translate, no
scale, no `transition-all`. Hover is a background shift, not a movement.

## 7. Both themes, always

Every surface is verified under `[data-theme="light"]` and `[data-theme="dark"]`
through the `--ht-*` tokens. A hardcoded colour anywhere in this package is a
defect — `tests/primitives.test.ts` fails the build on one.

## 8. Working in this package

- **Props only.** No Zustand, no `@/` aliases, no `app/` types, no
  `react-i18next`. User-facing strings arrive through a `labels` prop with
  English defaults; the consumer passes `t()` results in.
- **Compose from `src/primitives.ts`.** Do not spell the language in a
  component; if a component needs a class the language does not have, add it to
  the primitives with a reason.
- **Showcase first.** Every component gets a specimen in `ui/showcase` before it
  is wired into a consumer — `ui/showcase/specimens/store/`, group `Store`. Run
  `pnpm --filter @houston-ai/showcase dev` → <http://localhost:5199>.
- **Checks:** `pnpm --filter @houston-ai/store typecheck`,
  `pnpm --filter @houston-ai/store test`, `pnpm exec biome check ui/store`.
