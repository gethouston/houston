# Wire types: the client's copy of protocol v3

`@houston/wire-types` (`packages/wire-types/src`) is protocol v3 as the client sees it: shapes, zod parsers, refusal codes and pure helpers. It performs no I/O and knows no gateway. The engine adapter imports and re-exports it, so `app/src` sees one surface (`index.ts`).

## A hand-kept projection of the host

`types.ts` is maintained by hand. It projects `packages/protocol` (`src/wire.ts`, which holds the zod schemas the host validates against) and adds shapes only a gateway serves: billing, orgs, teams. The host and the gateway are the source of truth. When a route's payload changes there, change it here in the same PR, or the app compiles against a contract nothing serves. Unions mirrored from the protocol (`OrgRole`, `ProviderHealth`, `CredentialScope`, `WorkspaceKind`, `HandsOnSurface`) are kept in sync by hand for the same reason. `onboarding.test.ts` pins the exact values the gateway accepts; changing one is a wire change on both sides.

Additions are additive only. Every field a newer server added is optional, and its absence means the older behaviour.

## Reading what a newer server sends

A shipped client will meet values it does not know. The package decides per field which of three reactions applies, and the choice matters:

- **Drop the unknown value, keep the rest.** A reason, code or kind this client has no copy for reads as absent, because guessed copy would name the wrong remedy. Examples: `parseTriggerStatusReason` and `TRIGGER_STATUS_REASONS` (`trigger-status.ts`), `parseTriggerPlanSkipped` (`trigger-plan-skip.ts`, which drops the whole field on an unknown code, a non-positive count or an unreadable time instead of failing the status read), `lockReason` and `interval` in `org-billing.ts`, `priceNoticeSchema` (`price-notice.ts`), an unknown billing-choice payer (reads as none) or state (reads as applied, nothing left to pick) in `billing-choice.ts`, and an unknown channel provider row (dropped so one id cannot blank the section, while a row with no provider id at all is still a refusal) in `channels.ts`.
- **Fall back to the safe answer and report it.** `parseSeatQuote` (`seat-quote.ts`) turns an unreadable quote into `no_charge`. The add then sends no `prorationDate`, so the gateway can never charge an amount the client did not show, and it refuses the add with `seat_quote_changed` if a charge is needed. The fallback goes through `reportUnreadableWire` (`unreadable-wire.ts`), whose sink the engine adapter installs at startup, so the screen keeps working and the mismatch is never silent to us.
- **Throw.** Strict parsers for contracts the client must speak exactly: `browser-live-parse.ts` (the runtime validates the input POST with the same parser the SDK reads the stream with, so both ends fail on the same drift), and `parseConversationPrewarmAnswer` (`prewarm.ts`). A throw is how that drift reaches a report instead of being read as something it is not.

Two related rules: `ActivityStatus` (`activities.ts`) is the closed set a write may set, mirroring `ACTIVITY_STATUSES` in `@houston/domain`, while a read keeps `Activity.status` open so a newer host's status renders neutrally. `wire-agent.ts` does not re-check `timezone`, because a device with older zone data (a WebKit that predates `Europe/Kyiv`) would otherwise reject the whole agent list.

## Capabilities describe the deployment

The `Capabilities` flags in `types.ts` (`multiplayer`, `teams`, `spaces`, `triggers`, `apiKeys`, `computeUsage`, `workspaceDelete`, `missionTitleOnSend`, `conversationPrewarm`, `heartbeat`, `linkedinShare`, `customIntegrationOAuth`, `customIntegrationScope` and others) are feature detection, not feature flags. The server is always the one that enforces. Absent means a host that predates the flag, so every existing single-player and self-host profile stays valid. A few flags exist so the client can skip a probe instead of discovering a missing route by 404 (`agentConfigLibrary: false`, `integrationSessionSink: false` on the hosted gateway); absent there keeps the legacy probe.

## Identity and address rules on the wire

- `CredentialScope` says whose provider account answered a probe or ran a turn. It is a read, never an address: the server decides whose credential a call uses from the space it is made in, and no request carries a scope.
- `AssistantHandle` fields are opaque. Never parse them; the deployment decides where the assistant lives.
- A hosted team workspace id is `"org:" + slug` with a 16-hex slug, and a personal space's id is never `org:`-prefixed. Strip the prefix to get the slug for `x-houston-org` or `?org=`, and never parse further. Selecting a personal workspace sends no active-space header.
- `ApiKey` carries only the display prefix; the full secret appears once, in `ApiKeyCreated`.
- `MessageApproval` and the `approvals` send field: only a user message can carry an approval, the host reads it off the request and records the receipt, and drops it before the runtime sees the turn, so no model can author one. It is its own field because the prompt is the person's words. An `InteractionStep.requestId` binds an approval card to one exact call, usable once.
- Send fields `displayText`, `author` and `mentions` are presentation only. The model sees `prompt` and the plain `@Name` text, and the gateway stays the authority on who acted.

## Text envelopes

Markers embedded in message text are encoded so the text around them cannot end them. `citations.ts` writes one envelope (`<!--houston:citations [...]--> … <!--/houston:citations-->`) holding both the model-facing list and the hidden marker, so stripping the envelope strips both wherever it landed. No `<` or `>` reaches the marker JSON, and `citationListText` backslash-prefixes quotes so they cannot end the list. `decodeCitationsEnvelopes` scans instead of using a regex, because the text is arbitrary and a backtracking pattern goes quadratic on many openers. An opener with no complete envelope behind it stays as text.

