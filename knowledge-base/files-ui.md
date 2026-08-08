# Files UI

An agent's files: a Drive-style card grid (default, navigated folder by folder with a
breadcrumb trail) and a Finder-style list (the whole workspace, browsed by expanding rows), over
the host's `files*` routes. Library code lives in `@houston-ai/agent` (props-only,
i18n-agnostic); everything app-specific (queries, toasts, pickers, translations) lives in `app/`.

## Two surfaces, one wiring

**TWO surfaces show an agent's files** — the per-agent **Files tab**
(`app/src/components/tabs/files-tab.tsx`) and the team view's **Files section**
(`app/src/components/team-view/team-files/`, one agent at a time behind an agent dropdown;
`knowledge-base/teams-ui.md`). There can only ever be one answer to "what happens when I rename
this file", so neither owns any wiring of its own. Both mount
**`AgentFilesSurface`** (`app/src/components/tabs/agent-files/agent-files-surface.tsx`) and add
nothing but their frame: the tab a pane, the team section its dropdown band.

`app/src/components/tabs/agent-files/`:

| File | Role |
|------|------|
| `agent-files-surface.tsx` | What both surfaces mount: `FilesBrowser` + the overlays + the read-failed strip. Mount it KEYED on the agent id — an open preview, a pending move conflict and a half-answered delete confirm all belong to the agent that owns them (the view mode is the exception: it lives in the UI store, so it is shared) |
| `use-agent-files.tsx` | The whole wiring: the read, every mutation, the label bundles, the four overlays, and `error` / `refetch` / `isFetching` for the strip. Returns props rather than rendering |
| `agent-files-capabilities.ts` | `useLocalFilesAccess` — the ONE answer to "can this deployment hand a file to the OS, and which directory", so a web build and a cloud pod can't offer Reveal on one screen and Download on the other |
| `agent-files-downloads.ts` | The three save-to-my-machine paths (one file, a folder as a zip, the workspace as a zip), split out only for the size cap |

