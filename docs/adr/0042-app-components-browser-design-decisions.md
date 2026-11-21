# app/src/components/browser: design decisions

Covers `app/src/components/browser/`: the live browser view a person watches during a browser hand-off. File paths in this record are relative to that folder.

## The live browser view is a watcher, not the hand-off

Closing the live browser only stops watching. The hand-off keeps waiting until the person answers or the time runs out. The chat card is the only way in: once the hand-off stops waiting, Open goes away, and a view that is still open shows how it ended until the person closes it. Only the chat whose turn is running can have an unanswered hand-off that is still waiting.

Lives in `app/src/components/browser/browser-live-dialog.tsx`, `browser-handoff-card-host.tsx`, `use-browser-handoff-cards.tsx`.

## Escape belongs to the page

Escape typed into the remote page is forwarded to the page and does not close the dialog.

Lives in `browser-live-dialog.tsx`.

## Initial focus lands on the frame

Opening the view focuses the frame itself (tabIndex -1), not its first control, so the close button does not show a focus ring the moment the view appears. The focus trap and Tab order are unchanged.

Lives in `browser-live-dialog.tsx`.

## Phone and desktop are different component trees

On phones the frame is a full-height bottom sheet rising on the drawer curve; on desktop it is a large dialog scaling in from 0.96. This is a structural fork, so it uses `useIsMobile` rather than `md:` classes.

Lives in `browser-live-dialog.tsx`.
