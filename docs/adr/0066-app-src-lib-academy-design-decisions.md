# app/src/lib/academy: design decisions

Covers `app/src/lib/academy/`: Academy progress storage and merging. File paths in this record are relative to `app/src/`.

## Progress only grows when two copies merge

The engine preference lives on the user's pod in hosted mode, so a pod blip must never cost a finished chapter, and an offline device must never downgrade another device's progress. Chapters and lessons union; a conflict keeps the earliest completion and the larger award. Day stamps are `YYYY-MM-DD`, so string order is chronological. The daily tally merges as a pair with its day, and the later day wins. `best` streak takes the maximum; `current` is only true alongside the day it was last extended.

Lives in `lib/academy/academy-merge.ts`, `lib/academy/lesson-position.ts`.

## Usage points are counted per install

Two devices earning on the same day are both right, and a single total can keep only one of them. Each install's count only grows, so the larger count per install wins. The total is derived, never stored. Records from before per-install counters fold their total onto a legacy device id that never earns again. The device key is minted once and kept; a storage that refuses to hold it falls back to a stable id rather than minting a new one per read.

Lives in `lib/academy/academy-record.ts`, `lib/academy/academy-record-parse.ts`, `lib/academy/usage-device.ts`.

## One mutation queue per account

A record is a read-modify-write over two stores, written from a finished lesson, a saved lesson position and the usage flush. All writes go through one serial queue per account, which folds in anything that landed while loading and survives a failed mutation. A pure mutation returns the same object when nothing changes, so nothing is written. Teardown writes the device mirror synchronously.

Lives in `lib/academy/academy-mutations.ts`.

## Mirror first, engine best effort

The uid-keyed localStorage mirror is written first and the engine write may fail without throwing, the same trade the onboarding survey makes, so a warming pod cannot lose progress.

Lives in `lib/academy/academy-store.ts`.

## Account guard on the engine preference store

The mirror is keyed by uid, but the engine preference store serves whoever is authenticated now. Ports for one account check the active uid at the moment of the event and discard an engine answer if the account changed mid-read, so points buffered for one user are never written into another's record.

Lives in `lib/academy/academy-store.ts`, `lib/academy/academy-ports.ts`, `lib/academy/usage-live.ts`.

## No answer is not an empty record

A load that reached no engine and found nothing on the device is "no answer", which a screen must refuse to draw; a null record from a real read means "nothing earned yet".

Lives in `lib/academy/academy-store.ts`.

## Record parsing is all or nothing

A wrong version, a malformed entry or a negative award means the blob is not ours. Days are checked for shape before value. Points are never negative, `NaN` or infinite. Lesson positions are read tolerantly, because a bad one costs only one "Continue".

Lives in `lib/academy/academy-record-parse.ts`, `lib/academy/lesson-position.ts`.

## Two currencies and a rank ladder

Experience comes from learning and usage points from doing. A rank needs both thresholds; the scan does not stop at the first unmet rank because the currencies are independent. Usage points are capped per day per record, use local calendar days, and the Academy never pays for itself.

Lives in `lib/academy/academy-ranks.ts`, `lib/academy/usage-points.ts`, `lib/academy/usage-live.ts`.

## Lessons are data

A lesson is a list of beats; the runner knows nothing about which lesson is playing. Spotlight selectors are built with `tourSelector` so a renamed anchor fails compilation. Beat signals are states, not edges (already connected on arrival counts as met). The conversation-count signal is loose by design: any agent's count growing past the arrival baseline counts.

Lives in `lib/academy/lesson-spec.ts`, `lib/academy/lesson-signals.ts`.

## Video hosting is undecided

No asset is published; every lesson asks for its video and gets the all-null shape, which renders as the calm "coming soon" state. The manifest is the only place that changes when recordings ship; no component, hook or lesson learns a URL. The asset base URL's trailing slash is required because rows resolve against it as a directory.

Lives in `lib/academy/videos.ts`.

## Email lesson detection

A send counts only through an active connection of the first email toolkit, and a result pairs with the most recent call without one, as the chat renders them. A replay sends a real email but is not an activation.

Lives in `lib/academy/email-lesson/`.
