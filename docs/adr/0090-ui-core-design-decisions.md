# ui/core: design decisions

Covers `ui/core/` (`@houston-ai/core`): shared primitives, dialogs and their frame, avatars, the breakpoint, safe-area utilities, theme and event hooks.

## Sidebar primitives

A row's outline variant uses a 1px ring, not a border, because rows have fixed height and a border would make that row a pixel shorter; the ring uses the sidebar's own line token, since shadcn's `--sidebar-border` and `--sidebar-accent` are not defined here. The trailing row action is always visible (no `showOnHover`), per the ban on hover-only affordances. Lives in `ui/core/src/components/sidebar.tsx`.

## Theme tokens and the dark variant

Color token values come from `@houston/design-tokens` (JSON compiled to CSS) and are never edited in `globals.css`. Dark mode is `data-theme="dark"` on `<html>`, not a `.dark` class, so the `dark:` variant keys on the attribute; the `:not()` keeps `dark:` utilities from leaking into a subtree pinned with `data-theme="light"`. This holds because theme.ts only puts "dark" on `<html>` and "light" appears only on pinned subtrees. Palette (`data-palette`) is a second axis whose block lands after the mode blocks, so a pinned light subtree still resolves the Houston light set. Native controls and scrollbars follow the mode through `color-scheme`. Lives in `ui/core/src/globals.css`.

## One breakpoint

The 768px boundary is spelled literally in `globals.css` because a media query cannot read a `var()`. `ui/core/tests/breakpoint-sync.test.ts` pins it to the breakpoint token that `useIsMobile()` reads; change both together. Lives in `ui/core/src/globals.css`.

## Safe-area utilities

`pt-safe` / `pb-safe` pad fixed chrome for the notch and home indicator. `env()` resolves to 0 on desktop and un-notched phones; design padding stacks through `calc`. They need `viewport-fit=cover` in both index.html files. Capacitor 8's SystemBars supplies `--safe-area-inset-*` on older Android WebViews where `env()` reports wrong edge-to-edge insets. Lives in `ui/core/src/globals.css`.

## `@theme inline` and the radius var

`@theme inline` (not plain `@theme`) is required for subtree theme pinning: plain `@theme` emits `--color-*: var(--ht-*)` on `:root`, where the inner var resolves once and only inherits, so a mid-tree `[data-theme]` pin is inert. `inline` writes utilities as `var(--ht-*)` resolved at the consuming element. The trade-off is that no `--color-*` exists on `:root`, so direct consumers must reference `var(--ht-*)`. `--radius` stays a plain `:root` var for the same reason, so `input-group.tsx` and `sonner.tsx` keep resolving it. Lives in `ui/core/src/globals.css`.

## Semantic token roles

`field` / `field-hover`: one token per state so controls never spell a `dark:` fill.

`gutter` is the main canvas tone; it is never named `base`, because a `base` color makes Tailwind emit `text-base` as a color utility that shadows the 16px font size.

The chat pane header wears the screen tone in light and nothing in dark, where a second background over glass shows a seam.

The filled primary button has its own five tokens (fill, label, hover fill, rim in both states), separate from `action`, because imported palettes paint it from their accent.

The user bubble fill and text are tokens (white text in both themes); chips inside the bubble are measured against the bubble. `prose-text` is ink in light and pure white in dark, scoped to chat.

Danger fill and ring soften in dark (60% fill, 40% ring) as single tokens.

Status `-ink` tones exist because the status fills read at 3.4:1 (success) and 2.1:1 (warning) as text on the light canvas, below 4.5:1; they are guarded by `packages/design-tokens/test/contrast.test.ts`. A status fill keeps its `-text` label.

Agent colors are bridged as text utilities for name lines; avatars use inline `var(--ht-agent-*)` because the fill is chosen at runtime.

The file-type palette has ten muted identity hues; folders stay monochrome.

Human avatar tones are desaturated so faces never compete with agent helmets; separate name tones clear 4.5:1 on the bubble.

QR codes are dark on light in every theme, since many scanners reject inverted codes.

`--shadow-*` tiers are Tailwind v4's box-shadow namespace, themed by token.

Lives in `ui/core/src/globals.css`.

## Interface weight 510

