# app/src/components/integrations: design decisions

Covers `app/src/components/integrations/`: integration connect flows, curated entries, manual adds, the setup chat, the allowlist editor and the shared app row. File paths in this record are relative to that folder.

## Platform-mode provider and capability gate

Houston holds the Composio platform key server side; users only OAuth the apps, with no Composio account. Integration routes are fetched only when `/v1/capabilities` advertises a provider; a deployment with neither gateway URL nor platform key serves `[]` and answers 503, and `null` capabilities also mean do not fetch. Provider reads also gate on the Houston session push having landed (`useIntegrationProviderReady`), so a warming gateway never fires failing calls from a surface the person did not open. Whether custom integrations are served is the custom list's own answer, which keeps the page useful without a Composio key.

Lives in `app/src/components/integrations/model.ts`, `use-toolkit-catalog.ts`, `use-integrations-gate.ts`.

## Boot gate

Production users are always signed in, so "host says signin while the app holds a session" is the boot race: the token is re-pushed once and the gate holds `loading` instead of flashing a sign-in card; only a real desync shows it. A build with no auth maps `auth-not-configured` to `unavailable`. The status query sits idle until capabilities resolve, which holds `loading`, not a premature `unavailable`. A session push belongs to the session, so revisiting a surface never manufactures a loading gate. Resync bookkeeping is per identity and dropped on identity swaps. The boot loader pulses opacity only (no width animation that faked progress) and stops under reduced motion.

Lives in `use-integrations-gate.ts`, `integrations-gate-state.ts`, `states.tsx`.

## Connect flow: one shared registry, per toolkit and per scope

One registry per app run (`stores/connect-flow.ts`) holds every live connect, so a chat card and the Integrations page share one hand-off and leaving a surface never cancels a poll; only an explicit Cancel or the roughly 5 minute budget (2 s interval) ends it. Flows are per toolkit and concurrent; no row is disabled because another app connects. The single-flight key is toolkit plus scope: an account-scoped link is minted without an agent so the gateway never consults an agent's allowlist, and an agent's card must not join it. A second caller in the same scope joins the running flow (`initiated: false`) and does not repeat the starter's side effects. The scope separator cannot occur in an agent id or slug, so prefixes never straddle keys. Each surface reads only its scope's rows. Mutable flow state lives in a ref so waking, cancelling or reading the redirect URL never re-renders.

Lives in `use-connect-flow.ts`, `connect-flow-registry.ts`, `connect-flow-scope.ts`.

## Tab claimed inside the click

The OAuth tab is reserved during the click's user activation because the link is minted over an async hop, and Safari, Firefox and strict Chrome refuse a later `window.open`. Desktop opens natively. A refused open publishes `blocked`, and the row offers a click that opens the page; a reopen is a click, so the blocker honors it. An empty reserved tab is closed if no link arrives. Curated MCP sign-ins claim their tab before the add round trip for the same reason; a chained sign-in after a manual add runs outside any click and names the row's own Sign in button on refusal.

Lives in `use-connect-flow.ts`, `curated-connect-dialog.tsx`, `custom-add-flow.tsx`.

## Phase machine

`starting` covers only the link mint (no surface may claim the browser opened), `waiting` begins once the browser is open, `blocked` when it refused. A cancel during minting bails without opening. The try covers only the engine half; widening it over settle once reported a landed connection as failed. On success the row holds "connected" for a dwell before the connections refresh, so the app does not teleport into Installed in the same frame. The notice is published before the step clears, because the store reads "ended with no outcome" as a cancel and retires the origin. Settle failures are reported, never rejected out of a click handler. The app window is refocused only when the connection lands. An engine failure leaves a `failed` notice on the row in addition to the `call()` toast.

Lives in `connect-flow-run.ts`.

## Outcome voice

