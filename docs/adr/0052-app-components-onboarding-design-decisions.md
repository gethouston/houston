# app/src/components/onboarding: design decisions

Covers `app/src/components/onboarding/`: onboarding: team roster, survey, connect step, names and migration reconnect. File paths in this record are relative to that folder.

## Node-loaded modules import with `.ts` extensions

The pure team, survey and connect-card modules (`basic-team-model.ts`, `team-roster-model.ts`, `team-roster-edit.ts`, `team-roster-save.ts`, `basic-team-edit.ts`, `basic-team-names.ts`, `team-industry.ts`, `hire-card-model.ts`, `survey-steps.ts`, `connect-ai-card-state.ts`, `connect-ai/featured-subscriptions.ts`, `connect-ai/optimistic-connection.ts`) import with explicit `.ts` extensions, because the node test runner's ESM resolver does not guess extensions.

Lives in those files under `app/src/components/onboarding/`.

## First-run lifecycle and resume contract

Starting a run records the `"started"` stage of `onboarding_pending` and reports `onboarding_started` once (a ref guards against StrictMode replaying mount effects). The stage is the resume contract: hiring the first AI Employee flips the zero-agent first-run signal, so without it the user would be dropped out mid-team. The team step records `"team"` so the run stays there if the provider drops while hiring. Arming `first_message_sent` runs on every mount, since it is idempotent and a failed first arming would otherwise never report. Finishing reports `onboarding_completed`, clears the stage and stamps the flag; both caches flip synchronously so the same render routes into the app, and a latch keeps the team stage from being re-recorded on the way out. Only a genuine first run mounts onboarding; an account with employees and no run in flight goes to the app.

Lives in `use-first-run-onboarding.ts`, `first-run-start.ts`.

## Connect step