The UI weight is 510, delivered as two declarations because Houston ships no webfont. `font-variation-settings` sets 510 exactly on variable system fonts (SF Pro on macOS). `font-weight: 500` is the face-selection anchor: with `font-weight: 510` alone, Windows' static Segoe UI (no 500 face) would match upward to Semibold 600. Lives in `ui/core/src/globals.css`.

## Board drag cursor

The board runs its own pointer-based drag, so one cursor is forced on every OS with an `!important` universal selector (cards rest on `pointer`), and `user-select` is disabled during a drag. The forbidden rule uses two classes so it outranks the grab rule by specificity. The OTP input's fake caret blinks because `input-otp` renders the caret as a DOM node. Lives in `ui/core/src/globals.css`.

## Canvas surfaces

`canvas.css` is the single source of the shared look (aurora glow and glass surfaces) for the app shell, the Agent Store playground and the catalog site, and is imported after `@houston-ai/core`'s `globals.css` so its overrides win. It targets only shared selectors; app-only chrome lives in `app/src/styles/futuristic.css`. Light mode has no aurora (the mesh read as glitter); dark keeps a slow drift. Popovers, menus and modals are solid with no backdrop-filter, because WebView2 does not reliably composite backdrop-filter and modals must never bleed content through. The unframed dialog sheen rule excludes `.ht-shadow-dialog`, since box-shadows do not accumulate and the higher-specificity sheen replaced the elevation tier. The content screen is translucent and frosted with `bg-background` as an opaque fallback; panes are transparent so the aurora shows. The hairline is a 1px inset `outline` (not box-shadow) so it composes with the sheen and Tailwind ring or shadow utilities. The dialog frame's depth comes from the `dialog` elevation tier in the tokens, which re-resolves inside pinned subtrees. The section headings in this file are read by `ui/core/tests/dialog-frame.test.ts`. Lives in `ui/core/src/canvas.css`.

## Portalled submenus

`DropdownMenuSubContent` is portalled, not inline: inline places the submenu's fixed popper inside the parent's overflow box, and WebKit (WKWebView, Safari) clips it so clicks cannot reach it. Chromium does not clip. Lives in `ui/core/src/components/dropdown-menu.tsx`.

## Motion recipes

Motion rules are unlayered and target their own classes; colors are tokens. The ring-only comet variant masks to the 1.5px line because the filled variant hides its interior behind an opaque fill, which leaks on translucent surfaces. The mask color is `black`, not `currentColor`, because a mask reads alpha and `currentColor` inherits the text's alpha. Disclosure, selection-bar and row-arrival entrances are transform and opacity only, about 200ms on the entrance curve, with no closing animation (so a collapsed drop target does not linger). The files skeleton fades in only after its 150ms mount delay, with no base opacity or fill mode, so reduced motion still shows it. Lives in `ui/core/src/motion.css`.

## FormDialog

FormDialog is ConfirmDialog's settled frame with fields in the middle, so form dialogs stop inventing padding, width and button placement. Widths are `sm` and `md` only (larger is a `FlowSheet`), with `sm:` caps so the phone gutter base is not merged away. The secondary control defaults to an `outline` Cancel. A dialog without a description drops `aria-describedby` to tell Radix so.

`onSubmit` may return a promise: the dialog stays open and pending, closes on resolve, and stays open with input intact on rejection (unlike ConfirmDialog, which closes either way). Resolving `false` keeps it open on success, used when a minted API key is shown exactly once. An action without `onClick` closes the dialog; with one, the handler runs and nothing closes, so a "Back" can walk the caller's steps. `secondary: null` is the reveal posture after irreversible work, where a cancel would be a lie. A secondary's promise is passed to its AsyncButton, but a boolean result is dropped since "stay open" belongs to the primary. While the primary's promise is in flight, Escape, overlay and X dismissals are ignored; opening is never refused. The in-flight guard is a ref so it flips in the same tick as the click, before React disables the button. The settle callback does nothing after unmount. Rejections are re-thrown and left unhandled on purpose, so they reach the global handler and Sentry.

Fields sit in a real `<form>` because implicit submission handles Enter in single-line fields, keeps textarea newlines and does nothing while the default button is disabled. The primary is the only submit button and has no `onClick`, so click and Enter take one path. Submit calls `preventDefault` and re-checks disabled, since a caller's own submit control is not covered by the browser's implicit-submission rule. Enter during IME composition is not a submission: `isComposing` plus the legacy 229 keyCode, because Safari fires `compositionend` before the keydown and clears `isComposing`; an IME-committing Enter is cancelled, not ignored, or the browser would submit. The form is separate from the recipe so it can be rendered without Radix's portal, and the logic is split from JSX to be unit tested.