One toast per settled outcome: success for landed, a neutral toast pointing at Finish for an abandoned OAuth (walking away is not a crash), an error with no auto bug report for a provider failure. A user cancel is silent. A connection that vanished under the poll (`gone`, 404) is silent too, with the row's quiet line as its only surface; a 404 on an already-cancelled poll is the cancel. Inline copy is short because the toast carries the full sentence. A disconnect stops any poll waiting on that connection in every scope, since a disconnect names the app, not a scope; removing one other account leaves a pending sibling's poll alone.

Lives in `connect-announce.ts`, `connect-notice-line.tsx`, `connect-flow-inline.tsx`, `model.ts`, `connect-flow-registry.ts`.

## Typed connect refusals

Typed host refusals are expected states with their own copy: OAuth unavailable for a toolkit (with an analytics event to track demand), a no-auth app ("already set"), and an app Composio does not carry. Each re-throws so the row settles as failed.

Lives in `connect-mint-link.ts`.

## Inline state ownership

The catalog renders some apps twice (the "Most used" spotlight repeats category rows), so one row owns the inline connect state: the row the flow started from, or the first rendered copy if that row dropped out (search, filter, collapse), so a live OAuth and its Cancel never vanish. Bare mode inside a catalog card adds no frame or spinner, since the `+` slot already spins. The block is a polite live region.

Lives in `connect-origin.ts`, `connect-flow-inline.tsx`, `connect-waiting-block.tsx`.

## Browse catalog ordering

The "Most used" spotlight is a hand-picked list ordered by Composio's usage ranks (verified 2026-07-22), not the live `sort_by=usage` API, because that ranks across Composio's developer customer base and would surface github and supabase first. It appears only on the at-rest view and does not remove apps from their categories. Sections order curated mainstream categories first (`CATEGORY_PRIORITY`, spelling-normalized), then by app count, with uncategorized last; developer categories are deliberately absent from the priority list. Un-narrowed views bucket by primary category; a category filter matches any category so rows equal the "Available" count. The filter dropdown sorts A-Z. Results sort A-Z after filtering. No-auth apps never appear in the catalog (Connect could only fail); they stay agent facing.

Lives in `browse-sections.ts`, `category-priority.ts`, `browse-model.ts`.

## Connections read model

A working connection makes the app installed (one row per toolkit carrying every active account); pending or errored connections stay in the catalog as status rows. A toolkit with both active and broken connections counts as installed only. Connections key by id, not toolkit, since a toolkit can hold several accounts; the detail sheet re-resolves by that id. Disconnecting removes the app for all of the user's agents; the copy says so. Which agents may use an app is managed only in the Permissions view. Account labels use the provider's identity, else the connection date, else an ordinal.

Lives in `connected-apps-model.ts`, `use-connected-apps.ts`, `use-connection-selection.ts`, `integration-disconnect-dialog.tsx`, `account-display.ts`.

## Display names never show slugs

A catalog miss falls back to a humanized label, never the raw slug. A bare action slug maps to the longest matching catalog slug, mirroring the host's `resolveToolkit`. Custom executor addresses (`tools.<integration>.<owner>.<connection>.<namespace...>.<tool>`) are parsed for branding. Curated slugs use bundled logos, because the `<slug>.com` guess points at an unrelated site for Croma and favicon proxies can fail; asset imports are Vite only and kept out of the node-tested module. `AppLogo`'s failure latch is keyed to the failing URL so a real logo arriving later still renders; logos load lazily and decode async because the catalog mounts hundreds of rows.

Lives in `app-display.ts`, `curated-logos.ts`, `app-logo.tsx`, `integration-chips.tsx`.

## Curated entries