The connect step shows at once, before the first probe (a new account's AI home can take seconds); its cards offer Connect immediately and a press waits for the probe, since a sign-in sent to a home still starting would fail. Cancel drops a waiting press. The card never advances itself; the route moves on when one provider is confirmed connected (an unknown probe, a loading scan or a failed re-probe is not). The local provider's model never reaches the status snapshot, so its connect refreshes statuses directly. Featured cards are Claude and ChatGPT using the same provider ids as the browser rows, with one shared `useProviderConnections` and one dialog stack, so both paths sign in identically. After swapping views, focus lands on the control that swaps back. A subscription card is one button while it can start a sign-in and a plain panel while one runs, so Cancel is not nested in a button. Only leaving the connect step reports `ai_provider_connected`; a run that skipped it reports none.

Lives in `connect-ai-card.tsx`, `connect-ai-card-state.ts`, `connect-ai/use-optimistic-connections.ts`, `connect-ai/optimistic-connection.ts`, `connect-ai/featured-subscriptions.ts`, `connect-ai/subscription-card.tsx`, `connect-ai/featured-view.tsx`, `connect-ai/all-providers-view.tsx`.

## Survey

Questions run industry (it decides which roles lead), role, company size, goal. Step ids are the analytics and preference vocabulary, reported verbatim as `missing_steps`. First run walks every question with earlier answers preselected; the in-app prompt only asks gaps. Every event carries one `source_screen`. `*_continued` events fire only after the save lands. `goal_text` is stamped as a person property and stripped from the event so free text never rides as event content. The survey record has one owner (`useOnboardingSurvey`); readers observe with `enabled: false` so the owner's load stays the only one.

Lives in `survey-steps.ts`, `survey-analytics.ts`, `team/use-survey-role-start.ts`.

## Hiring never waits; Done does

A hire joins the roster immediately as `joining` and is created in the background. Done is the one press that waits, for creates and edits still saving, and gives up when one failed (its card says why). A late create answer never overwrites a removal or a retry in flight. A retry after a name collision uses the first free variant. Hires made by an interrupted earlier run count so a resumed run finishes without hiring twice. A finished team celebrates for a beat before handing over. Hires land as top-level AI Employees with first day pending; the card only builds the team.

Lives in `team/team-roster-model.ts`, `team/use-team-roster.ts`, `team/use-team-finish.ts`, `team/use-team-hiring.ts`, `team/build-team-card.tsx`.

## Roster saves

The roster of record is read and written synchronously so several changes in one press and settles between renders never use a stale copy. Saves run one at a time per member because a rename moves the id. Each field that lands commits at once. A host-refused rename reverts (final and explained); a failed call keeps the edit marked unsaved for Done to retry. A field changed again during a save keeps the newer value. Writes wait until a hosted employee's engine accepts writes after create. Edits made while joining are saved once the member exists. A renamed field commits on blur or Enter only, since each rename is a round trip; Enter never submits the surrounding form.

Lives in `team/team-roster-save.ts`, `team/team-roster-edit.ts`, `team/use-team-roster.ts`, `team/use-roster-name-field.ts`.

## Names

Names are checked against the workspace's employees and every hire still on its way, because the workspace does not list them yet and two quick hires must not ask for the same name. Untouched drafts take job names that step over taken ones, so the starter team is hireable as it stands. A draft may not take the AI Manager's name; a hired employee that already holds it keeps it. A blank name is required.

Lives in `team/basic-team-names.ts`, `team/team-roster-edit.ts`, `team/use-team-hire-flow.ts`.

## Basic team cards

"Hire one more" adds a card on top with the next shared job (`AGENT_COMMON_ROLES`). Default colors are dealt by place, so shown colors are pinned to their cards and a new card takes the next free color; a picked swatch swaps with the card wearing it. Shared jobs fill in when the industry has fewer than two catalog jobs. A card's industry answer is that card's alone and keeps its job, since any job pairs with any industry. A starter let go after a failed create returns as a draft with its pinned name and color. Failed one-by-one hires are named on the basic team screen because they block finishing.

Lives in `team/basic-team-edit.ts`, `team/basic-team-model.ts`, `team/use-basic-team.ts`, `team/hire-card-model.ts`, `team/team-basic-attention.tsx`.

## Team card navigation

All answer-holding hooks live above the screens so moving between them never loses input, and both paths hire into one roster. Back from the roster leads to the choice, so switching paths never undoes a hire. The industry question takes its starting answer once on open, so the flow waits for the survey record. Continue appears only while a picked answer is held; typed answers carry their own Continue. Back waits while the primary is busy, since leaving mid-hire would strand the result.

Lives in `team/team-view-model.ts`, `team/team-card-flow.tsx`, `team/team-card-actions.ts`, `team/team-card-footer.tsx`.

## Industry cut

Answers in the person's words are cut to `AGENT_ROLE_PART_MAX_LENGTH` (the survey keeps 200) at the last whole word, dropping a dangling separator; a single over-long word is cut inside itself. Counts are in code points so no cut splits an emoji.

Lives in `team/team-industry.ts`.

## First-run surfaces are always light

`FirstRunScreen` pins `data-theme="light"` so pre-app surfaces read the same in both themes and tokens resolve to light values. The content slot is `min-h-0` so tall screens scroll inside their card within `h-dvh`. `SetupCard` keeps a fixed height so the footer never jumps, is keyed by title so the entrance replays per step, and on phones becomes the full-bleed screen.

Lives in `first-run-screen.tsx`, `setup-card.tsx`.

## Migration reconnect

After upgrading from the legacy desktop build, agents migrate but AI sign-in does not, so a one-time reconnect screen uses the shared `ProviderBrowser` with `selectOnMount`. A failed write of the "seen" flag is reported but does not block the user; at worst the screen shows once more.

Lives in `migration-reconnect-screen.tsx`.

## Cloud migration wizard

The gate mounts after auth and before first-run onboarding, because a migrating user has zero cloud agents and would otherwise be captured by onboarding. The wizard replaces the app tree, so it mounts its own toast container. One `FirstRunScreen` wraps every wizard screen so the background paints once. "Migrate later" is offered while running and on every error state so the user is never trapped. Skipping is confirmed because it starts the app empty, while stating that data stays on this computer and can be resumed from Settings. The done screen stamps the outcome on mount without applying it in session; a run with failed agents stamps "skipped" so Settings keeps the retry. Installs without per-agent integration records skip the apps step. The reconnect step uses curated `ProviderBrowser` without `onSelect` or `selectOnMount`, so it never auto-advances and pre-connected providers stay visible. App reconnects run in parallel, each gated on its own slug, with per-slug Cancel. The toolkit catalog uses the gated hook, because a raw fetch 404s on hosts without Composio.

Lives in `cloud-migration/cloud-migration-gate.tsx`, `cloud-migration/progress-screen.tsx`, `cloud-migration/offer-skip-confirm.tsx`, `cloud-migration/done-screen.tsx`, `cloud-migration/done-followups.tsx`.

## Migration progress bar

Backup and prepare have no measurable fraction, so the bar creeps on elapsed time as `0.9 * (1 - e^(-t/tau))` (about 0.70 at 60 s) and never completes on its own. Real mode tracks the fraction and creeps at most 0.08 past it, capped at 0.98 until done. The displayed value is a non-decreasing floor across both modes, so the handoff never jumps backward; one bar instance spans all phases. Reduced motion jumps or holds a static fill, still floored. `aria-valuenow` is omitted while indeterminate.

Lives in `cloud-migration/migration-progress-bar.tsx`, `cloud-migration/progress-screen.tsx`.

## Space Invaders easter egg

Shown only during the real upload phase, null under reduced motion. Rules are pure with an injectable RNG for deterministic tests; rendering never mutates the model and the swarm bob is render-only so collisions use model coordinates. Fixed internal resolution scaled by CSS and devicePixelRatio. Ink color is read from the canvas's computed `color` on resize to track the theme. Keyboard input is window scoped but yields to a focused field. Best score storage failures are tolerated.

Lives in `cloud-migration/space-invaders.tsx`, `cloud-migration/space-invaders-model.ts`, `cloud-migration/space-invaders-draw.ts`, `cloud-migration/space-invaders-defs.ts`.