Lives in `ui/core/src/components/form-dialog.tsx`, `form-dialog-form.tsx`, `form-dialog-parts.ts`.

## HoustonEvent

`HoustonEvent` mirrors the host's event enum; apps may extend it. On `AuthRequired`, `user_code` is null for paste-back flows and carries the device-grant code otherwise (the relay may emit twice, URL first, then with the code); `auth_code: true` means `url` is a docs reference that must never be auto-opened, and the UI shows the paste dialog (`shouldOpenLoginUrlDirectly`). The reactivity-reconnected event is a transport fact emitted only on re-connect: the feed has no replay cursor, so consumers re-read. Lives in `ui/core/src/houston-event.ts`.

## Agent name tone legibility

The agent palette was tuned as avatar fills, so as text its legibility is computed at module load against each theme's real chat surface derived from `@houston/design-tokens` (dark is the glass background composited over the gutter), with a 4.5:1 WCAG minimum. Colors that fail in a theme fall back to ink there. Every emitted class is a complete literal because Tailwind scans source text. An unknown id falls back to ink rather than an ungenerated class. Lives in `ui/core/src/agent-name-tone.ts`.

## Folder uploads

A folder arrives through the picker (`webkitdirectory`, which sets `webkitRelativePath`) or a drop, where `DataTransfer.files` flattens folders to nothing, so the drop zone walks `webkitGetAsEntry()` trees and tags each File with an own `webkitRelativePath` property shadowing the read-only getter (the react-dropzone technique). Everything downstream keys off `attachmentRelativePath`, and the host stores `uploads/<folder>/...`. A hard file-count ceiling makes a dropped `node_modules` fail fast; the directory drain bails at the ceiling during reading (readEntries returns at most 100 per call), counting all entries conservatively. Hidden files inside a folder are skipped because the host refuses dot-named segments, while an explicitly picked top-level dotfile keeps its loud rejection. Drop data is captured synchronously because the DataTransfer is neutered after the handler returns. Engines without the entry API keep the flat file list. Lives in `ui/core/src/folder-upload.ts`.

## Model picker

Two levels: connected providers, then a provider's models, with an always-visible back header. Search appears on level two only past 8 models, matching `FilterCombobox`. Disconnected providers never appear; the paths to them are the footer and the empty state's action (which suppresses the footer). The cmdk `Command` is remounted per screen so a stale query cannot keep filtering; focus is placed inside the Command root because cmdk's arrow and Enter handler lives there, and the host popover must not auto-focus. An informational footer is a plain div so it is never focusable and survives filtering. cmdk's `defaultFilter` is re-exported so consumers can wrap it without depending on cmdk. Lives in `ui/core/src/components/model-picker/model-picker.tsx` and `ui/core/src/components/command.tsx`.

## Catalog row

The whole card opens the item: `onClick` lives on the outer element so the `below` tier opens it too, while the body stays the one real button owning the accessible name and focus ring; its keyboard click bubbles to the same handler, so every activation fires once. The outer wrapper is presentational with no key handler (which would fire twice). The `action` slot is a sibling, never nested, and its clicks are excluded. `trailing` sits inside the button and becomes part of its name; `aside` sits outside with pointer events off for information that should be read separately. `below` spans full width from the leading art's x. `scroll-mt` clears the sticky controls bar. Only fill and `scale` transition; `scale` is named because Tailwind v4's scale utilities set the standalone `scale` property. Lives in `ui/core/src/components/catalog-row.tsx`.

## FlowSheet frames

Each step chooses its frame: `compact` (the dialog frame, height from content) for a step asking one short thing, `wide` (tall) for a catalog to scan; one size for every step forced two-answer questions into a screen-sized surface. Heights use `dvh`; both caps use `sm:` to keep the phone gutter, and the wide 42rem cap keeps the gutter inside its `min()` so it reaches full width only at 704px. Frames never transition width or height (layout animation is banned); the step crossfades instead. In `compact` the sheet is the only scroller; in `wide` the body scrolls between a fixed header and a pinned bar (`min-h-0`). The compact step box has no overflow at all, so its 12px entrance cannot scroll it sideways. The parts are not exported from the package index. Lives in `ui/core/src/components/flow-sheet-parts.tsx`.

