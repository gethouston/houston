# app/src/components/first-day: design decisions

Covers `app/src/components/first-day/`: the first-day offer shown for a new employee. File paths in this record are relative to that folder.

## Placement of the first-day offer

`hero` when the board is narrowed to one pending employee with no tasks (the start button is the board); `compact` above existing tasks for that employee; `banner` on the team board naming every waiting employee, each startable in one tap because the setup chat opens beside the board. Only employees the user may configure (`canStart`) are offered, since anyone else would press a button the gateway refuses.

Lives in `app/src/components/first-day/first-day-model.ts`, `first-day-banner.tsx`, `first-day-cta.tsx`.

## Holding the board's auto-open composer

The empty board's automatic "New task" composer waits while configs load, so a pending employee's board never flashes a composer before its start button, and stays held while any start button shows. A failed config read counts as settled with no offer, so the composer is never held forever. An employee still being created is not settled until its warm-up ends, but its offer shows from the seeded config.

Lives in `first-day-model.ts` (`firstDayHoldsAutoOpen`), `use-first-day-placement.ts`.

## Shared cache and event-driven removal

Config reads use `useAgentConfig`'s query options, so config event invalidation removes the offer as soon as a first day is recorded by anyone.

Lives in `use-first-day-placement.ts`.

## No AI connected

Without a connected AI the first turn cannot run, so start buttons lead to the AI Hub instead (the composer's own gate) and return once an AI connects. Each such surface is counted once per session in PostHog, since the refused start no longer reaches Sentry.

Lives in `first-day-cta.tsx`, `first-day-banner.tsx`, `use-track-needs-ai.ts`.

## Concurrent presses start one task

Every start button may fire at once from any board or tab; the host starts one setup task and hands it to every press.

Lives in `start-first-day.ts`.
