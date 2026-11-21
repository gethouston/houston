# ui/layout: design decisions

Covers `ui/layout/` (`@houston-ai/layout`): the sidebar rail: row anatomy and geometry, person and team rows, the sortable tree and selection.

## One row anatomy for the rail

Every interactive line in the sidebar list (group headers and people) is one `SidebarRowButton`, with every value defined once in `sidebar-geometry.ts`, because a rail whose rows drift in height, indent, glyph column or type reads as several stacked lists. Invariants:

1. Height is fixed per anatomy (28px glyph row, 64px person row) and no state changes it.
2. Hover and active paint on the row's `::before`, an inset rounded pill, never on the element carrying the geometry, so the inset does not drag the glyph column and indent stays the only hierarchy signal.
3. The icon inherits the label's color, so an active row brightens as one object.
4. One weight (510) for glyph rows, so nothing reflows on click; a person's name is semibold because it names someone.
5. One type size, 13px; a person row's second line is 12px.
6. One horizontal inset (`sidebarRailInset`) for the pinned rows, the list and the account row.
Lives in `ui/layout/src/sidebar-geometry.ts` and `ui/layout/src/sidebar-row-button.tsx`.

## Row spacing details

The glyph column is 20px, holding a 16px Lucide mark or a 14px team mark. The icon-to-label gap is tight (6px) because what the eye measures includes the slack inside the 20px box, putting the optical gap at 6 to 9px; the label-to-badge gap is 8px because a badge is a separate object. There is no single `gap`. The trailing end stops 8px short, 2px inside the 6px-inset pill; the button pads and the sibling "..." uses a margin, because 4px made both overhang the pill. Row line heights are set explicitly and shorter than the row so labels center and descenders survive truncation. Pinned rows sit on a 1px rhythm so the first team block follows as the next row. Lives in `ui/layout/src/sidebar-geometry.ts`.

## Person rows

A person row is laid out like a message list: a 40px portrait slot (people may give employees their own pictures), the name over a line of up to two lines, 64px tall so the portrait sits on 12px padding; text never grows. A grouped row steps in 20px under its header, and block headers share the 12px edge with root portraits. The text column carries a hairline along the row's foot from the text's left edge; it is dropped on the selected row, folder members and the account row, and the row above hides its line when its neighbour is hovered or selected, because the translucent pill cannot paint over it. `font-variation-settings: normal` undoes the inherited 510 so the two lines keep their weights. On the collapsed rail an employee is a 36px square with a 24px avatar so its 28px running ring fits with 4px of air; the flyout keeps the full person row. The add row is 40px, keeps the person row's columns and has no hairline. Lives in `ui/layout/src/sidebar-geometry.ts` and `ui/layout/src/sidebar-paint.ts`.

## Paint layer

A fill spanning the rail edge to edge reads as a bar, so the pill is inset 6px with `rounded-lg`. It is a positioned `::before`, so siblings are positioned to paint above it. The focus ring rides the same layer scoped to the row's own button, so it traces the pill. Hover is `sidebar-hover` (6%) and selected `sidebar-active` (10%): the ratio keeps a hovered row from reading as selected while staying visible; the earlier `bg-hover/50` (about 3 to 4%) was under the perceptual floor. The disclosure mark sits 4px from the label so it reads as the words' state; it is a 16px box at `ink-muted`, one step under the label. The "..." affordance is a sibling (a button may not nest in a button), always rendered, muted at rest, and exported so app menus match. Lives in `ui/layout/src/sidebar-paint.ts`.

## Disclosure triangle

The triangle is drawn inline rather than from an icon set: no set ships a filled triangle at this weight, and an outline chevron means "more over there" rather than "closed". The path is centered on the 16-unit box in both axes so a 90-degree rotation keeps it optically still. Lives in `ui/layout/src/sidebar-row-caret.tsx`.

## Selection semantics

An active row paints the pill and sets `aria-current="page"`, since a fill with no announced counterpart is visible only to sighted users. A group header is one button that toggles the fold and is also the drag handle; dnd-kit's pointer sensor has a 4px activation distance so a still click activates. Group header DOM attributes go on the row root because they identify the block for navigation and drag tests. Lives in `ui/layout/src/sidebar-row-button.tsx` and `ui/layout/src/sidebar-group-header.tsx`.

## Sortable tree drag