FlowSheet header and actions: the wide header has three fixed slots (back, progress, aside plus close); the side slots are equal flex tracks and the middle never grows, so progress stays centered across steps. The wide title is screen-reader-only unless requested, since the step carries its own headline. In `compact`, actions sit inline with no rule above; in `wide` the bar is a flex sibling of the scrolling body (pinned without `sticky`) and its phone padding stacks on the home-indicator inset with calc, because `pb-safe` alone would replace the design padding. The wide close X sits in the header row; compact keeps the dialog's X. FlowSheet is solid in both themes and named for the recipe so e2e specs and screen readers find one surface. Lives in `ui/core/src/components/flow-sheet.tsx` and `ui/core/src/components/flow-sheet-parts.tsx`.

## Color contrast maths

WCAG 2.x contrast is computed in one pure module, measured from design tokens, because a color chosen as an avatar fill is not automatically legible as text. It parses only the shapes tokens emit (`#rrggbb`, `rgba(...)`, plus common shorthands) and throws on anything else, including named colors and `color-mix()`, because a half-understood color yields a wrong number. Translucent surfaces must be composited with `flattenColor` first (the dark background is glass over the gutter); `contrastRatio` throws on translucent input. Errors are author-time mistakes and are thrown, never swallowed. Lives in `ui/core/src/color-contrast.ts`.

## Catalog shell

One sticky controls row filters both the installed strip and the available area; the consumer owns the query. The sticky row fades in an opaque popover fill only while rows pass behind it, with an unconditional bottom radius so only the fill animates. The installed section is flat (a bordered card read as a foreign widget). The strip shows a shared capped number of rows before "Show all N", except while filtering. One tab drops the tab chrome; no tabs renders only the installed section. Counts may be preformatted strings such as "9000+". Lives in `ui/core/src/components/catalog-shell.tsx`.

## Houston avatar

`HoustonAvatar` is the single source of agent avatar rendering; the helmet path data and running halo live only here. Colors resolve from `--ht-*` tokens through the employee metal recipe, so hosts must load `@houston/design-tokens`. The default color is the muted-neutral token. The helmet is 65% of the disc with an even-pixel remainder, because an odd remainder puts the glyph on a half pixel. The glyph's viewbox is taller than wide, so height fills the box; path data is exported for canvas `Path2D`. Lives in `ui/core/src/components/houston-avatar.tsx`.

## Catalog plane grid

Catalog sections are quiet (14px and 13px medium) because the page identity lives in the header; nested sub-groups use `h3` so the outline never skips a level. The grid is at most two columns with each cell capped at 23rem; three columns read as crowded and uncapped columns stretch rows into whitespace. `CATALOG_PLANE_MAX_W` (two cells plus gap) lets a surface center the whole column. Columns are container-measured so a catalog in a narrow pane does not inherit the window's columns, and the two-column switch (`@2xl`, 42rem) must sit below the plane max width (46.25rem) or a centered plane could never earn its second column. Lives in `ui/core/src/components/catalog.tsx`.

## Manager avatar

The AI Manager's mark is the helmet on a disc made of the filled primary Button's material (resting fill, 1px inset rim, label color, all from the `--ht-cta*` tokens), inside a thin halo of the same fill separated by empty air. The halo is drawn outside the `size` box (the SVG overflows) so the disc keeps the employee avatar diameter; `managerAvatarDiscForSlot` sizes the disc for hosts whose slot sits flush against an edge. At 24px the halo is a 1px line 1.5px clear; it grows in half-pixel steps, never under 1px. The Button's backdrop blur is omitted because it changes no pixel there. Token colors go through `style` because a `var()` in an SVG presentation attribute does not resolve in every webview. The rim is a 2px stroke clipped to the disc, leaving exactly 1px. `useId` output is sanitized for `url(#...)` references. Decorative; the label is the accessible name. Lives in `ui/core/src/components/manager-avatar.tsx`.

## FlowSheet as the one multi-step surface

Every wizard used to bring its own dialog, so steps of one flow shifted the frame. FlowSheet fixes the frame and lets only the step change; a step's accessible name in `compact` is the visible title, so it should be the step's question. The compact body carries no classes at all. Lives in `ui/core/src/components/flow-sheet.tsx`.