It is also what keeps the read **cache-shared**: the tree comes from `useFiles(agent.folderPath)`
— key `queryKeys.files(agentPath)` — so both surfaces read the SAME cache entry, every mutation's
invalidation lands in one place, and `use-agent-invalidation.ts`'s `FilesChanged` refreshes
whichever of them is on screen. There is no second key and no cross-agent fan-out anywhere in the
Files story (a team's files are never merged into one tree — see `teams-ui.md`).

**A failed read is stated, never swallowed.** An empty tree and a broken tree look identical, so
`AgentFilesSurface` renders `AgentReadsFailed` (`app/src/components/agent-reads-failed.tsx`, the
same strip the team Routines section uses) above the browser, naming the agent and offering Retry
plus the standard Report-bug pill. It pays the `FILES_CONTENT_COLUMN` gutter so its left edge
lands on the listing's.

## Component map

Inside `ui/agent/src/`:

| File | Role |
|------|------|
| `files-browser.tsx` | Props surface + chrome: header, scroll body, drop container (wraps EVERY state), background context menu |
| `files-browser-header.tsx` | Adapter that feeds `FilesHeader` from the hook + props (mirrors `FilesBody`) |
| `use-files-browser.ts` | View mode, sort, query, current folder, drag targeting; composes `use-files-selection.ts` |
| `use-files-selection.ts` | The list's multi-file selection: raw checked paths, DERIVED against the listing |
| `files-selection.ts` | `FilesSelection` / `FilesSelectionLabels`, `collectFilePaths`, `buildFilesSelection` (no React) |
| `use-files-drop-target.ts` | Where a drop lands: hovered folder wins, else the view's own root |
| `files-header.tsx` | The header band + `FILES_CONTENT_COLUMN`; toolbar, plus the trail when the grid is inside a folder |
| `files-toolbar.tsx` | Row 1: the search slot (`flex-1`, field capped inside it) · the New pill · download-all/reveal glyph · sort glyph · view tabs |
| `files-new-menu.tsx` | The one filled pill: Upload files / Upload folder / New folder |
| `files-breadcrumbs.tsx` | Row 2: the path trail — grid-only, and only below the root |
| `files-search.tsx` · `sort-menu.tsx` · `view-toggle.tsx` · `crumb-button.tsx` | Header pieces |
| `files-body.tsx` | Picks what renders inside the content column: skeleton → search-empty → empty-folder → grid/list |
| `files-grid.tsx` + `file-card.tsx` / `folder-chip.tsx` / `new-folder-chip.tsx` | Grid view |
| `files-list-view.tsx` + `list-rows.tsx` / `file-row.tsx` / `folder-section.tsx` / `folder-empty-row.tsx` / `files-list-chrome.tsx` / `files-list-indent.tsx` | List view. `files-list-chrome.tsx` is the ONE source of geometry (column template, row shell, cell classes); `files-list-indent.tsx` is how a row states depth; `list-rows.tsx` is the level dispatcher — it and `folder-section.tsx` import each other, which is the honest shape of a recursive tree (neither reference is evaluated at module scope) |
| `files-checkbox.tsx` · `files-selection-bar.tsx` | The gutter checkbox (checked / indeterminate) and what the column header becomes while files are checked |
| `files-skeleton.tsx` · `files-search-empty.tsx` · `files-empty-folder.tsx` · `files-empty-state.tsx` | Loading + the three zero states (search miss, empty folder, empty workspace) |
| `file-type-icons.tsx` | `FileTypeTile` (outlined tile + type-tinted Lucide glyph, both views) + the monochrome `FolderGlyph` and the card's large fallback glyph |
| `use-file-preview.ts` | `useVisibleOnce` + `useFilePreview`: the ONE lazy byte-loading machine behind both the grid card and the list row |
| `file-card-preview.tsx` · `file-row-icon.tsx` | The two consumers of it: the card's hero panel, the row's 32px thumbnail |
| `format-modified.ts` | Pure friendly-date helper for the Modified column (Today / weekday / date) |
| `card-chrome.tsx` (`KebabButton`) · `file-menu.tsx` · `bg-context-menu.tsx` · `inline-rename.tsx` | Row/card affordances |
| `tree.ts` · `filter.ts` · `grid-utils.ts` · `utils.ts` | Flat entries → tree, query pruning, path resolution, size format + sort |

App-side helpers, all consumed through `use-agent-files.tsx`: `files-tab-labels.ts` (label
bundles), `files-upload-intake.ts` (validation +
toasts), `files-upload-pickers.tsx` (the two hidden inputs), `files-delete-confirm.tsx` +
`files-delete-copy.ts` (the confirm dialog and its pure, unit-tested copy),
`file-preview-dialog.tsx` + `hooks/use-file-preview-loader.ts` (previews). The dialog
renders HTML files LIVE in a sandboxed iframe (`allow-scripts` only, never
`allow-same-origin` — the blob document runs in an opaque origin, so agent-built decks
run their JS without reaching the app's origin/session), in a near-fullscreen dialog
(`95vw × 92vh`, sized from the `.html` extension so it opens full-size — decks are
mostly 16:9 and need the window's horizontal shape);
single-file decks render fully, relative subresources don't resolve (blob URLs have no
base path).

## Layout (a minimal library's structure in Houston's tokens)

`FILES_CONTENT_COLUMN` (`files-header.tsx`) is `w-full px-6`: header, grid, list, skeletons and
zero states all use the pane's FULL width with one shared gutter. There is no reading-column cap.

**The page is borderless — completely.** There is no rule under the header band, none under the
list's column headers, none between list rows, and no ring around the view tabs; vertical rhythm is
spacing alone. The ONLY hairlines left anywhere in the tab are the deliberate outlines that carry
meaning: the search field, the `FileTypeTile`, popovers/menus, and every focus ring. Nothing
structural is drawn, which is exactly what lets the list's ONE painted surface — the hover fill
under the row you are pointing at — be the thing the eye follows.

The header is a one-or-two-row band on one wrapper carrying the gutter for every row (`pt-4 pb-3`):

- **Row 1, utilities** (`files-toolbar.tsx`): `[search slot flex-1] [New ▾] [download-all/reveal]
  [sort slot] [view tabs]`. Search **caps at `max-w-md`** inside its `flex-1` slot: a field
  stretched across a 1400px window read as a search engine rather than as a filter over the
  listing, and nobody types 400 characters of filename. Past the cap the slack becomes the gutter
  between the field and the control cluster, which stays anchored to the pane's right edge, in line
  with the listing's own right edge. Every control is **36px tall (`h-9`) with 16px glyphs** — this band is
  chrome, and at 40px/20px it competed with the listing for weight. Exactly ONE control is loud:
  **New** (`files-new-menu.tsx`), a filled `bg-action` pill with a chevron opening Upload files /
  Upload folder / New folder, each item gated on its handler. It replaced a separate Upload pill
  AND a New-folder button — three pills competing for the same corner. Everything after it is an
  icon-only ghost: download-all (or reveal-in-OS on a co-located desktop) and the sort glyph, both
  carrying `aria-label` + `title` since they have no visible text. Sort stays grid-only (the list
  sorts from its columns) but its `size-9` slot is reserved in BOTH views, so toggling never slides
  the tabs under the cursor. The view tabs are two bare `size-9` glyph buttons, the active one
  filled with `chip-solid-hover` (`chip-solid` sat within a hair of both canvases and read as
  unpressed).
- **Row 2, location** (`files-breadcrumbs.tsx`): the trail, `h-9` with `text-sm` crumbs and 16px
  chevrons/house, rendered ONLY when `view === "grid"` and the open path is not the root. The grid
  is the only view that walks folder by folder; at the root a lone root crumb repeats what the pane
  already says, and the list browses by expanding rows, so both cases collapse the band to the
  toolbar alone. Every crumb stays a drop target, the open folder is the emphasized final crumb.

On an empty workspace the band keeps its place: only the controls with nothing to act on (search,
the sort slot, the view tabs) step aside, so New and the download glyph never jump away. New
renders there on purpose — creating the first folder has to come from somewhere. There is no trail
either: the root has no path to state.

## Opening vs selecting

A **single click opens** a file, in both views (`onOpen` → OS-open on a co-located desktop, else
`FilePreviewDialog`). Enter on a focused row/card does the same. There is no click-to-select and no
selected ring anywhere in the tab: a click that only highlighted was a dead click, and it collided
with the gesture people actually wanted. Rename moved entirely to the kebab / right-click menu
(it used to be Enter-on-selected). Folders are unchanged: click navigates in the grid, toggles
expansion in the list.

**Selecting is the checkbox, and only in the list view.** The whole capability hangs off ONE prop:
`FilesBrowser` builds a `FilesSelection` (`files-selection.ts`) only when the consumer passed
`onDeleteMany`, and its presence is what draws the gutter column at all — a browser with nothing to
do with a selection renders no checkbox.

- State lives in `use-files-selection.ts` as a raw `Set<string>` that is **derived** against the
  current listing on every render, never synced by an effect. That is load-bearing: when the app
  deletes the checked files and the query refetches, the deleted paths fall out of the selection by
  themselves, while a CANCELLED confirm leaves every check exactly where the user put it.
- Only FILE rows are selectable. A folder row keeps an empty gutter cell — deleting a folder takes
  everything inside it, which is a heavier act with its own named confirm.
- `FilesCheckbox` (`files-checkbox.tsx`) is a real `<input type="checkbox">` at `opacity-0` over a
  styled box (the same construction `ui/board`'s cards use — there is no `Checkbox` in
  `@houston-ai/core`). It is **always rendered and always visible** at `border-ink-muted/40`; row
  hover only strengthens it to `border-ink`. Never hover-only. Its `onClick`/`onChange`/`onKeyDown`
  all stop propagation, or a check would also open the file.
- The column-header row carries a select-all box in the same gutter, indeterminate on a partial
  selection (set as a DOM property via ref, not just as a glyph). "All" spans the SEARCH-FILTERED
  rows (`collectFilePaths(visibleFolder)`), never rows a query pruned away.
- While ≥1 file is checked, `FilesSelectionBar` REPLACES the column-header row in the same 40px
  slot (so nothing below moves): select-all box, `selectedCount(n)`, a `text-danger` Delete, and a
  clear (X). No border, no fill — chrome on the canvas, like the header it replaces.
- Delete routes through the app's existing confirm (`files-delete-confirm.tsx`), which now speaks
  two copies from one dialog: the kebab NAMES its target, the selection bar COUNTS it
  (`files.delete.batchTitle`, pluralized). `use-agent-files.tsx` then fires one
  `useDeleteFile.mutate` per file, so each keeps the same `call()` toast path — a failure on file 3
  of 5 is still reported by name.

Grid = two groups, no headings — the grouping is the layout (`files-grid.tsx`):

- **Folders first**, as one-line chips (`chipClass`, 48px tall, glyph + name + child count +
  trailing kebab) in `repeat(auto-fill,minmax(14rem,1fr))`. The inline new-folder chip opens this
  group. `auto-fill` (never `auto-fit`) is load-bearing: empty tracks keep a lone folder chip at
  its natural width instead of stretching it across the window.
- **Files after**, as hero cards (`cardClass`, `h-64`) in `repeat(auto-fill,minmax(16rem,1fr))`: a
  one-line title row (type icon + name + kebab) over a preview panel that takes every remaining
  pixel (`cardPreviewClass` = `flex-1`, 8px inset, radius concentric with the card's 12px). Cards
  carry no date row — sort feedback lives in the header, the preview is the card.

List = the **whole workspace tree, always rooted at the workspace**, browsed by expanding folder
rows in place (`FolderSection`, open by default). It is deliberately NOT scoped to the grid's open
folder: the trail is grid-only now, so inline expansion is the list's only way around, and a list
that silently inherited the grid's folder would have no way to say where it was. Toggling
list→grid returns to the folder the grid still remembers; grid→list always shows everything.
A folder expanded onto zero children renders a quiet `emptyFolderLabel` row at the child indent,
so an open chevron over blank space never reads as a listing that failed to load.

### The row language: no rules, one fill

The list draws **no hairlines at all** — not under the column headers, not between rows, not
around anything. It is the flat "plane" row language (`knowledge-base/design-system.md`) taken to
its conclusion: a row is a transparent OBJECT, the separator between two rows is the height of the
rows themselves, and the only thing that ever paints is the row under the pointer. The previous
build drew an inset hairline per row (each non-gutter cell carrying its own `border-b`, so the line
started at the item icon); at eight rows on a borderless page those eight lines were the loudest
thing on the screen and fought the grid's airy cards. Removing them is what lets a 14px medium
filename read as a clear step above its 12px muted metadata instead of competing with chrome.

Every geometry value lives once, in `files-list-chrome.tsx` — the header, the rows, the
new-folder row and the skeleton all read the same constants, or the columns drift:

- **`ROW_CLASS`** — `h-13` (52px), `rounded-xl`, `px-2`, `hover:bg-hover`, focus ring. The hover
  pill bleeds 8px past the text gutter on both sides so the fill reads as a surface UNDER the row
  rather than a box drawn around it: the rows container pulls that back out (`LIST_INSET` =
  `-mx-2`) and every row plus the column header pay it back. They move together, or the columns
  shift the moment the header swaps for the selection bar.
- **`ROW_CHECKED`** (`bg-chip-subtle`) — a CHECKED row keeps a quieter fill of its own, one step
  below hover (which still paints over it). A selection used to be legible only by counting 16px
  boxes. This is not a click-selected state: a click still opens, and nothing ever sits
  highlighted-and-idle.
- **`colGrid(selectable)`** — `SELECT_COL` 36px (only when selectable) · Name `minmax(0,1fr)` ·
  Modified **116px** · Size **80px** · actions 44px. Both metadata columns are **right-aligned and
  packed** (`META_CELL` carries `justify-end`): ragged-left dates ending on the same x read as a
  column, and it puts Modified within one glance of Size instead of leaving two islands adrift in
  the middle of the row.
- **Type**: `NAME_TEXT` = `text-sm font-medium text-ink`, `META_TEXT` = `text-xs text-ink-muted`.
  A real weight AND size step, not the same size in grey.
- **`ROW_TILE`** / `ROW_TILE_GLYPH` — `size-8 rounded-lg` / `size-5`. The type tile and the image
  thumbnail wear the SAME box, so a listing of mixed types keeps one unbroken icon column.
- **Indent** (`files-list-indent.tsx`): `BASE_INDENT` 4 + `DEPTH_INDENT` 24/level, and a FILE row
  pads past `TRIANGLE_AREA` (24 = chevron + gap) so its tile lines up with the folder glyphs at its
  own depth. `RowIndent` is a spacer span rather than padding on the cell, so both row kinds
  compose it identically and the icon column can never staircase down the tree.
- **Header** (`HEADER_ROW`, `h-9` + the same `px-2`): sortable cells at `text-xs font-medium
  text-ink-muted`, the Name label indented to sit over the item ICONS, the caret hugging its label.
  No underline.

A **folder row** is distinguished by its chevron, its glyph and its **child count** beside the name
(`folderChildCount`, the folder's TRUE size — a search prunes children, it never shrinks a folder),
not by a different row shape: it keeps the same height, the same fill and the same columns, with a
blank Size cell because a folder has no size of its own. The recursive expansion is a Houston
feature Drive lacks; it stays, and it is the list's only way around (the trail is grid-only).
A folder expanded onto zero children renders a quiet `emptyFolderLabel` row at the child indent,
non-hoverable (`hover:bg-transparent` — there is nothing there to act on).

`FilesSelectionBar` replaces the column-header row in the same `HEADER_ROW` slot (so nothing below
moves) and **arrives on a 200ms entrance** — `.files-selection-bar-in` in `ui/core/src/globals.css`,
opacity + `translateY(-4px)` on the entrance curve, `prefers-reduced-motion` respected. A silent
swap of the row above the listing was easy to miss.

List = the **whole workspace tree, always rooted at the workspace**, browsed by expanding folder
rows in place (`FolderSection`, open by default). It is deliberately NOT scoped to the grid's open
folder: the trail is grid-only, so inline expansion is the list's only way around, and a list that
silently inherited the grid's folder would have no way to say where it was. Toggling list→grid
returns to the folder the grid still remembers; grid→list always shows everything. `SortKey` is the
same three (`name` / `dateModified` / `size`) in the column headers and the grid's sort menu.

`files-skeleton.tsx` mirrors both layouts one-for-one (chip row + hero cards / the real
`ROW_CLASS` geometry with the checkbox gutter, a `ROW_TILE`-sized placeholder and the same column
template) so nothing shifts when the listing lands. Its rows carry `hover:bg-transparent`: a fill
chasing the cursor over dead placeholders reads as a listing that is already interactive. `FilesListSkeleton` reads `selectable` from the PROP
(`!!props.onDeleteMany`) rather than from the built selection, which needs a listing to exist —
otherwise the columns would jump sideways the moment the listing landed.

## Data flow

`app/src/hooks/queries/use-files.ts` — `useFiles` (list) plus `useDeleteFile`, `useRenameFile`,
`useCreateFolder`, `useUploadFiles`, `useMoveFile`; every mutation invalidates
`queryKeys.files(agentPath)`. They all call `tauriFiles.*` (`app/src/lib/tauri.ts`), which goes
through the engine client to the host: `GET files`, `GET files/download`, `GET files/archive`,
`DELETE files`, `POST files/import|move|rename|folder` (`packages/host/src/turn/files.ts`).
The web adapter implements them in `packages/web/src/engine-adapter/client/project-files-mixin.ts`.

Capability gating: `onReveal` / `onOpen`-in-OS and `onRevealAgent` exist only on a co-located
desktop (`isTauri()` + `isCoLocatedEngine()` + `capabilities.revealInOs` + a real `localDir`);
otherwise the tab offers in-app preview, per-file Download and Download all. Drag-move and
folder upload require the TS host (`newEngineActive()`).

## Upload path

1. `files-upload-pickers.tsx` remembers the open folder in a ref while the OS picker is up, so a
   picked batch lands where the user is looking (null = workspace root), exactly like a drop.
2. `files-upload-intake.ts` drops hidden files (`visibleAttachmentFiles`), refuses a batch over
   `MAX_ATTACHMENT_FILES` loudly, then splits by size.
3. `app/src/lib/files-upload-limits.ts` — `MAX_UPLOAD_FILE_BYTES = 100 MiB`, mirroring the host's
   `MAX_UPLOAD_BYTES` (`packages/host/src/turn/files-import.ts`). The check is `>=` (the host's
   base64 estimator rounds up) and runs BEFORE the encode. An oversized file never aborts the
   batch: the rest uploads and a toast names the offender.
4. `planAttachmentBatches` (`packages/web/src/engine-adapter/cp/files-context.ts`) groups files
   into sequential requests within an 8 MiB / 25-file budget, well under the host cap; folder
   picks carry `webkitRelativePath` as `relPath` so structure survives.
5. The host's 413 is silenced in `tauriFiles.upload` (`{ silence: isUploadTooLargeError }`) and
   re-surfaced by `useUploadFiles.onError` as calm translated copy — an expected state, never the
   red report-a-bug toast. It is defense in depth against the two caps drifting apart.

## Shared file-bytes cache

`app/src/lib/file-bytes-cache.ts` is the single cache for workspace file bytes, used by the grid
card thumbnails, the list row thumbnails (both through `use-file-preview-loader.ts`) and
`FilePreviewDialog`. Policy:

- Key is `["file-bytes", agentPath, filePath, dateModified]` with infinite `staleTime`; an edited
  file lands on a fresh key. **No mtime → no caching** (bypass, direct download).
- Only files `previewKind` accepts (small images, small text) are cacheable; ask `sharedBytesKey`.
  Anything else — an 80 MB deck opened through the dialog's download fallback — streams straight
  through so blobs never pin memory for zero reuse.

## View scoping, search, i18n

The two views render different roots (`use-files-browser.ts`, `scopedFolder`): the GRID renders the
open folder, the LIST renders the whole tree. Three behaviours follow from `view === "grid"` and
must move together — change one and change all three:

| Concern | Grid | List |
|---|---|---|
| `visibleFolder` (what renders) | the open folder | the tree root |
| `resolveDropTarget` background drop (`use-files-drop-target.ts`) | the open folder | the root |
| `createFolderAt` / `uploadHere` target | the open folder | the root |

A drop straight ONTO a folder chip or row (`useFolderDropTarget` → `onDragActive`) always wins over
the background target, in both views, so a list drag still files into any folder without a trail.
The inline new-folder row sits at the list's root level, which is where `createFolderAt` puts it.

The search query prunes whatever that view renders (`filterFolder`: a folder survives if it or a
descendant matches, and still reports its true child count) — so a list search reaches the entire
workspace while a grid search stays inside the folder you are looking at. It SURVIVES navigation,
so opening a folder you found keeps what you found on screen. Starting a new folder clears the
query rather than creating behind an empty result.

Zero states follow the same split: the empty-FOLDER state is a grid state (the list is rooted at
the workspace, so an empty root is the empty-workspace state and an empty folder inside it says so
on its own row); the search miss and the loading skeleton are shared.

`ui/agent` imports no i18n: every string is a `labels`/`menuLabels` prop with an English default,
and `app/src/components/tabs/files-tab-labels.ts` fills them from `t()` over the `agents`
namespace (the failure strip is app chrome and speaks `shell:agentReads.*`) (`app/src/locales/<lang>/agents.json`, `files.*`). Adding a string = add the key in
en/es/pt + the label field.

**One label is a FUNCTION, deliberately**: `selectedCount?: (count: number) => string` (default
``(n) => `${n} selected` ``). A count needs pluralization, and pluralization is a language fact
this package must not know — so the app passes a closure (`(count) => t("files.selectedCount",
{ count })`) and `ui/agent` just calls it. Same shape as `BulkActionBarLabels.selected` in
`ui/board`. Prefer this over letting a preformatted string in: a preformatted string would have to
be recomputed by the consumer on every selection change. The rest of the new labels are plain
strings: `newMenu` · `selectRow` · `selectAll` · `deleteSelected` · `clearSelection`. The old
`upload` label is gone with the Upload pill; `uploadFiles` / `uploadFolder` / `newFolder` live on
as the New menu's items.

## Tests

- `ui/agent/tests/filter.test.ts` — query pruning, path resolution, breadcrumbs, `previewKind`.
- `ui/agent/tests/files-selection.test.ts` — `collectFilePaths`: nesting, depth-first render order,
  files only, and that it never mutates the tree.
- `app/tests/files-upload-limits.test.ts` — the size split and 413 detection.
- `app/tests/files-delete-copy.test.ts` — which words a destructive question asks with: named for a
  single target (file vs folder description), counted through the plural API for a batch.
- `ui/agent/tests/format-modified.test.ts` — every branch of the friendly date, plus locales.
- `packages/design-tokens/test/contrast.test.ts` — each `filetype.*` tint on the tile, both themes.
- `packages/web/e2e/team-routines-files.spec.ts` — the team Files section over the same wiring:
  ONE agent's real tree, the dropdown switching which, arriving on the rail's pinned agent, a write
  landing on that agent, and a failed read naming it instead of showing an empty tree.
- `packages/web/e2e/files.spec.ts` — 35 tests over the whole tab against `@houston/fake-host`:
  grid/list navigation, click-opens-preview, the HTML preview (uploaded `.html` opens as a
  RENDERED sandboxed iframe — script ran, `sandbox="allow-scripts"` asserted, no source dump),
  the checkbox gutter (partial/indeterminate/select-all,
  folders excluded), the counted batch delete through one confirm (cancel preserves the checks),
  row thumbnails, the New menu driving every upload + new-folder flow, the icon-only Download all,
  kebab menus, rename, the named single delete, search states, folder upload, the size cap, the
  move-conflict dialog, the empty-workspace fallback, the search field CAPPING instead of growing
  with the window (while the control cluster stays right-anchored), and two computed-style
  assertions that carry the row language: the header band, the column-header row, the row and its
  Name cell all have `border-bottom-width: 0px` while a hovered row paints a non-transparent
  `border-radius: 12px` fill, and a CHECKED row keeps a fill after the pointer leaves. Run with
  unique ports when sibling worktrees are live: `HOUSTON_E2E_WEB_PORT=1493
  HOUSTON_E2E_FAKE_HOST_PORT=4493 pnpm exec playwright test --project=chromium` from
  `packages/web`.
  The fake host imports the real host's `mimeFor` for `files/download`, so an uploaded PNG comes
  back as `image/png` against the mock exactly as in production — thumbnails are testable without
  any spec patching the header.

## Known follow-ups (open, deliberately out of scope)

HOU-986 token contrast · HOU-987 core dialog dark mode · HOU-989 search polish · HOU-990 split
`app/src/lib/tauri.ts`. (HOU-988 `getKind` i18n is moot: the Kind column and `getKind` are gone —
the icon tile states the type without words to translate.)
