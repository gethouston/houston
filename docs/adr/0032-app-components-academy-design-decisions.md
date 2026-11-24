# app/src/components/academy: design decisions

Covers `app/src/components/academy/`: the Academy lessons, their step runner, spotlight and rank display. File paths in this record are relative to that folder.

## Node-loaded modules import with `.ts` extensions

`academy-rank-progress.ts` imports with an explicit `.ts` extension: `app/tests` runs under node's `--experimental-strip-types`, whose ESM resolver does not guess extensions.

Lives in `app/src/components/academy/academy-rank-progress.ts`.

## Lesson ids are copy keys

Every beat resolves its words under `lessons.<lessonId>` in the `academy` namespace, where the shared chrome also lives, so ids must avoid the chrome's reserved keys (`exit`, `progress`, `stepCount`, `video`) and stay lowercase slugs; `academy-lesson-registry.test.ts` checks both against the English locale. Copy keys are built at runtime, which the compile-time key union cannot express, so the single loosening cast lives in `lesson-copy.ts` and the registry test asserts every resolved key exists. Registry entry order is the chapter's lesson order. Lookups are own-property only so ids like `toString` resolve to nothing. Panel and companion ids map to components in one place each so specs stay plain data.

Lives in `lessons/registry.ts`, `lessons/lesson-copy.ts`, `lessons/lesson-panel.tsx`, `lessons/lesson-companion.tsx`.

## Targets that exist at both breakpoints

A beat target lists the desktop control and the phone's way to it; the spotlight lights the first match on screen, and the two are never on screen at once.

Lives in `lessons/registry.ts`.

## One record, one start rule

The status header and the path both read one stored record (`useAcademyProgress`), so rank and path never disagree. A run opens where the user left (`lessonStartIndex`), the same rule the path's Continue reads, and waits for the record before its first beat so it never plays a beat and then jumps. An unreadable record opens on beat one in the runner. On the Academy page an unread record looks like an empty one, so a failed load replaces the whole page with a retry, and loading shows skeletons, never a guessed "Start". A lesson retired while armed clears its overlay.

Lives in `academy-view.tsx`, `academy-path.tsx`, `academy-path-state.ts`, `lessons/lesson-runner.tsx`.

## Position kept on arrival

The beat reached is written on arrival, not on exit, because a run can end without any exit path (closed window, crash). The finish clears the place instead. Progress queries are refreshed after writes because the Academy screen is kept alive rather than remounted.

Lives in `lessons/use-lesson-position.ts`, `lessons/use-lesson-award.ts`, `lessons/use-lesson-run.ts`.

## Run machine

The advance decision is the pure `lessonAdvance` over what `useLessonSignals` reads; the hook only carries it out. The finish pays real experience so it is armed once, even if a signal stays true through the unmount commit. One started event per run. A beat that needs a location navigates as it arms; the first beat of a resumed run is an opening and starts wherever the user is. A chapter completion event fires exactly once, counting only lessons this deployment can teach. Lessons are always abandonable.

Lives in `lessons/use-lesson-run.ts`, `lessons/use-lesson-award.ts`.

## Escape is trusted-only and owned by the runner

Escape leaves the lesson on every beat, captured on `window` so the docked dialog never closes on its own and the whisper beat exits the same way. Only trusted keys count, because the app dispatches synthetic Escapes at open modals when leaving kept-alive screens (`app/src/components/shell/keep-alive-views.tsx`). The docked panel also ignores outside clicks so a stray click beside a playing video does not abandon the beat.

Lives in `lessons/use-lesson-run.ts`, `lessons/lesson-arming.ts`, `lessons/lesson-docked-panel.tsx`.

## Arming: no blind window

A beat that compares the world against a snapshot is blind until the snapshot exists; a click in that window becomes part of the baseline and strands the run. So the spotlight keeps the veil whole (no hole, full blockers) until the beat is armed. View and event beats have no blind window (the event subscription attaches before paint); state reads (a connection) need no snapshot; companion beats wait for their companion's note.

Lives in `lessons/lesson-arming.ts`, `lessons/lesson-spotlight.tsx`.

## Signals add no fetches

Signals read queries the app already maintains (the cross-agent sweep, the connections list). All readings reset when the beat changes, adjusted during render so a beat never runs one commit against the previous beat's world. The baseline is taken from the first settled sweep after arming. Connections are read only while a beat waits on one, the event firehose only for the awaited name. The signal object is memoized because the advance effect depends on it.

Lives in `lessons/use-lesson-signals.ts`.

## Spotlight layering

In-dialog beats lift above the z-50 dialog layer with blockers off; others sit above shell chrome (z-30 and below) but under dialogs and toasts. The whisper is a solid popover surface with `pointer-events-none` so the target stays reachable; only the close takes clicks.

Lives in `lessons/lesson-spotlight.tsx`.

## Docked panel focus

The card owns initial focus and Radix is prevented from moving it to the exit. The panel uses `aria-label` because the frame points at a title and description it does not render.

Lives in `lessons/lesson-docked-panel.tsx`.

## Beat chrome

Every beat surface carries only a count and a close, riding the moving surface. The count is drawn as numerals but spoken as a sentence, since "3 / 4" reads as "three slash four". A finished run reports the last beat, never "4 / 3", during the finishing commit.

Lives in `lessons/lesson-beat-chrome.tsx`, `lessons/lesson-progress.ts`.

## Availability

A lesson whose requirement this deployment lacks is not offered, since its beats would wait on something the user cannot do.

Lives in `lessons/lesson-availability.ts`.

## Email lesson

The ask beat seeds the picked employee's New task composer (`composeTaskFor`) in its own slot so a parked draft is never touched, and the seed ends with the beat. It notes the sender's tasks before arming and ends only on a new task of that sender. A note from an earlier run is discarded; a board restored from disk is reread for the sender. The sender and the note live in session memory only, so the ask beat names the sender beat as `resumeOn` and a restarted run asks again rather than sending from a default. The connect beat ends on any active email connection, wherever it was made. The watch beat counts a first email for the funnel, never a replay's. A team with no employee is offered the real hiring flow.

Lives in `lessons/email/email-ask.tsx`, `lessons/email/email-lesson-store.ts`, `lessons/email/email-connect-panel.tsx`, `lessons/email/email-watch.tsx`, `lessons/email/email-no-sender.tsx`, `lessons/email/email-sender-panel.tsx`.

## Rank reading

Rank progress reads experience only; usage points are a second currency shown as a chip, since two meters racing to one rank reads as two goals. The ring and bar come from one call so they never claim different fractions. The top of the ladder is a full bar. A minimum 2% fill keeps a just-started rank visible. Rank names are a literal map so a new rank without a name fails typecheck. The ring is code-drawn on the context indicator's 32-unit viewBox (radius 14 plus half stroke 1.5 must clear 16). The face is the app's single self-identity (`useMyProfile`); with no identity backend it falls back to the rail's person glyph. The streak chip shows only while a run is alive; the best run sits in a tooltip on a focusable trigger.

Lives in `academy-rank-progress.ts`, `academy-rank-avatar.tsx`, `academy-status-header.tsx`.

## Open event

Top-level screens are kept alive, so "Academy opened" is reported on the active-view flag, guarded by a ref, rather than on mount.

Lives in `use-academy-opened.ts`.

## Header

The Academy has no tools but keeps the family's 480px breakpoint so a future tool lands at the same edge as its siblings.

Lives in `academy-header.tsx`.