## File-type classification and preview caps

Card thumbnails and text minipreviews are size-capped so the grid never pulls large blobs to paint a preview. Lives in `ui/core/src/file-type.ts`.

## ConfirmDialog

A promise-returning action keeps the dialog open and pending (both buttons disabled, spinner, Esc and overlay refused) until it settles; a sync handler closes as usual. Radix's Action closes after the handler unless prevented, so the async path prevents it. An instant ref guards re-entry against same-frame double clicks, and a mounted flag keeps the settle from touching state after unmount. `finally` resets and closes without swallowing the rejection. `onCloseAutoFocus` lets callers pick where focus lands when the opener was removed. Lives in `ui/core/src/components/confirm-dialog.tsx`.

## Floating nav bar

Only the active item shows its label, inside a darker inner pill: three labels would wrap or shrink below readable size on a narrow phone. The round action button is a create action outside the pill with no active state. A menu item is announced as expanded, never as the current page. Count chips ride the glyph corner when inactive and move to the row's end when active. `pb-safe` is on the landmark and the visual inset on the inner row, since one element cannot carry two bottom paddings. Lives in `ui/core/src/components/floating-nav-bar.tsx`.

## Model picker data contract

The picker sees only a minimal view model (id, provider, name, optional description). Only connected providers and their models are ever visible. Level one shows a neutral loading state while statuses or catalog resolve, so it never flashes "no providers"; once settled and empty, it shows an explained empty state, since an empty list is the normal first state of a new team space. The empty-state action defaults to `onConnectMore`, may be overridden or set to `null` when connecting would not help. The hint wording is the consumer's because it differs per space and role. Lives in `ui/core/src/components/model-picker/types.ts`, `ui/core/src/components/model-picker/catalog.ts`, `ui/core/src/components/model-picker/provider-list.tsx`.

## Session events hook

The hook keeps the handler in a ref, avoiding the listener teardown and missed events that `useHoustonEvent` suffered when handlers were recreated. Apps pass their own Tauri `listen`, so core has no build-time Tauri dependency. A session-status error is echoed as a `Session error:` system message so an uncarded failure is never silent; `feed-to-messages` suppresses it when a typed card covered the turn, and the prefix must stay in sync with `isSessionErrorEcho`. Lives in `ui/core/src/hooks/use-session-events.ts`.

## Responsive popover

Desktop shows an anchored popover; phones show a bottom sheet, because a popover pinned to a small pill goes edge to edge and covers the composer. This is a structural fork, so it reads `useIsMobile()`. `title` is the sheet's heading and accessible name and is not rendered in the popover. Lives in `ui/core/src/components/responsive-popover.tsx`.

## Catalog search field

The placeholder switches to the short label when the full one would not fit, measured in a layout effect so there is no flicker on mount, with 4px of slack so it switches just before clipping. Lives in `ui/core/src/components/catalog-search-field.tsx`.

## File-type icons

The tint is identity, never status. Category-to-tint classes are whole literals because Tailwind scans source text; `data` shares the code hue and `other` the neutral one, so ten hues cover eleven categories. Folders are monochrome. File-type code lives in core because Files surfaces and chat prose must show the same file the same way. Lives in `ui/core/src/components/file-type-icons.tsx` and `ui/core/src/index.ts`.

## Dialog frame

Every dialog (plain Dialog, AlertDialog, FormDialog, FlowSheet, catalog detail) wears one frame defined once, with values taken from the delete confirm. Callers own only the width (`sm:max-w-*`) and `p-0` for self-padded surfaces; caps at or above 40rem are written `sm:max-w-[min(<cap>,calc(100%-2rem))]` to keep the phone gutter. Width is the only place `sm:` is legal; everything else uses `md:`. The scrim is `black/25`, since heavier washes muddy the dark aurora. The surface is `rounded-2xl` with a `border-line/50` hairline and `.ht-shadow-dialog` depth; it uses `grid-cols-[minmax(0,1fr)]` because an implicit auto track refuses to shrink below min-content and one nowrap child pushed the dialog past its max width. `bg-dialog` is solid in both themes, unlike glassy `bg-card`. The close X has one shape (`rounded-lg`, quiet hover plate, Button focus ring). Actions stack bottom-up on phones with the primary nearest the thumb. Lives in `ui/core/src/components/dialog-frame.ts` and `dialog.tsx`.

