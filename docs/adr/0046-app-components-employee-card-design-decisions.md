# app/src/components/employee-card: design decisions

Covers `app/src/components/employee-card/`: the employee badge card, its metal pattern, name validation and deck. File paths in this record are relative to that folder.

## Modules loaded by the node test runner import with `.ts` extensions

`employee-metal-pattern.ts` and `employee-name-validation.ts` import their siblings with explicit `.ts` extensions so the node test runner can load each module on its own.

Lives in `app/src/components/employee-card/employee-metal-pattern.ts`, `employee-name-validation.ts`.

## The badge sizes itself from its own width

The badge uses container queries: narrow, job, industry and color stack; from 672px wide (a badge alone in chat) they sit side by side and the photo panel comes out close to square. A `solo` card never exceeds 672px. The deck is sized by its own room, not the window: three across from 1024px (the new-workspace dialog on desktop), one per row below that (phone and the AI Manager's chat). A row of three keeps cards equal height. The palette reads its column count back from the layout, because the card's width decides it.

Lives in `employee-card.tsx`, `employee-card-deck.tsx`, `employee-card-model.ts`.

## Deck entrance

Cards arrive in order over `duration.elegant` on the entrance curve; past the fifth card the rest arrive together so a long roster does not keep the person waiting. Reduced motion only fades.

Lives in `employee-card-deck.tsx`.

## Engraving is seeded from stable ids

The metal engraving's role half is seeded from the catalog role id, resolved from a label in any shipped language (English first, so a shared label resolves to its English role), else the typed words. The color half is seeded from the palette id for any stored form of a palette color. Seeding from labels or painted values would engrave the same employee differently per language or theme. The engraving is cropped to the panel rather than stretched, since stretching squeezes the waves into zigzags.

Lives in `employee-metal-pattern.ts`, `employee-role-index.ts`, `employee-card-metal.tsx`.

## Only paint crossfades

Material crossfades swap only paint layers; controls stay mounted so the palette trigger keeps focus.

Lives in `employee-card-paint.tsx`, `employee-card-metal.tsx`.

## Name field behavior

A press anywhere on the field, or Tab, selects the whole name so typing replaces it; the focusing press's own mouseup is dropped because it would collapse the selection to a caret. A blank name is an error only after the person tried to continue; other issues show as typed. Copy flows can supply their own wording for a taken name.

Lives in `employee-name-field.tsx`, `employee-name-validation.ts`, `use-employee-name.ts`.

## Placeholder never cut short

The placeholder leads with the job when its full text fits the measured input width (with a small margin for sub-pixel rounding), otherwise it shows the examples alone. Unmeasured, the shortest placeholder is used.

Lives in `employee-name-placeholder.ts`, `use-fitting-placeholder.ts`.

## Brief answers do not submit the card

Enter confirming a brief answer stops at its own frame, because React bubbles it through the portal into the card's form.

Lives in `employee-brief-line.tsx`.

## Foot status is one live region

The foot keeps one region across statuses so each new status is announced politely.

Lives in `employee-card-foot.tsx`.