## Retry-After

`parseRetryAfterMs` (`retry-after.ts`) reads both RFC 9110 forms: delay-seconds (what the host and gateway send) and an HTTP-date (what some intermediaries rewrite it to). Delay-seconds must be digits only, so `-5`, `1.5` and `2 seconds` are rejected. A date must start with a weekday (`HTTP_DATE_START`) before `Date.parse` sees it, because V8 accepts `"-5"` as a year and `"NaN"` as a date. Anything unreadable is `undefined`, and a past date clamps to 0. The header is readable cross-origin only because the host lists it in `Access-Control-Expose-Headers` (`packages/host/src/server.ts`); elsewhere it reads as absent and callers use their own schedule. `ComputeRefusal.retryAfterMs` mirrors the header in the body for that case.

## Refusal contracts

Each refusal family has one file, and a client recognizes a code only with the status the contract pairs it with:

- `compute-refusal.ts`: `compute_busy` and `pod_wake_refused`, both `503` with the waking `error` string so an older client retries them like a pod wake. Nothing ran.
- `provider-refusal.ts`: `no_provider` and `provider_account_blocked`, both `409` before anything ran.
- `turn-setup.ts`: a pooled turn that failed before provider work, as one `error` frame with `data.code` (older workers put it in `data.message`). `claim_fenced` is deliberately not a setup code, because it ends a turn that may already have run tools. `detail` is for logs only.
- `move-refusal.ts`: `agent_moved` and `agent_not_found` let a client clear its move record; `agent_not_ready` keeps it. An older gateway answers all three as an uncoded 404, which a client keeps.
- `identity.ts`: the email-code pair and `AccountLinkRefusal`. `account_merging` (503) spends the code, so nothing retries it.
- `linkedin.ts`: `LINKEDIN_REFUSALS` and `linkedInRefusalOf`, which returns null for an answer that is a failure rather than a refusal. `linkedInCommentaryLength` counts code points after backslash-prefixing LinkedIn's reserved characters, as the gateway does, so each reserved character costs two of the 3000. `linkedInConnectSchema` and `slackAuthorizationUrl` (`channels.ts`) let only the provider's own HTTPS authorization page leave the app.
- `seat-quote.ts`, `seat-prices.ts`, `price-notice.ts`, `org-create.ts`, `billing-choice.ts`: seat and billing refusals and their statuses.
- `integration-connect-refusal.ts`, `first-day-refusal.ts`, `routine-refusal.ts`: re-exports of protocol codes, published as subpaths in `packages/wire-types/package.json` for the app's `node:test` runner, so they use erasable syntax only and type-only imports.

## Upload sessions

`upload-session.ts` defines resumable uploads in three steps so no server in the path holds a whole file: open a session (`POST /agents/:agentId/uploads`), `PUT` chunks with `Content-Range` to `uploadUrl`, then commit by `uploadId` on the existing `attachments`, `files/import` and `migration/import` routes.

- `uploadUrl` is the grant itself, so the client never sends Houston credentials there. Behind the gateway it is a storage session URL; on a desktop or self-host host it is the host's own sink, possibly relative to the base URL.
- Files up to `RESUMABLE_UPLOAD_THRESHOLD_BYTES` (8 MiB) keep the single-request base64 routes, which batch. `MAX_UPLOAD_FILE_BYTES` is 100 MiB. Non-final chunks are multiples of 256 KiB, as storage requires.
- A browser `fetch` treats a bare 308 as a redirect it may follow or hide, so the client sends `UPLOAD_NO_308_HEADER` and every sink answers an incomplete upload with 200 plus `UPLOAD_STATUS_OVERRIDE_HEADER: 308`. Storage does this natively and the host and gateway sinks copy it. `persistedBytesFromRange` treats an unreadable `Range` as "query again".
- At commit the gateway verifies the staged object and sets `stagedGeneration`, replacing any client value; a host copies exactly that generation.

## Browser hand-off limits

`browser-live.ts` sets the limits both ends hold. The person has `BROWSER_HANDOFF_LIMIT_MS` (10 minutes). Each hand-off has an unguessable `handoffId`, and every input request must carry it (`400` without it, `409 handoff_ended` for any other), so a late Done or retry from an earlier view never acts on a newer hand-off (`browser-live-input-parse.ts`). `batch.seq` makes event batches idempotent: a seq not above the highest applied returns the current state without reapplying events. The runtime keeps `BROWSER_LIVE_FRAME_WINDOW` (8) unacked frames and `BROWSER_LIVE_FRAME_WINDOW_BYTES` (320 KiB) per viewer, because eight full frames would queue over a megabyte; a runtime that advertises no window keeps `BROWSER_LIVE_LEGACY_WINDOW`. Input coordinates are 0 to 1 of the frame.

## Cross-agent sweeps report partial results

`AllConversationsResult` (`activities.ts`) carries `failedAgents` with each failing read's error. A bare array would either reject and blank the board over one sick agent, or look complete and silently drop that agent's missions into the cache. With the error attached, the surface can treat a waking pod as an expected quiet state and still report a real failure.