## Toasts and assistive tech

The toast stack carries its own test handle so tests can ask what it raised rather than counting every live region. Each toast's variant sets its role: `alert` (assertive) for failures, `status` (polite) otherwise. Lives in `ui/core/src/components/toast-container.tsx`.

## AsyncButton

The button disables while the returned promise is in flight, so callers must return the promise. A ref flips the instant the handler runs because a same-frame burst of clicks lands before React applies `disabled`. `finally` resets the guard without swallowing the rejection, which reaches Sentry. Lives in `ui/core/src/components/async-button.tsx`.

## Employee metal

One recipe paints both the badge header and every avatar disc, so they cannot drift: the surface mixes the employee color into the shade, the helmet relief mixes it into the light, and the disc has a faint inset top edge rather than a drop shadow so it holds in dark mode. A numeric form of the mix exists for canvas surfaces and tests. Lives in `ui/core/src/employee-metal.ts`.

## Highlighted text

Ranges are UTF-16 indices; out-of-bounds, empty, unsorted or overlapping ranges are normalized so rendering is one pass. It returns a Fragment so it fits truncating parents. Matching logic stays app-side. Lives in `ui/core/src/components/highlighted-text.tsx`.

## Small primitives

The OTP slots are separate rounded boxes and the active slot uses `border-focus` like other fields (`ui/core/src/components/input-otp.tsx`). Status dots are decorative and need a visible label or `srLabel` (`ui/core/src/components/status-badge.tsx`). An accordion with `indicator="none"` lets the host own its mark's rotation, since the rotate rule targets any direct svg child (`ui/core/src/components/accordion.tsx`).

## Button type defaults to button

HTML defaults a typeless `<button>` to submit, so a plain Button among form fields silently became a second submit control (a dialog saved the previously selected team). Button defaults to `type="button"`; the one submitting control says `type="submit"`. Lives in `ui/core/src/components/button.tsx`.

`asChild` Buttons keep exactly what the caller passed, since `type` is often invalid on the element being styled.

## Compact FlowSheet header

A compact step reads as a confirm dialog: the question top-left in the dialog's type, the back chip (32px, the app's compact BackControl shape) inline before it, and the dialog's own X top-right; `pr-8` keeps long questions clear of the X. Progress sits under the title because the compact frame has no center slot. Lives in `ui/core/src/components/flow-sheet-compact-header.tsx`.

## ScrollArea viewport wrapper

Radix wraps children in an inline-styled `display: table` div that grows to the widest child, so a `w-full truncate` row never shrinks and is clipped. The wrapper is forced to block; wider content still scrolls when a horizontal scrollbar is mounted. Lives in `ui/core/src/components/scroll-area.tsx`.

## Catalog detail dialog

The detail modal exists so the description is shown in full, never truncated; the consumer owns art, tags, CTA and copy. Lives in `ui/core/src/components/catalog-detail-dialog.tsx`.

## useHoustonEvent

The Tauri event module is imported dynamically with a specifier built at runtime, so TypeScript does not resolve it and core has no build-time Tauri dependency; outside Tauri the import fails quietly and no listener registers. Lives in `ui/core/src/hooks/use-houston-event.ts`.

## Catalog row surfaces

`plane` is a flat, transparent row for dense lists; `card` paints a surface and hairline at rest because a self-contained clickable card must read as pressable before it is touched, and answers a press with a scale. The resting hairline is an `outline`, composing with blur and radius; depth never uses a drop shadow. On a card, the focus ring is hoisted to the root, keyed on the body button's own `:focus-visible` (not `:focus-within`, which flashes on mouse press), and drawn by thickening the outline, because the app's glass layer sets `box-shadow` on `.bg-card` from a later stylesheet and would swallow a Tailwind ring. A row that opens nothing claims no press response. Lives in `ui/core/src/components/catalog-row-surface.ts`.

## Agent colors

Palette hexes come from `@houston/design-tokens` so TypeScript and CSS cannot drift. Stored values (id, or an older light or dark hex) resolve to a palette id, defaulting to the first color. Rendering uses `var(--ht-agent-*)` so a theme switch recolors without a re-render; a hex snapshot taken at render goes stale. Lives in `ui/core/src/agent-colors.ts`.

## Flow choice row