The rail is modeled as one flat list of visible rows, each knowing whether it is in a group; a drag is a reorder of that list plus the dragged row's depth, and the stored arrangement is read off the result, so the ghost shows exactly what the drop stores. Members of a collapsed group are not rows; a dragged group's members are hidden while its header moves. Depth comes from the landing slot and the sideways offset (whole indent steps): under an open header or a member it may go inside, above a member it must, elsewhere it is top level; a collapsed header takes an agent only when dragged right onto it, so a row never disappears into a fold. Keyboard moves use the same projection. A drop is drawn from its own arrangement until the host's props change, because the host store arrives a tick later and the old props would flash rows back. Without `onArrange` nothing drags or moves. The dragged row stays as a faded ghost at its landing slot, with no lines or rings. The empty-group hint is read from at-rest rows, never the drag projection, since it is not sortable. A row moved into a collapsed group hands focus to the group header. The drag overlay is portalled to `document.body` because `position: fixed` resolves against the nearest transformed ancestor and the list animates in on `transform`, which made drags started during the animation draw the overlay away from the pointer. Pinned rows sit outside every drag container and the scroll box. Lives in `ui/layout/src/sidebar-tree.ts`, `ui/layout/src/use-sidebar-tree-drag.ts`, `ui/layout/src/sidebar-grouped-list.tsx`, `ui/layout/src/sidebar-group-block.tsx`, `ui/layout/src/sidebar-drag-overlay.tsx`, `ui/layout/src/sidebar-pinned-list.tsx`.

## Rail structure

The rail is a top line, an optional full-width notice, the list (pinned rows outside the scroll box, then the grouped or flat list closed by the add row) and the host footer, which is `shrink-0` so short windows squeeze the list. With window controls inset, the first row is a drag region reserving an 84px zone. Host actions close the expanded top line and stack under the toggle when collapsed. The rail carries no rename or delete plumbing; agents are edited on their own screen and team identity in a host dialog. The collapsed flyout omits the affordance and data attributes so menus are not anchored to a transient surface and ids match once. Groups are an expanded-rail idea; the collapsed rail is always flat. Lives in `ui/layout/src/sidebar.tsx`, `ui/layout/src/sidebar-header.tsx`, `ui/layout/src/sidebar-frame.ts`, `ui/layout/src/sidebar-collapsed-item.tsx`, `ui/layout/src/sidebar-flat-list.tsx`, `ui/layout/src/sidebar-row-context.ts`.

## Account, connect and sheet rows

The rail foot is a person row (portrait, name, workspace line, up-down chevron) so the rail ends on one more member of the same list; the two lines are separate line boxes because `flex-1` would split the row height between them, and they are never concatenated since the package composes no copy. Connect rows show up to three overlapped logo tiles (a fourth only crowds), each an opaque tile with a hairline and no shadow, overlapping 6px; collapsed tiles fit the 36px square. Logos are decorative. Sheet rows (the phone More card) are at least 48px with 16px content inset and 16px type, exported so host rows match. The phone workspace switcher heads the card with the name and a chevron. Lives in `ui/layout/src/sidebar-profile-menu.tsx`, `ui/layout/src/sidebar-connect-group.tsx`, `ui/layout/src/sidebar-connect-logos.tsx`, `ui/layout/src/sidebar-surface.ts`, `ui/layout/src/sidebar-workspace-switcher.tsx`.

## Avatar diameter context

The host builds one icon node per item and the rail renders it in both rail states, so the rail supplies the diameter through context rather than the host. Lives in `ui/layout/src/sidebar-avatar-diameter.tsx`.

## Team glyphs and search

Team marks come from the designer's 16px solid SVG set, generated by `scripts/generate-team-icons.mjs` with pinned fills stripped so marks inherit `currentColor`. Keys are persisted identity: new-set keys resolve directly, renamed equivalents through `LEGACY_SIDEBAR_GROUP_GLYPH_ALIASES`, and retired keys resolve to nothing so the app shows its neutral mark. Glyph search is case- and accent-insensitive across English key words, curated concepts and the caller's localized names and concepts. Some name words carry concepts their labels lack (`search` is labeled "Magnifier"), so they are listed individually rather than through generator tag rules, which would tag every mark a pattern matches and change shelf placement. The concept set is closed and pinned by tests here and the app's locale check. The module uses an explicit `.ts` import extension so node's ESM loader can import it. Group colors store an `id`, not a value, so palettes can be retuned per theme. Lives in `ui/layout/src/sidebar-group-glyphs.tsx`, `ui/layout/src/sidebar-group-glyph-data.ts`, `ui/layout/src/sidebar-group-glyph-search.ts`, `ui/layout/src/sidebar-group-identity-model.ts`.

## Labels

Every word comes from the host as one flat bag with English defaults; keyboard move announcements use `%name%`, `%position%`, `%group%` placeholders. The tab bar scrolls horizontally on narrow screens rather than wrapping. Lives in `ui/layout/src/sidebar-labels.ts` and `ui/layout/src/tab-bar.tsx`.
