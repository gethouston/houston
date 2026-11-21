# app/src/components/settings: design decisions

Covers `app/src/components/settings/`: the Settings index and its pages. File paths in this record are relative to that folder.

## Settings index scope

Settings holds one general group (plan, channels, appearance, language, notifications, morning briefing, API keys, shortcuts, bug report, migration) plus Danger. Admin is its own screen; an employee's Skills live in that employee's settings; the signed-in person's identity, Sign out, Profile and About me belong to the account menu. Billing is per org (Admin > Billing); Settings keeps only the free-org pick. Shortcuts is hidden on phones as a structural fork, since a phone has no keyboard shortcuts.

Lives in `app/src/components/settings/settings-index.tsx`, `sections/plan.tsx`.

## Section state and workspace gate

The open section lives in the UI store and every navigation goes through `openSettings`, so a deep link lands even when Settings is already open. The whole screen sits behind the workspace gate, distinguishing loading (spinner), a load that threw (blame the connection, retry) and a load that succeeded empty (retry, without accusing the network); conflating them once left a failed load spinning forever. Settings owns its `tab_opened` event (`settings` or `settings:<section>`); the shell's viewMode effect skips it to avoid double counting, and loading or error frames emit nothing.

Lives in `settings-view.tsx`.

## Appearance: paint now, save once picking stops

Each palette pick paints immediately; the write is debounced on the trailing edge so a burst stores one preference. Writes diff against the last saved preference, never the painted one, or every pick after the first would look like a no-op. The persist seam paints nothing, so a superseded preference never reappears. One write at a time; a pick made mid-write is picked up by that write's tail. A refused write repaints the saved preference and reports, unless a newer pick already owns the screen, which then gets its own attempt. Closing Settings or unloading the page flushes the painted preference immediately. All seams are injected so the burst behavior is unit-testable without the engine.

Lives in `sections/appearance-commit.ts`.

## Appearance row opens on the saved preference

The row reads the preference in force synchronously; re-reading from the engine would apply it again, rewrite the device mirror and re-release the native window. Controls stay closed until the boot read says what is saved, because seeding from defaults during a cold engine read would persist a combination nobody chose; a failed read never opens them. Under `system` only the painted attribute knows which mode is on screen. The mode menu's value is parsed rather than cast. Phone thumb target is `min-h-11`; desktop keeps 36px.

Lives in `sections/appearance.tsx`.

## Palettes dialog

Picks apply instantly so the app behind the dialog is the preview; there is no Save or Cancel. The section for the mode not on screen stays interactive with a hint, not dimmed, since the pick shows when that mode resolves. Palette names are proper nouns and never pass through `t()`. Tiles paint the palette's own hex values read as data from the token export, so no color is authored inline. Tiles keep 5:3 capped at 120x72 so three to a phone row still clear 44px. Arrow keys move focus with selection (roving tabindex, WAI-ARIA radio group) and wrap. The dialog width uses `sm:max-w-[min(42rem,...)]` to keep the phone gutter.

Lives in `sections/appearance-palettes.tsx`, `sections/appearance-tiles.tsx`, `sections/appearance-model.ts`.

## API keys: the secret is shown once and kept local

Minting reveals the secret exactly once. The secret lives only in the flow hook's local state: the mutation never caches it, `clear()` and unmount drop the mutation copy, and nothing hands it to a caller, which keeps it out of chat turns, parked cards and messages. The reveal is blocked from session replay (`ph-no-capture`, `sentry-block`), as are code examples embedding a secret. The dialog keeps both outcomes on screen; the recipe's re-entry guard stops a second Enter minting a second key. Only the hosted gateway mints keys. A locked org mints nothing but still revokes. The Organization ID card exists because keys belong to the person and no key-reachable route returns the org slug (sent as `x-houston-org`); it hides if `GET /v1/orgs` fails, and is disabled off the public API.

Lives in `sections/api-key-create-flow.tsx`, `sections/api-key-create-dialog.tsx`, `sections/api-keys-body.tsx`, `sections/api-org-id.tsx`, `code-example.tsx`.

