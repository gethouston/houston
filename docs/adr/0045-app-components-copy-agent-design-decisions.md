# app/src/components/copy-agent: design decisions

Covers `app/src/components/copy-agent/`: the Copy an agent wizard. File paths in this record are relative to that folder.

## Chats are opt-in, everything else starts on

In the "Copy an agent" wizard every item starts on, so the copy is faithful and the user opts out. Chats are the exception and start off, because a conversation can hold personal details the new agent should not inherit.

Lives in `app/src/components/copy-agent/use-copy-agent-wizard.ts`, `copy-content-steps.tsx`, `copy-agent-wizard-model.ts`.

## Only readable sources are listed

Only agents whose content the caller may read appear: the gateway refuses the portable preview of a "user"-access agent.

Lives in `use-copy-agent-wizard.ts`.

## No empty screens

The "what should the copy know" screen always shows. The routines and skills screens exist only when the source has some.

Lives in `copy-agent-wizard-model.ts`.

## The wizard is screens only, inside the sheet's chrome

The way back, progress and Continue belong to the create sheet's header and bottom bar (`add-to-workspace-sheet.tsx`); the wizard renders only its screens. A wizard with its own chrome inside the sheet read as two products stitched together. Because the sheet keeps the wizard state alive across its other screens, leaving the copy path resets the wizard explicitly, or coming back would show a progress bar counting the previous source's screens. The copy itself runs the same portable pipeline as the Settings "Copy agent" row.

Lives in `copy-agent-wizard.tsx`, `use-copy-agent-wizard.ts`.

## Job description row hides the fact fence

The job description file opens with a fenced block of facts; the row shows the job, not the fence.

Lives in `copy-content-steps.tsx`.