Curated entries ride the existing custom-integration stack: Connect materializes a custom definition (`curatedAddInput`, `replace: true` so a half-connected leftover is repaired instead of 409ing) and runs the stock sign-in or key flow, so the host has no curated concept. When the slug equals a Composio toolkit they are one card and Composio's connect is an option. Every offered option always shows; a deployment that cannot run browser sign-in rejects at the host with `oauth_unsupported`. HighLevel is token-only (Private Integration Token plus `locationId` header); its OAuth consent page refuses scopes its own app requests, so OAuth is not offered, and the endpoint's trailing slash matters. ManyChat uses a committed OpenAPI document generated by `scripts/gen-manychat-openapi.mjs`, because Composio's toolkit has zero actions and ManyChat's spec names operations by hash. Copy keys are typed from the en locale. OpenAPI sources always land in credential mode.

Lives in `curated-entries.ts`, `curated-entry.ts`, `curated-integrations.ts`, `curated-connect-dialog.tsx`, `curated-connect-options.tsx`.

## Custom integrations ride per-agent routes

Every custom integration read and write uses the transport agent's `/agents/:id/...` routes, the only custom family the hosted gateway proxies to the pod (top-level routes 404 there). On per-agent deployments (one pod per agent) the list belongs to one agent, shown by a scope pill only when there is a choice; copy says only that agent can use it.

Lives in `custom-add-form.tsx`, `custom-key-dialog.tsx`, `custom-integration-dialogs.tsx`, `use-custom-integrations-surface.tsx`, `custom-scope-picker.tsx`, `custom-detail-dialog.tsx`, `custom-delete-dialog.tsx`.

## Manual add

Only http(s) URLs are accepted. The detect verdict remembers which URL it judged and the latest check wins, so a late result never fills the wrong address. A detect result never overwrites typed input. An OAuth-walled MCP server blocks submission only where the host reports `oauthSupported` false; otherwise the add uses auth `oauth` and chains into sign-in. The kind picker uses `aria-pressed` toggle buttons, not radios, since two tab stops cannot honor roving tabindex. A saved but unconfirmed key warns instead of celebrating.

Lives in `custom-add-model.ts`, `custom-add-form.tsx`, `custom-add-kind-toggle.tsx`, `custom-key-dialog.tsx`.

## Setup chat

The setup chat is a mission tagged with the integration-setup sentinel so no board shows it. The owning agent is the panel's open flag, else the one live draft found by the cross-agent scan, so the Continue-setup banner survives reloads; that scan is kept fresh by push patches and never refetched, so reading it wakes no pods. Starting resumes an existing draft and never double-creates. The kickoff pins the agent's configured model, gated on providers the user actually connected, since an unpinned send lands on the runtime default. Done and discard both archive the draft. Only the visible instance drives the shared shell panel. A warming refusal already opened its own dialog and is not a failure.

Lives in `use-integration-chat-setup.ts`, `integration-setup-chat.tsx`, `custom-setup-banner.tsx`.

## Credentials and dialogs

Secrets cross only in the HTTPS body to the host's secret store, never the chat transcript. Dialog selections are slug-keyed and re-derived from the live list, so a removed slug closes its dialog and is not reopened later by a re-add. Dialogs remount per entry so state never leaks. A detail dialog uses `min-w-0` because a grid item's default min width lets an unbreakable URL push the footer outside.

Lives in `custom-credential-form.tsx`, `custom-integration-dialogs.tsx`, `custom-detail-dialog.tsx`.

## Allowlist editor

"Only apps you pick" seeds from in-use apps within the universe so restricting never cuts off an app in use. The category filter is view only. Grid pagination resets during render when the result list changes.

Lives in `allowlist-editor.tsx`, `app-catalog-grid.tsx`.

## Shared app row

`AppRow` is the one integrations list row both surfaces render: logo, name with the live status dot and label to its right, description, a trailing action slot and optional content under the main line. It is a button only when `onClick` is given. Actions live in `trailing` and are never hover-gated. The card stays the plain neutral surface and status reads from the dot and label, never a tinted background, which read as loud in review; a colored label beside the name is the sober version.

Lives in `app-row.tsx` (`AppRow`).