## Deleting a team space

Shown only when the deployment can delete spaces (`capabilities.workspaceDelete`), the active space is a team (a personal space goes with the account) and the caller owns it; the gates are cosmetic and the gateway enforces. Shared gates mean surfaces that send a person here ask the same question. Confirming pre-checks the two business rejections (`has_members`, `subscription_active`) against fresh roster and billing reads; billing is skipped where teams are not billed. A provably deletable solo team switches to the default space immediately with the success toast first (the landing load may take seconds), while the slow gateway delete finishes behind it with the store's rollback as the net. Anything unproven waits for the gateway verdict so the user is never told "deleted" about a space that stands. The rejection handler attaches before navigation awaits to avoid an unhandled rejection.

Lives in `sections/danger.tsx`.

## Deleting the account

Type-to-confirm; the request refuses and deletes nothing while the user belongs to team spaces. On success the session goes null and the sign-in screen replaces Settings. Actionable refusals keep the dialog with the typed word.

Lives in `sections/delete-account.tsx`.

## Channels

One card per provider the deployment serves; a provider without credentials shows no card unless the person already holds a connection there, so it can still be removed. A landed connection clears its code and "finish in Slack" line. Codes scanned on another device are watched for the code's whole lifetime, not the default window; watch rules are the SDK's. New account rows fade in so a connection finished elsewhere is noticed, decided once per mount. A disconnect that removes the focused button moves focus to the provider card heading or the section title. A locked org connects nothing new but still disconnects. "Open WhatsApp" is a real anchor, since popup blockers never refuse an anchor click and phones hand `wa.me` to the app; the desktop webview opens it in the OS browser. QR codes are dark on light in every theme, because inverted codes fail many scanners.

Lives in `sections/channels.tsx`, `sections/channel-provider-cards.ts`, `sections/channel-account-list.tsx`, `sections/channel-provider-panel.tsx`, `sections/channels-whatsapp-link.tsx`, `sections/use-watched-channels.ts`.

## Morning briefing

Shown only where `capabilities.heartbeat` is served; Slack or WhatsApp delivery is promised only under the Channels gate. Writes turn off with a reason while the org is locked.

Lives in `sections/morning-briefing.tsx`.

## Notifications

Only macOS and Windows expose an openable notification settings pane, so the button is hidden on web and Linux. The delivery label refreshes on window focus so an OS permission change shows without reload. Turning the toggle on while delivery is not granted triggers the contextual permission request. A failed probe keeps the last known value.

Lives in `sections/notifications.tsx`.

## Language change

The language switches at once and the override saves behind it. Only the newest pick's refusal arrives (older ones resolve `superseded`); it restores the workspace's choice, or the language shown before the run of picks.

Lives in `sections/language-change.ts`.

## Bug report

Messages are capped below the fallback feedback channel's 6,000-character bound so reports never arrive cut. Typed text is kept on failure. Only the all-channels-failed case offers retry; a throw from the submit path itself is still reported.

Lives in `sections/report-bug.tsx`.

## Migration re-run

"Continue migration" shows only on a hosted desktop build with legacy data on this machine and no completed outcome. Its detect query shares the wizard gate's key so the filesystem scan is deduped. Re-running clears the device outcome flag and reloads so the gate reopens.

Lives in `sections/migration.tsx`.

## Free-org choice row

The row is the way back into the free-org picker while a pick is open. The SDK decides what stays (`choicePickerEntry`); an open picker or success step stays until closed and then focuses a fallback that outlives the row. The picker keeps its slot so it never remounts.

Lives in `sections/free-org-choice-row.tsx`, `sections/plan.tsx`.

## Settings row layout

Action rows that resolve in place set `chevron` false, since a chevron promises navigation. A control whose value is a phrase the user wrote gets its own full-width line on phones. Icon and title stay on one line in stacked rows. Rows the UI tests navigate by carry a stable `data-testid`.

Lives in `settings-row.tsx`.
