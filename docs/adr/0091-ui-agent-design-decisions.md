# ui/agent: design decisions

Covers `ui/agent/` (`@houston-ai/agent`): the agent files list, folder rows, drops, menus and inline rename.

## Files list geometry

All list geometry (column template, row shell, cell classes, header cell) lives in `files-list-chrome.tsx` so header, rows and skeleton never drift. The hover pill bleeds 8px past the text gutter on both sides so it reads as a surface under the row; the rows container pulls that back (`LIST_INSET`) and every row and the header pay it back (`ROW_PAD_X`), together, or columns shift when the header swaps for the selection bar. Columns are Name, Modified, Size, actions; type is carried by the leading mark, so there is no Kind column. Modified and Size are narrow and right-aligned together so they read as one block at the pane's right edge. A checked row has a fill one step under hover, which still paints over it. The sort caret hugs its label. The list draws no rules; spacing and the hover fill separate rows. Lives in `ui/agent/src/files-list-chrome.tsx` and `ui/agent/src/files-list-view.tsx`.

## Depth and indent

A file pads past exactly the chevron (16px) plus gap (4px) a folder draws, so its mark lines up with folder glyphs at the same depth; the chevron sits outside the name wrapper for the same reason. Indent and chevron live in one module because they must agree. Lives in `ui/agent/src/files-list-indent.tsx` and `ui/agent/src/folder-section.tsx`.

## Folder rows

Folder rows use `role="row"`, not `role="button"`, because a button prunes its children and hides the kebab from assistive tech. The list renders the whole workspace and browses by expansion, so a folder expanded onto nothing shows a quiet, non-hoverable empty row on the column grid. A folder states its size as its child count beside the name; the Size cell stays blank rather than inventing data. The count is the true count even when a search pruned children (`folderChildCount`). Implied parent folders get a synthesized entry so the shared file menu works. `list-rows.tsx` and `folder-section.tsx` import each other, which resolves because neither reference is evaluated at module scope. Lives in `ui/agent/src/folder-section.tsx`, `ui/agent/src/folder-empty-row.tsx`, `ui/agent/src/tree.ts`, `ui/agent/src/filter.ts`, `ui/agent/src/list-rows.tsx`.

## File rows and selection

A single click opens a file; the tree-slot checkbox is the only way to select it, because a click that only highlighted was a dead click. Folders are not selectable, since deleting a folder is a heavier act with its own confirm. The selection object's presence is the feature switch: it is built only when the consumer passes `onDeleteMany`. Select all covers the search-filtered rows on screen. The selection is derived against the listing on every render rather than synced, so deleted paths fall out after refetch without effects or races, and a cancelled confirm changes nothing. The checkbox is a real `<input>` transparent over a styled box (keyboard reachable), always visible, with `indeterminate` set as a DOM property so assistive tech agrees with the glyph; its gestures never reach the row. Counted copy arrives as a function of the count so the app owns pluralization. The selection bar replaces the header with the same height and padding. Lives in `ui/agent/src/file-row.tsx`, `ui/agent/src/files-selection.ts`, `ui/agent/src/use-files-selection.ts`, `ui/agent/src/files-checkbox.tsx`, `ui/agent/src/files-selection-bar.tsx`, `ui/agent/src/files-browser-labels.ts`.

## Drops

The container handles all drops; folders only show highlight state and must not stop propagation. The hovered drop target and the DataTransfer entries are captured synchronously before the first await, because the DataTransfer is neutered when the handler returns and later reads could see a newer drag. Folders are walked recursively with `webkitRelativePath` and hidden entries skipped, like the chat composer. `onDropError` is required when `onFilesDropped` is set, because the async walk has no caller to throw to. Lives in `ui/agent/src/drop-zone.tsx`.

## Menus and Escape

File and background menus are portalled and never take focus, so Escape is listened for on the document; the hook keeps one subscription and reads the latest handler from a ref. The agent row's action cell intercepts bubbled menu gestures so they never fold the folder row. Lives in `ui/agent/src/use-escape-dismiss.ts`, `ui/agent/src/file-menu.tsx`, `ui/agent/src/files-agent-row.tsx`.

## Inline rename

The basename is selected only on first focus: a fast user or automated fill may already be typing, and re-selecting made the next keystroke replace typed text (producing names like "Q3 final.pdf.pdf"). Enter and blur commit, Escape cancels. The new-folder row keeps an emphasis ring that now means only "this row is being typed into", and invisible placeholders keep the folder row's geometry. Lives in `ui/agent/src/inline-rename.tsx` and `ui/agent/src/new-folder-input.tsx`.

## Skeleton and previews

The skeleton mounts nothing for its first 150ms, so local reads go straight to the listing without a flash; only slow reads fade it in. It shows three rows, since a tall guess collapsing onto a short listing reads as a glitch, and placeholders are not hoverable. Previews are fetched once visible through one shared hook; object URLs are revoked on change or unmount. A failed preview falls back to the type glyph by design, and real load failures surface when the file is opened. Only images get a thumbnail slot, since text miniatures are unreadable at 32px and observing every row would be waste. Lives in `ui/agent/src/files-skeleton.tsx`, `ui/agent/src/use-file-preview.ts`, `ui/agent/src/file-row-icon.tsx`, `ui/agent/src/types.ts`.

## Dates, sizes and sorting

Modified dates read like a file manager: today's word, a weekday within six days, month and day this year, then with the year; computed by calendar day, locale-driven through `Intl`, and a future timestamp (clock skew) falls to the dated form. Sorting always uses the raw timestamp. Sizes use SI units (1000) like Finder. The search field is capped at `max-w-md`, since a stretched field reads as a search engine, and its clear button stays visible; a search miss echoes the query and offers the way out, hoisted above the view switch so the list gets it too. The agent row's avatar sits on an opaque disc so folder lines never show through. Lives in `ui/agent/src/format-modified.ts`, `ui/agent/src/utils.ts`, `ui/agent/src/files-search.tsx`, `ui/agent/src/files-body.tsx`, `ui/agent/src/files-agent-row.tsx`.
