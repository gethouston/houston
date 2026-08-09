# Sidebar row anatomy (`ui/layout`)

The rail's rendering vocabulary: one row component, one geometry module, one test that
holds them together. What the rail MEANS (teams, sections, highlight, drag writes) is
`teams-ui.md`; the rail's structure and i18n keys are `agent-manifest.md` →
*Sidebar structure*.

## One row component

**Every interactive line in the rail is `SidebarRowButton`**
(`ui/layout/src/sidebar-row-button.tsx`): the top-level destinations above the list,
all THREE bands that name a run ("My accounts", "Workspace", "Your teams"), each team's
header, each team's destination rows, each agent, and the "New agent" row that closes it.
They differ only in what they point at and how far their glyph is indented.

Six presets wear it and nothing else in the rail draws a row:
`sidebar-nav.tsx` · `sidebar-band.tsx` · `sidebar-group-header.tsx` ·
`sidebar-section-rows.tsx` · `sidebar-item-row.tsx` · `sidebar-add-row.tsx`.
Exported from `ui/layout/src/index.ts`.

## One band component

**`SidebarBand` (`ui/layout/src/sidebar-band.tsx`) is the ONE way the rail names
a run of rows**, and the rail has three: "My accounts" and "Workspace" over the
top-level destinations (`sidebar-rail-chrome.tsx`) and "Your teams" over the team
blocks (`sidebar.tsx`). Three instances, different props — not three lookalikes.

