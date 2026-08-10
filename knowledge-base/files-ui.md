# Files UI

The team view's **Files section** is ONE flat, Finder-style list of every agent's workspace:
each agent is a top-level **folder row** (folder glyph tinted with the agent's colour, small
avatar badge) that expands in place onto that agent's file tree. Library code lives in
`@houston-ai/agent` (props-only, i18n-agnostic); everything app-specific (queries, toasts,
pickers, translations) lives in `app/`.

## One surface: the agent accordion

`app/src/components/team-view/team-files/`:

| File | Role |
|------|------|
| `team-files.tsx` | The section: one shared `FilesColumnBand` (Name / Modified / Size, sortable) over one `TeamFilesAgentSection` per agent. Sort + search state live here and feed every section |
| `team-files-agent-section.tsx` | One agent = `FilesAgentRow` (the folder row) + a `FilesBrowser` (`inFrame`, `depth={1}`, `dragScope={agent.id}`) |
| `team-files-model.ts` | Expansion state: a lone agent auto-expands; multiple agents start collapsed |
| `team-files-toolbar.tsx` | Lives in the page header via `PageHeaderTools`: the search field + the ONE filled `New ▾` menu (Upload files / Upload folder / New folder; a multi-agent team gets a per-agent submenu so a pick always names its target) |

An agent's query stays disabled until first expansion; once expanded the section stays
mounted, so its cached tree and inline state survive collapse. The wiring is
`useAgentFiles(agent, { enabled })` (`app/src/components/agent/agent-files/use-agent-files.tsx`):
the read, every mutation, the label bundles, the overlays, plus `entries` (raw listing —
`undefined` until first read, which is what lets the folder row's item count stay silent for a
never-opened agent). The read is cache-shared with chat attachments and the preview dialog via
`queryKeys.files(agentPath)`; `use-agent-invalidation.ts`'s `FilesChanged` refreshes it. A
failed read renders `AgentReadsFailed` above that agent's rows, naming the agent.

## Component map (`ui/agent/src/`)

