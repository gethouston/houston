# app/src/components/portable: design decisions

Covers `app/src/components/portable/`: the From a friend import wizard for portable agent packages. File paths in this record are relative to that folder.

## Steps follow the package

The "From a friend" step list is derived from the package preview, so a package with no routines has no routines step rather than an empty one. Everything downstream reads the preview; nothing else parses the package. Every item starts selected. Instructions (CLAUDE.md) always come along with no toggle, because they are the agent's identity.

Lives in `app/src/components/portable/use-import-wizard.ts`, `use-import-package.ts`, `import-install-request.ts`, `import-pick-steps.tsx`.

## Reset keeps provider and model

`reset()` leaves provider and model alone; they rehydrate from the sticky last-used pair, and clearing them would flash the hardcoded fallback.

Lives in `use-import-wizard.ts`, `use-import-provider-model.ts`.

## Name rules

The package's name is only a suggestion; a typed name wins. The same pre-submit rule as the create dialog applies live (reserved "Houston", duplicates), and Next stays off until the name is usable. A refusal after the pre-check (a racing duplicate) is an expected state, not a bug. The name step renders the shared `AgentIdentityForm` so naming an agent is one screen.

Lives in `use-import-wizard.ts`, `import-name-step.tsx`, `import-install-flow.ts`.

## Scan choice is a two-card answer

Whether Houston reads the file for risks before install is a two-card choice, not a checkbox, because both answers are legitimate. It stays a local card so the choice keeps reading as chosen, which gates Continue. The cards stack because side by side they do not fit a hand-sized dialog.

Lives in `import-upload-step.tsx`.

## Which provider and model get pinned

The selector shows a best-effort pair while statuses settle, so it is never blank. What is written onto the new agent is stricter: a hand-picked pair wins; otherwise only a confirmed connection is pinned, since a displayed guess would outlive the screen. An unanswerable scan pins nothing, matching the create dialog. The sticky last-used preference is written only as a complete provider and model pair.

Lives in `import-kickoff-pin.ts`, `use-import-provider-model.ts`, `import-install-request.ts`.

## Install is a React-free order behind a same-tick latch

The install press is an ordered function without React (refuse an unusable name, round-trip, reveal) so a test can prove a rage burst makes one round-trip. A React state flag reaches `disabled` only on the next render, so every click in a burst would pass; `singleFlight` flips synchronously and releases on settle, rejection included. The latch is held in a ref so it survives re-renders. The agent is revealed optimistically and marked provisioning, like the create dialog. The new agent is born with its first day pending.

Lives in `import-install-flow.ts`, `single-flight.ts`, `use-import-install-action.ts`, `import-install.ts`.

## Frame

`FlowSheet` owns the surface, header and scrolling body. Back sits in the header's leading slot on every step but the first, where the close X is the only exit, so one row never offers two ways to leave. Short steps use the compact frame; pickers use the tall one. The pick-list screen is shared with "Copy an agent".

Lives in `import-wizard.tsx`, `pick-list-step.tsx`, `wizard-parts.tsx`.
