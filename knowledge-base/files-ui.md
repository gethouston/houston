# Files UI

The agent's Files tab: a Drive-style card grid (default) and a Finder-style list, over the
host's `files*` routes. Library code lives in `@houston-ai/agent` (props-only, i18n-agnostic);
everything app-specific (queries, toasts, pickers, translations) lives in `app/`.

## Component map

`app/src/components/tabs/files-tab.tsx` renders exactly one library component, `FilesBrowser`,
and supplies every callback. Inside `ui/agent/src/`:

| File | Role |
|------|------|
| `files-browser.tsx` | Props surface + chrome: header, scroll body, drop container (wraps EVERY state), background context menu |
| `use-files-browser.ts` | All state: view mode, selection, sort, query, current folder, drop targeting |
| `files-header.tsx` | Breadcrumbs, search, sort, view toggle, new folder, Upload, reveal / Download all |
| `files-breadcrumbs.tsx` · `files-search.tsx` · `files-header-upload.tsx` · `sort-menu.tsx` · `view-toggle.tsx` | Header pieces |
| `files-body.tsx` | Picks what renders inside the content column: skeleton → search-empty → empty-folder → grid/list |
| `files-grid.tsx` + `file-card.tsx` / `folder-card.tsx` / `new-folder-card.tsx` | Grid view |
| `files-list-view.tsx` + `file-row.tsx` / `folder-section.tsx` / `files-list-chrome.tsx` | List view (column grid, indents, sortable header cells) |
| `files-skeleton.tsx` · `files-search-empty.tsx` · `files-empty-folder.tsx` · `files-empty-state.tsx` | Loading + the three zero states (search miss, empty folder, empty workspace) |
| `file-type-icons.tsx` | Monochrome Lucide glyphs, shared by both views. No colored/Finder-style icons |
| `card-chrome.tsx` (`KebabButton`) · `file-menu.tsx` · `bg-context-menu.tsx` · `inline-rename.tsx` | Row/card affordances |
| `tree.ts` · `filter.ts` · `grid-utils.ts` · `utils.ts` | Flat entries → tree, query pruning, path resolution, sort/format |

App-side helpers: `files-tab-labels.ts` (label bundles), `files-upload-intake.ts` (validation +
toasts), `files-upload-pickers.tsx` (the two hidden inputs), `files-delete-confirm.tsx`
(confirm dialog), `file-preview-dialog.tsx` + `hooks/use-file-preview-loader.ts` (previews).

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

`app/src/lib/file-bytes-cache.ts` is the single cache for workspace file bytes, used by both grid
thumbnails (`use-file-preview-loader.ts`) and `FilePreviewDialog`. Policy:

- Key is `["file-bytes", agentPath, filePath, dateModified]` with infinite `staleTime`; an edited
  file lands on a fresh key. **No mtime → no caching** (bypass, direct download).
- Only files `previewKind` accepts (small images, small text) are cacheable; ask `sharedBytesKey`.
  Anything else — an 80 MB deck opened through the dialog's download fallback — streams straight
  through so blobs never pin memory for zero reuse.

## View scoping, search, i18n

Both views render the OPEN folder (the list shows its subtree), so the breadcrumb is truthful in
either and a view toggle never jumps scope. The search query prunes the tree (`filterFolder`: a
folder survives if it or a descendant matches, and still reports its true child count) and
SURVIVES navigation, so opening a folder you found keeps what you found on screen. Starting a new
folder clears the query rather than creating behind an empty result.

`ui/agent` imports no i18n: every string is a `labels`/`menuLabels` prop with an English default,
and `app/src/components/tabs/files-tab-labels.ts` fills them from `t()` over the `agents`
namespace (`app/src/locales/<lang>/agents.json`, `files.*`). Adding a string = add the key in
en/es/pt + the label field.

## Tests

- `ui/agent/tests/filter.test.ts` — query pruning, path resolution, breadcrumbs, `previewKind`.
- `app/tests/files-upload-limits.test.ts` — the size split and 413 detection.
- `packages/web/e2e/files.spec.ts` — the whole tab against `@houston/fake-host`: grid/list
  navigation, kebab menus, rename/delete confirm, search states, upload targeting, folder upload,
  the size cap, and the empty-workspace fallback. Run with unique ports when sibling worktrees are
  live: `HOUSTON_E2E_WEB_PORT=1493 HOUSTON_E2E_FAKE_HOST_PORT=4493 pnpm exec playwright test
  --project=chromium` from `packages/web`.

## Known follow-ups (open, deliberately out of scope)

HOU-986 token contrast · HOU-987 core dialog dark mode · HOU-988 `getKind` i18n (Finder-style kind
labels are still English in `utils.ts`) · HOU-989 search polish · HOU-990 split `app/src/lib/tauri.ts`.