| File | Role |
|------|------|
| `files-browser.tsx` | Props surface for one filesystem boundary: header slot, notice, body, drop container, background context menu. `inFrame` = the team accordion owns the horizontal gutter |
| `files-agent-row.tsx` | The agent-as-folder row: chevron, tinted `FolderGlyph` + avatar badge on an opaque disc (the disc hugs the avatar and follows the row's hover fill), name + item count, blank meta cells, actions cell that stops propagation |
| `files-list-frame.tsx` | `FilesColumnBand` — the ONE column-header band at team level |
| `files-list-chrome.tsx` | Every geometry value exactly once: `colGrid()` (fixed four columns: Name `minmax(180px,1fr)` · Modified `minmax(96px,116px)` · Size `minmax(64px,80px)` · actions 44px), `ROW_CLASS` (40px `h-10`, `rounded-lg`, `px-2`, `hover:bg-hover`), `HEADER_ROW` (`h-8`), `ROW_MARK`/`ROW_TILE` (24px `size-6` mark footprint), `ROW_TILE_GLYPH` (`size-4`), `LIST_INSET` (`-mx-2`), `NAME_TEXT`/`META_TEXT`, `HeaderCell` |
| `files-list-indent.tsx` | `BASE_INDENT` 4 + `DEPTH_INDENT` 20/level; `TRIANGLE_AREA` 20 = chevron (16) + 4 gap; `RowIndent`, `DisclosureChevron` |
| `files-list-view.tsx` + `list-rows.tsx` / `file-row.tsx` / `folder-section.tsx` / `folder-empty-row.tsx` | The tree. `list-rows.tsx` and `folder-section.tsx` import each other (the honest shape of a recursive tree). Rows toggle on click, Enter AND Space |
| `file-row-icon.tsx` | A file's mark: the bare type-tinted glyph (`FileTypeGlyphInline` from `@houston-ai/core`) in the shared 24px footprint; small images swap in a rounded thumbnail in the SAME footprint |
| `files-checkbox.tsx` · `files-selection-bar.tsx` · `files-selection.ts` · `use-files-selection.ts` | Selection (see below) |
| `drop-zone.tsx` · `internal-file-drag.ts` | Drag + drop and the scope fence (see below) |
| `files-skeleton.tsx` · `files-search-empty.tsx` · `files-empty-folder.tsx` | Loading + zero states |
| `files-body.tsx` | Picks skeleton → search-empty → empty row → tree, per boundary |
| `kebab-button.tsx` | `KebabButton` + exported `KEBAB_BUTTON_CLASS`, so app-side menu triggers (the agent row's) wear identical geometry |
| `inline-rename.tsx` · `new-folder-input.tsx` · `file-menu.tsx` · `bg-context-menu.tsx` | Row affordances |
| `tree.ts` · `filter.ts` · `format-modified.ts` · `utils.ts` | Flat entries → tree, query pruning, friendly dates, size format + sort |

Type iconography lives in **`ui/core`** (`ui/core/src/components/file-type-icons.tsx` +
`ui/core/src/file-type.ts`): `FileTypeGlyphInline` (bare tinted glyph, sized by the consumer via
`className` — chat's file chips and the file rows share it) and the monochrome `FolderGlyph`.
The `filetype.*` tints render directly on the page, so
`packages/design-tokens/test/contrast.test.ts` guards every family against `--ht-background`,
`--ht-input` AND `--ht-chip-subtle`, both themes.

## The row grammar

The list draws **no hairlines and no icon boxes** — a row is a transparent object; the only
paint is the hover fill under the pointer (`hover:bg-hover`, `rounded-lg`) and the quieter
`bg-chip-subtle` on a checked row. The agent row is LITERALLY a folder row: same grid, same
chevron slot, same mark footprint, name + `files.itemCount` (i18next `count` API), blank
Modified/Size (never invented data), same vertical kebab in the actions column. Width comes
from `LIST_INSET`'s margins, deliberately without `w-full` (an explicit width plus negative
margins would shift the actions column off the file rows' kebabs).

**The checkbox lives IN the tree, not in a gutter.** A folder row shows its disclosure chevron
in the `TRIANGLE_AREA` slot; a FILE row shows its checkbox in that same slot at its own depth —
so a file's checkbox sits directly under its parent folder's glyph and agent folders are the
leftmost thing on the page. Only file rows are selectable; the visible box is 14px with a 24px
input hit area, always visible. While ≥1 file is checked, `FilesSelectionBar` appears in the
`HEADER_ROW` slot with select-all in the same tree-slot geometry; select-all spans the
search-filtered rows. Delete routes through the app's confirm (named for one file, counted for
a batch).

**Opening**: a single click (or Enter) opens a file — OS-open on a co-located desktop, else
`FilePreviewDialog`. Clicking a folder or agent row toggles it. Rename lives in the kebab /
right-click menu.

## Drag & drop scope

Each agent's tree is a filesystem boundary. The drag's scope travels **in the
`DataTransfer` types themselves** (`internal-file-drag.ts`: `internalDragTypes(scope)` adds a
scope-bearing type entry; `dragAllowsScope(types, scope)` reads it back during dragover, where
data is unreadable but types are not). Stateless by design: no module state to go stale when a
dragged row unmounts mid-drag, and external OS drags (no internal type) always highlight.
A cross-agent drop shows NO drop highlight anywhere in the foreign section, and the drop-time
payload check refuses it with `onDropError` as backstop. Drops onto a folder row beat the
section background; the background target is the agent's root.

## Skeleton & empty states

- `FilesListSkeleton` mounts NOTHING for its first 150ms (a local read lands inside that
  window, so expanding goes straight to the listing with zero layout shift); a genuinely slow
  read gets three depth-aware placeholder rows fading in via `.files-skeleton-in`
  (`ui/core/src/globals.css`). The loading region carries an `sr-only` label so it announces.
- An empty agent (and an empty folder) is a quiet `FolderEmptyRow` at the child indent — same
  grid, non-hoverable — with inline Upload / New-folder text actions (24px hit targets).
  Standalone renders are wrapped in `LIST_INSET` so they align with populated sections.
- The search miss is shared; the query prunes each expanded section (`filterFolder`: a folder
  survives if it or a descendant matches, and reports its true child count).

## The preview dialog

`FilePreviewDialog` is a thin shell (load the bytes, size the surface, offer Download);
everything inside its scroll frame is `app/src/components/file-preview-body.tsx`. It branches
on the fetched `content-type` into five states — `image` · `pdf` · `html` · `text` · `binary` —
plus `loading` and an inline `error` (the fetch is toast-free by design).

- **A markdown file previews as a rendered DOCUMENT, not as source** (PRODUCT-1231):
  `isMarkdownFile` routes the text through `MessageResponse` (chat's Streamdown pipeline) under
  the `PREVIEW_MARKDOWN` class (full heading scale, hard `break-words`). `onOpenLink` sends a
  URL to the system browser and a sibling file back into this same dialog.
- **Reader-chosen expand**: a toggle (`files.preview.expand`/`.collapse`) grows the dialog to
  the full viewport and back; resets per file. Collapsed = `min-h-[200px] max-h-[60vh]`,
  always scrolls.
- **HTML files render LIVE** in a sandboxed iframe (`allow-scripts` only, never
  `allow-same-origin`), near-fullscreen (`95vw × 92vh`, sized from the `.html` extension).
  Single-file decks render fully; relative subresources don't resolve.

### Chat links into the preview (`ui/chat/src/file-link-rehype.ts`)

A markdown link an agent wrote in chat (`[Perfil](perfil.md)`) opens this dialog.
`fileLinkRehypePlugin` runs after `sanitize`, before `harden`: it records the decoded path on
`data-file-path` (micromark percent-encodes destinations) and rewrites bare destinations to
`./`-prefixed form (harden blocks bare paths). `markdownFilePath` decides what counts as a
file; `SKIP_TAGS` keeps verbatim content untouched. Siblings: `file-link-text.ts`,
`file-chip.tsx`. Tests: `ui/chat/tests/file-link-rehype.test.ts`,
`packages/web/e2e/chat-markdown-preview.spec.ts`, `chat-link-pill.spec.ts`.

## Data flow

`app/src/hooks/queries/use-files.ts` — `useFiles` (list) plus `useDeleteFile`, `useRenameFile`,
`useCreateFolder`, `useUploadFiles`, `useMoveFile`; every mutation invalidates
`queryKeys.files(agentPath)`. They all call `tauriFiles.*` (`app/src/lib/tauri.ts`) → the host:
`GET files`, `GET files/download`, `GET files/archive`, `DELETE files`,
`POST files/import|move|rename|folder` (`packages/host/src/turn/files.ts`). The web adapter is
`packages/web/src/engine-adapter/client/project-files-mixin.ts`.

Capability gating: `onReveal` / open-in-OS exist only on a co-located desktop (`isTauri()` +
`isCoLocatedEngine()` + `capabilities.revealInOs` + a real `localDir`); otherwise in-app
preview, per-file Download and Download all. Drag-move and folder upload require the TS host.

## Upload path

1. `files-upload-pickers.tsx` remembers the target agent/folder in a ref while the OS picker is
   up, so a picked batch lands where the user aimed.
2. `files-upload-intake.ts` drops hidden files, refuses a batch over `MAX_ATTACHMENT_FILES`
   loudly, then splits by size.
3. `app/src/lib/files-upload-limits.ts` — `MAX_UPLOAD_FILE_BYTES = 100 MiB`, mirroring the
   host's `MAX_UPLOAD_BYTES`; checked (`>=`) BEFORE the encode. An oversized file never aborts
   the batch: the rest uploads and a toast names the offender.
4. `planAttachmentBatches` (`packages/web/src/engine-adapter/cp/files-context.ts`) groups files
   into sequential requests within an 8 MiB / 25-file budget; folder picks carry
   `webkitRelativePath` as `relPath`.
5. The host's 413 is silenced in `tauriFiles.upload` and re-surfaced by `useUploadFiles.onError`
   as calm translated copy.

## Shared file-bytes cache

`app/src/lib/file-bytes-cache.ts` is the single cache for workspace file bytes (row thumbnails
and `FilePreviewDialog`): key `["file-bytes", agentPath, filePath, dateModified]`, infinite
`staleTime`; no mtime → no caching; only `previewKind`-approved files (small images, small
text) are cacheable — everything else streams straight through.

## i18n

`ui/agent` imports no i18n: every string is a `labels`/`menuLabels` prop with an English
default (`files-browser-labels.ts`), filled by `app/src/components/agent/files-tab-labels.ts`
from the `agents` namespace. The agent row's item count is app-side:
`t("files.itemCount", { count })` (`itemCount_one`/`itemCount_other` in en/es/pt).
`selectedCount` stays a function label (pluralization is a language fact the package must not
know). Adding a string = add the key in en/es/pt + the label field.

## Tests

- `ui/agent/tests/` — query pruning + path resolution (`filter.test.ts`), selection collection
  (`files-selection.test.ts`), drag-scope types (`files-drag-scope.test.ts`: external drags
  always allowed, scope round-trips through encoding and browser lowercasing), friendly dates
  (`format-modified.test.ts`).
- `app/tests/files-upload-limits.test.ts` · `app/tests/files-delete-copy.test.ts`.
- `packages/design-tokens/test/contrast.test.ts` — every `filetype.*` tint vs input,
  background and chip-subtle, both themes.
- `packages/web/e2e/files.spec.ts` — the accordion model end-to-end: one shared column band,
  agent rows expanding in place (`getByRole("row", { name: "Expand X files" })`), folders
  folding inline, checkbox-in-tree geometry (a file's box sits at its depth, deeper than its
  agent's row; select-all swaps into the header slot and clears without racing its own
  unmount), search filtering only expanded sections, New naming its target agent.
- `packages/web/e2e/team-routines-files.spec.ts` — the section over real team wiring: multiple
  agent trees in one list, empty agents' inline Upload/New actions, the rail pin ignored,
  failed reads named. Run with unique ports when sibling worktrees are live:
  `HOUSTON_E2E_WEB_PORT=1493 HOUSTON_E2E_FAKE_HOST_PORT=4493 pnpm exec playwright test
  --project=chromium` from `packages/web`.

## Known follow-ups (open, deliberately out of scope)

- Checked files survive a search that hides them, and Delete still acts on them
  (`use-files-selection.ts` derives against the raw listing, the bar against the filtered one).
- The list uses `role="row"` without a `grid`/`treegrid` ancestor (spec-invalid ARIA the e2e
  suite leans on).
- In the team frame the selection bar INSERTS above a section's rows (the column band lives at
  team level), shifting them by its height while files are checked.
- HOU-986 token contrast · HOU-987 core dialog dark mode · HOU-989 search polish · HOU-990
  split `app/src/lib/tauri.ts`.
