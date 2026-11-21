# app/src/components/file-preview: design decisions

Covers `app/src/components/file-preview/`: the file preview panel for Office, PDF, Markdown, HTML and other files. File paths in this record are relative to that folder.

## Loads replace in place

Office files arrive as their converted PDF; PDFs as themselves. The listing's current entry keys every load, so an agent rewrite swaps the new bytes in place without a loading gap, and a reload bringing the same bytes changes nothing. A gone file is a user state with authored copy and no report; anything else reports. A refused conversion reports quietly at capacity and loudly on failure.

Lives in `app/src/components/file-preview/use-file-preview-load.ts`, `preview-bytes.ts`.

## Loading skeletons

The first open shows grey page skeletons at the document's shape (16:9 for decks, portrait otherwise), never a spinner; Office conversion takes 1 to 3 s on the host. Every failure state offers Download so the person can always get the file out.

Lives in `preview-states.tsx`.

## Panel layout

Desktop: a resizable card beside the chat that takes the whole row when there is no room for the minimum chat plus preview plus gap. Phone: a full-screen sheet closed by back. Layout follows the panel's presence, not the store, so nothing reflows until the exit plays. Esc close skips the exit because key repeat makes motion read as lag. Dragging the grip moves the edge directly with no per-frame render and stores the share of the row on release.

Lives in `preview-slot.tsx`, `file-preview-panel.tsx`.

## Comments on paged files

A selection becomes a chip in the chat composer and a numbered mark on the page, linked both ways, numbered across every file in the draft. Without a chat nothing is selectable. A comment lands immediately with the on-screen crop while the sharp crop renders behind it; a send waits for it. Pages dropped by a rewrite flag their comments rather than losing them. Every composer send passes through `prepare`, so no send path loses comments; they leave the draft while the send is out and return unless the engine accepts it. Pill groups are keyed by path because two files can share a name.

Lives in `pdf-preview.tsx`, `use-preview-comments.ts`, `use-citation-composer.tsx`, `cited-submit.ts`, `citation-labels.ts`.

## Markdown renders as a document

A `.md` opened from chat is the agent's deliverable, so it renders through the same Streamdown pipeline as chat, with full heading scale and hard wrapping so long tokens cannot widen the panel. Links open in the system browser or, for a sibling file, in the same panel; Streamdown's default anchor would navigate the whole webview away.

Lives in `file-preview-body.tsx`.

## HTML runs sandboxed in an opaque origin

HTML previews use `allow-scripts` without `allow-same-origin`: decks need JS, but a workspace file must not reach the app's origin, storage or session. The iframe background is white to mirror a browser's default canvas.

Lives in `file-preview-body.tsx`.

## Hints and float bars

The comment hint shows until dismissed or the first selection, once per device; without a chat it explains commenting needs one and shows each opening until dismissed. On phones the native text handles own selection, so a "comment this selection" bar is used. A deleted crop shows no thumbnail without reporting.

Lives in `use-comment-hint.ts`, `preview-float-bars.tsx`, `cited-user-message.tsx`.

## Icon button centering

The header icon button is a fixed 32px square with the glyph centered on the grid, never padding-centered, which drifts with the glyph's box.

Lives in `icon-button.tsx`.