A choice is a rectangular button with glyph and title only, using the chip fill and input radius: the pill shape is reserved for actions, and this is one door in a list. Rows stack in one column at every width. Lives in `ui/core/src/components/flow-choice-row.tsx`.

## Model picker navigation

Escape and Backspace are handled on the Command root before Radix closes the popover: Escape first clears an active query, then a second Escape (or Backspace on an empty query) returns to level one. Entering a provider or going back clears the query so each screen opens unfiltered. Level-two rows use the model id as cmdk `value` (names can collide) with the name in `keywords`. Lives in `ui/core/src/components/model-picker/use-model-picker.ts`, `ui/core/src/components/model-picker/nav.ts`, `ui/core/src/components/model-picker/model-row.tsx`.

## Integration action words

One function strips the toolkit's words from an action slug, used by both the workflow step chip (`@houston-ai/skills`) and chat's action labels (`@houston-ai/chat`), which conjugate differently but must agree on which words the toolkit took. Comparison is letters and digits only, word by word, so `google_maps` and `googlemaps` both match `GOOGLE_MAPS_SEARCH`; a word that merely starts like the toolkit is kept; a slug that is only the toolkit returns an empty array for the caller to handle. Imported by deep path, not the barrel, because both consumers run under `node --test`. Lives in `ui/core/src/integration-action-words.ts`.

## Metal engraving

The badge engraving is seeded with FNV-1a over its inputs, joined by NUL so ("ab","c") and ("a","bc") differ, making it stable across sessions and distinct per input. The drawing space overscans above and below so any crop is filled. Lives in `ui/core/src/metal-engraving.ts`.

## Catalog add button

A ghost round button with a full-ink plus; hover fills it with the elevated `input` surface so it pops against the row's hover wash. `busy` shows a full-strength spinner, not a faded disabled look. It is a sibling of the row body. Lives in `ui/core/src/components/catalog-add-button.tsx`.

## Alert dialog parts

The alert dialog adds only widths and part placement on top of the shared frame: `sm` stays narrow and centered at every width and splits its buttons down the middle; `default` uses a grid so the 64px media chip can sit beside the title on desktop. The parts are not exported. Lives in `ui/core/src/components/alert-dialog-parts.ts`.

## Sticky chrome on scroll

`useStuckOnScroll` flips true once a zero-height sentinel at the bar's natural top scrolls past the nearest scrollable ancestor's top, found by walking up the tree, so sticky bars fade in their fill only when rows pass behind. Shared by the catalog shell and the provider browser. Lives in `ui/core/src/hooks/use-stuck-on-scroll.ts`.

## useIsMobile

The hook reads the breakpoint token so it and Tailwind's `md:` cannot drift; a synchronous reader exists for decisions inside effects and handlers, where the hook's post-mount state would still be false. Lives in `ui/core/src/hooks/use-mobile.ts`.

## Progress bar value

The value is passed to the Radix root because Radix derives `aria-valuenow` and `data-state` from it; drawing the fill from the prop alone left the bar announced as indeterminate. Lives in `ui/core/src/components/progress.tsx`.

## Shared type mirrors and login sentinels

`ClaudeInstallError` kinds mirror the engine's enum and must stay in sync; `detail` is for bug reports and never shown verbatim (`ui/core/src/types.ts`). Provider-login sentinel strings double as English defaults and are matched by value in `app/src/lib/provider-login-error.ts`, so they are a contract; the Copilot no-access sentinel mirrors `COPILOT_NO_ACCESS_ERROR` in `packages/runtime/src/auth/login-state.ts` and replaces GitHub's raw body, which carries the user's handle (`ui/core/src/provider-login.ts`).

## Style maps in plain .ts

Status badge and floating nav style maps live in `.ts` modules because the node test runner cannot load `.tsx`. Nav items are at least 44px with press feedback and a visible focus ring. Status labels use the `-ink` variants (see token roles). Lives in `ui/core/src/components/status-badge-styles.ts` and `ui/core/src/components/floating-nav-bar-styles.ts`.

## Provider icon fallback

An app-supplied brand logo wins; otherwise a neutral rounded box with the initial, so the library hardcodes no brand color. The connect-more footer is a `CommandItem` so it is keyboard reachable. Lives in `ui/core/src/components/model-picker/provider-icon.tsx` and `ui/core/src/components/model-picker/connect-more.tsx`.