It owns the whole band end to end: the `SidebarRowButton` in the `band` type
step, the disclosure triangle immediately after the words (the LABEL is the
toggle), the `aria-expanded` + `aria-controls` pair over a content id it MINTS
itself (a caller can neither forget it nor collide with another band's), the
optional `affordance` slot — only "Your teams" uses it, for the create "+" — and
the flush rhythm, where the heading's own `pb-0.5` is the entire gap to its rows.
Folding drops the ROWS and keeps the region, so `aria-controls` always resolves.

It is called a BAND and not a "section" because `SidebarSection` already names
the resolved data of one team block in that package and `SidebarSectionRows`
names a team's destination rows. Props-only and i18n-agnostic per the `ui/`
boundary: the label arrives translated, the fold arrives resolved, and the app
holds the three persisted keys (`teamsSectionCollapsed`,
`myAccountsSectionCollapsed`, `workspaceSectionCollapsed`).

Two tests in `sidebar-row-anatomy.test.ts` hold it: *draws EVERY band through the
ONE band component* (both renderers use `<SidebarBand`, and no other rail module
passes the bare `band` prop) and *lets the band component own the fold and its
aria wiring*.

Prop surface (the whole vocabulary):

| Prop | Meaning |
| --- | --- |
| `label` | the row's words |
| `icon` | the leading node in the shared 20px box (`sidebarIconBox`): a 16px Lucide mark, or an agent's avatar |
| `depth` | `"block"` heads a block (`pl-2`, medium weight); `"child"` hangs under one (`pl-5`, regular). Default `child` |
| `band` | the 12px type step, for the one row that NAMES the list |
| `muted` | a quieter resting label |
| `active` | the pill AND `aria-current="page"` |
| `disclosure` | `{expanded, contentId?}` → a small filled triangle immediately after the label, rotating a quarter turn in 150ms, plus `aria-expanded` / `aria-controls`. No placement option |
| `onActivate` / `onKeyDown` | activation |
| `trailing` | a badge INSIDE the button |
| `affordance` | a "..." or "+" BESIDE it — a sibling, because a button may not nest in a button |
| `draggable` / `dragAttributes` / `dragListeners` | @dnd-kit wiring |
| `dataAttrs` | on the row's ROOT, so a test id or tour anchor survives the row swapping into its rename input |
| `title` | native tooltip / full text for a truncated label |

## The five invariants (`ui/layout/src/sidebar-classes.ts`)

The geometry lives once, in that module. Its header states the rules (it says "four"
and enumerates five — an off-by-one in the prose, not in the code):

1. **Fixed height.** `ROW_HEIGHT` = `h-7` / 28px on every row; no hover/active/focus
   state may change it.
2. **The pill spans the row, the CONTENT is indented** (fill on the root, geometry on
   the button), so the fills form one clean column and hierarchy is never a ragged left
   edge.
3. **A row's glyph never pins a colour** — the icon inherits the label's, so an active
   row brightens as one object.
4. **Weight states the DEPTH, not the state**: block rows `font-medium`, child rows and
   the band regular, always. Selecting a row therefore cannot re-measure its label and
   move where a long agent name truncates.
5. **Exactly two type sizes** (`sidebarRowType`): `item` = `text-[13px] leading-5` for
   every row that points at something, `band` = `text-xs leading-4` for the row that
   merely names the list.

Fills are a RATIO, not two independently chosen washes: hover `bg-sidebar-hover` (6%
ink on light, 6% white on dark), selected pill `bg-sidebar-active` (10% both), set in
`packages/design-tokens`. The rail previously hovered with `bg-hover/50` ≈ 3-4%, under
the perceptual floor — it read as having no hover at all. Also exported:
`sidebarRowState`, `sidebarRowAffordanceClasses`, `sidebarRowAffordanceGutter`,
`sidebarCollapsedItemClasses`.

## Two things are deliberately NOT the shared row

- **The collapsed icon rail** is a different anatomy — a 36px glyph with a hover/focus
  flyout, not a narrower version of this one.
- **Inline rename** swaps the whole row for a field: a text field is not a state of a
  button. One field (`sidebarRowButtonClasses.input`) serves a team's name and an
  agent's alike, since by that point they are one row.

A block header that owns no menu (the default team on local hosts, or for a non-owner
on server hosts — owners get a Rename-only "…") still reserves the affordance
column with an `aria-hidden` spacer: it stands in a stack of blocks that HAVE one, and
a name given 28px more room truncates at a different point from every other team's,
which reads as a second list.

## Team rows and disclosure

- **A team row is ONE `<button aria-expanded aria-controls>`** carrying the glyph, the
  name and the disclosure triangle, with the "..." menu as a SIBLING. It is still the
  drag handle: @dnd-kit's 4px activation distance is what lets one element be both.
- **Collapsing a team hides EVERYTHING under it** — destination rows and agents alike.
  The hole that opens up is answered by `teamRowActive` (`teams-ui.md` → *Highlight*).
- **The droppable stays mounted while collapsed** (only the CONTENT is conditional): a
  collapsed block is still a drop target, which is what the confirmation pulse confirms.
- **The team glyph is monochrome** (a Lucide `Users` mark inheriting the row's colour).
  The identity colour in that column belongs to the agent avatars below; a second
  palette stacked above them would compete with the one that carries meaning. That is
  also why there is no per-team tone.

## Motion

Entrance-only, transform + opacity only, per `/DESIGN.md`: a `sidebar-disclosure-in`
keyframe in `ui/core/src/globals.css` (modelled on `files-selection-bar-in`, same
`prefers-reduced-motion` guard) plus the disclosure triangle's 150ms
`transition-transform`. **No height animation anywhere** — height is layout.

> The `animate-in` / `slide-in-from-top-*` utilities used elsewhere in `ui/` are DEAD
> in this repo: there is no `tailwindcss-animate` plugin and no `--animate-*` theme
> vars, so they emit no CSS. Named keyframes in `globals.css` are the only pattern that
> actually animates.

## Test

`ui/layout/tests/sidebar-row-anatomy.test.ts` — 23 tests under one
`describe("sidebar row anatomy")`. Three of them are the structural guard: *draws EVERY
rail row through the one row component*, *draws EVERY band through the ONE band
component* (`sidebar-band.tsx` — "My accounts", "Workspace", "Your teams") and *keeps
the row geometry OUT of its consumers*, so the six presets cannot drift apart. The rest pin each invariant plus the
focus ring, the transform-only disclosure transition, the filled-triangle mark, the
single rename field, the gapless band→list join, and the collapsed rail keeping its own
anatomy. `ui/layout/tests/rune-clamp.test.ts` covers the rename input's ceiling
(counts code POINTS, never splits a surrogate pair).
