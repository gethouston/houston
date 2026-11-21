# app/src/components/context: design decisions

Covers `app/src/components/context/`: the standing-prose editor behind About me, Company context, Job description and team context. File paths in this record are relative to that folder.

## One standing-prose editor

About me, Company context, an agent's Job description and a team's shared context all use `ContextEditor`, so no surface drifts. It is always open (the greyed rendered example is the invitation), saves on blur only when text changed, shows a quiet Saving/Saved status in a fixed toolbar seat that never moves the document, explains itself once in the surrounding heading, and in read-only mode keeps the same face locked and legible.

Lives in `app/src/components/context/context-editor.tsx`.

## Plain-text fallback for markdown the schema would corrupt

StarterKit has no table, image, task list, footnote or raw HTML node, and tiptap-markdown drops what the schema cannot hold. Agents write these files too, so such constructs are normal, and one keystroke in a rich editor would corrupt them on save. `isWysiwygSafe` screens the seed with patterns (piped and headerless tables, raw HTML, task items, images, reference link definitions); a leading `---` is frontmatter, a mid-document one is a supported rule. A match opens a byte-preserving plain editor. False positives fall back to plain editing, the safe direction. Known limit: only the seed is screened, so markdown pasted into an open rich doc lands as literal text.

Lives in `context-editor-model.ts`, `markdown-editor.tsx`.

## Dirty baseline is the seeded doc's own serialization

Markdown to doc to markdown may normalize bullets and whitespace, so the editor announces the baseline as soon as the doc exists, unconditionally; otherwise a round-tripping prop would leave the baseline unseeded and the first edit would read as clean. The plain fallback echoes its seed verbatim to settle the baseline the same way. Each keystroke echoes back as a `content` prop; only a genuinely different markdown (an external reseed) rebuilds the doc, or the cursor would be lost mid-word.

Lives in `markdown-editor.tsx`, `use-context-editor-save.ts`.

## TipTap handlers read through a ref

TipTap binds event handlers once at construction and `@tiptap/react` never re-registers them, so parent callbacks go through a latest ref. `tiptap-markdown` does not augment `@tiptap/core`'s `Storage` type, so the single cast lives in one helper. The placeholder overlay sets a role so it is not announced as a second textbox.

Lives in `markdown-editor.tsx`.

## Save queue

All writes (blur, unmount flush, read-only flush) go through one promise queue so they land in order and the same text is never submitted twice in a row. The baseline moves with the seed. A reseed during an in-flight save owns the baseline, and an epoch check stops a slow completion stamping stale text. An external update arriving mid-edit is held (newest revision only) and applied on blur if the user typed nothing; dirty text always wins, and after a save any held external revision is older and dropped. A box that turns read-only mid-edit submits what was typed. On failure the data layer owns the toast; the machine resets so "Saving" never sticks and a re-blur retries.

Lives in `use-context-editor-save.ts`.

## Toolbar

Always visible because people writing here do not know markdown. Buttons prevent default on mouse down so focus and selection stay in the document and a style toggle never blurs (which would save). It is a labelled fieldset, not `role="toolbar"`, because that role promises roving tabindex. The pressed fill has its own hover counterpart, since the ghost hover would otherwise blank the active state under the pointer.

Lives in `markdown-toolbar.tsx`.

## Layout modes

`"fill"` pins the card to the height its parents grant and scrolls inside; `{ rows }` is a compact card with a floor of N lines (1.625rem per line plus the `py-4` padding that `border-box` would eat). The editable node carries the card's padding and min height, so a click anywhere places the caret. Body text is 16px, the input floor.

Lives in `context-editor-model.ts`, `markdown-editor.tsx`, `context-editor.tsx`.

## Context slots read through an agent

Workspace context files live at the open agent's workspace root and its runtime reads them into the prompt, so an agent path is the precondition. Once the roster lands empty the state is `noAgent`, said plainly, never an endless spinner.

Lives in `context-slots.ts`, `context-slot-state.ts`, `context-slot-waiting.tsx`.

## Job brief rows

Industry and job are the head of the job description file, drawn as two settings rows that write on pick with no Save. The file stores labels, never ids, so an agent's own edit of the file is a valid answer; the picker finds the chip back with accent- and case-blind matching. Writes leave the description, the other fact and agent-kept frontmatter untouched, and normalize the way the create dialog does. Any job may pair with any industry. Every door into the typed answer goes through one capped write. The picker reuses the create flow's `ChoiceStep`, mounts only while open so it reads the current file, and uses the wide frame for the roughly 180-chip catalog. On phones the value pill takes its own full-width 44px line so typed answers do not truncate.

Lives in `job-brief-rows.tsx`, `job-brief-model.ts`, `job-brief-question.tsx`, `job-brief-picker.tsx`.
