# Integrations, channels and LinkedIn connections

Three SDK modules connect outside accounts: `integrations` (Composio toolkits and custom API or MCP servers), `channels` (Slack and WhatsApp for the person's assistant) and `linkedin` (posting a picture to the person's feed). All live under `packages/sdk/src/modules/`. The connection is always made on the gateway or in another browser tab, never in the surface that started it, and that shapes most of the rules below.

## Integrations

### Scope and degradation

`modules/integrations/index.ts` publishes `INTEGRATIONS_SCOPE`: readiness, the toolkit catalog and the person's connections, republished whole on every refresh. Integrations are gateway-owned and keyed by the session `sub`, so the module uses the flat `IntegrationsClient` rooted at the base URL, never `clientFor(agentId)`.

- A gateway with no Composio key answers 503, and the view model becomes `{ready: false, reason: "unavailable"}`. That is a state the tab renders, not a failure to report (`IntegrationsUnavailableReason` in `types.ts`). A 401 is never a reason here; it goes through the shared `tokenExpired` signal.
- The first snapshot is published asynchronously, so a subscriber reads `undefined` until the first real load lands, as in the agents module.
- The custom-integration definitions read answers 404 on a deployment without the feature, and the tools read answers `{code: "not_found"}` for an unknown slug. Both throw; the web adapter turns the 404 into an empty section at the surface.

### Where operations are declared for the assistant catalog

The catalog generator derives an operation's route from the transport call inside the declaration's own body. So `facade.ts` members are one-line delegations to exported request functions in `reads.ts`, `custom.ts` and `custom-agent.ts`, and each of those carries its own `@assistant` block. A facade member that forwarded to a function would not be an operation at all. For the same reason `refresh` and `pollConnection` call `IntegrationsClient` directly rather than forwarding to the provider-scoped reads in `reads.ts`; forwarding would remove both from the catalog.

`reads.ts` holds the reads keyed on a provider segment (`composio` for the app catalog, `custom` for the person's own connectors), with `{provider}` in the path literal exactly as the route names it.

### Custom integrations are per agent on hosted deployments

- `customIntegrationScope` (`custom-scope.ts`): a single host (desktop, self-host) keeps one definitions file every agent shares. The hosted gateway runs one pod per agent, so a custom integration set up with one agent belongs to that agent alone, definition and secret both. A host that predates the flag is a shared host.
- A hosted deployment serves only the per-agent form (`custom-agent.ts`, `/agents/{agent}/integrations/custom/*`); a direct host serves both that and `custom.ts` (`/v1/integrations/custom/*`).
- `resolveCustomTransportAgent` picks which agent's routes an agent-less page reads. On a per-agent deployment that choice is the list, in this order: the agent whose setup chat is open (the chat registers the integration on that pod, so reading any other pod would show the new row nowhere; this beats a prior pick because Continue setup reopens a chat on whichever agent owns the draft), then the person's pick, then the sidebar's current agent, then the first agent. An id for an agent that no longer exists counts as no choice.
- The secret travels only in the credential POST body, never in the chat transcript (`custom-types.ts`). Static headers (`headers`) are for non-secret values only. `AddCustomIntegrationInput` is the same grammar the agent's sandbox add tool sends, checked by the one host-side parser. On the credential response, `verified: false` means the probe rejected the key but the key is saved.

### Refusals and writes

- `integrationConnectRefusal` (`connect-refusal.ts`) reads `toolkit_oauth_unavailable`, `toolkit_no_auth` and `toolkit_not_found` from the adapter's `HoustonEngineError`, the local runtime client's `EngineError` and the SDK's own errors, so every surface and the AI Manager judge a refused connect the same way. It is loaded by the app's `node:test` runner through the `@houston/sdk/integrations/connect-refusal` subpath, so it stays dependency-free and uses erasable syntax only.
- `writes.disconnect` (`writes.ts`) is the no-refetch disconnect for a host that owns its read model. `connectionId` narrows removal to one account of a toolkit that holds several; omitting it removes them all.

## Channels

`modules/channels` connects messaging accounts to the person's own assistant in the active space. These are gateway routes (the gateway holds the provider credentials and receives the events), and a 404, 501 or 503 from a deployment with no messaging provider is a state the screen renders.

- `CHANNEL_PROVIDER_IDS` (`types.ts`) mirrors the provider union at runtime for payload checks. A provider the gateway starts offering must be added there too. The response shapes are declared here and kept in step with `@houston/wire-types` by hand.
- `requireTicket` checks only the shape of a completion ticket, so a truncated or altered callback link is refused before it leaves the device. The value is never logged, stored or sent anywhere but the completion route.
- Request bodies drop absent fields: a web connect sends `{}`, an app one `{"return":"app"}`, in the key order the wire tests pin (`http.ts`).

### Watching for a connection

Nothing tells the surface when a connection lands, so `watch.ts` polls the connections list while a watch is outstanding (published as `@houston/sdk/channels/watch`).

- A watch belongs to one provider and looks only at its connections, so a Slack connection never ends a WhatsApp wait and starting one hand-off never restarts the other's clock.
- A connection lands when an id appears that the watch did not start with. Counting would miss a new connection that arrives after an old one was disconnected.
- `CHANNEL_WATCH_MS` (3 minutes) is the shortest watch. A WhatsApp code lives ten minutes and is scanned on another device, so the window showing it never regains focus to refetch; the watch stretches to the code's expiry. An unparseable expiry keeps the default.
- `pruneLandedWatches` returns the same record when nothing landed, so a surface that stores it does not re-render for nothing.

### Slack connect and the desktop return

`connect-flow.ts` (published as `@houston/sdk/channels/connect-flow`) sequences a Slack connect. Web names no return and lands back in its tab. Desktop binds a loopback listener and names its port and a fresh `state`, so the approving browser returns over plain `http://127.0.0.1` without an "Open Houston?" prompt. A listener that cannot start falls back to the `app` deep link. `gatewayRefusedLoopback` (`connect-return.ts`) recognizes only a plain `400 {"code":"invalid_request"}` to a loopback request, which is how a gateway that predates `loopback` answers; only that earns the one `app` retry. Any other refusal is real.

A listener no browser can reach any more is freed: the gateway took another return, the connect failed, the surface moved on, or the page could not be opened. One the browser merely refused to open stays up, because the surface offers the page again.

## LinkedIn

`modules/linkedin` is user-scoped: the connection belongs to the person, not a space or an agent. The gateway holds the LinkedIn app key and the person's token.

### Connect

`connect-flow.ts` (published as `@houston/sdk/linkedin/connect-flow`) follows the Slack sequence with one difference on web: the page is known only after the mint, and a browser grants a new tab only inside the click, so the click claims a tab first and the page loads into it. Either way the signed-in app redeems the ticket LinkedIn sends back (`linkedin.complete`); a connect is never completed by polling. `startLinkedInConnect` frees the listener and discards the claimed tab when the mint fails. `abandoned` means the person closed the claimed tab before the page came, so nothing else opens.

`policy.ts` (published as `@houston/sdk/linkedin/policy`) holds the surface rules: poll every `LINKEDIN_CONNECT_POLL_MS` (2 s) for at most `LINKEDIN_CONNECT_WATCH_MS` (10 minutes, the life of the gateway's connect state). `isLinkedInUnavailableError` treats a 503 `not_configured` or an unserved route as expected; the surface offers copy and paste instead. `linkedInRetryMinutes` rounds a rate limit up so the person never comes back early.

### A post that may be up is never reported as not posted

If a post that went up were reported as failed, the person would press Post again and publish it twice. So only an answer that proves the post did not go up is a refusal, and anything uncertain is `unknown` (`post-outcome.ts`, `LinkedInPostResult` in `types.ts`).

- `NEVER_SENT` lists the transport messages that prove no connection was made (WebKit's CFNetwork phrasings). Every other transport failure, including Chromium's and Firefox's single generic message, may have cut a request the gateway already took.
- `PROXY_FAILURES` are statuses a proxy in front of the gateway answers on its own while the gateway may still be posting, such as a bare 502 or 504. The gateway's own LinkedIn failure carries `linkedin_failed` and stays a refusal.
- A 2xx is a published post whatever its body does. The gateway answers `201 {}` when LinkedIn gave no readable id, and the surface links to `LINKEDIN_FEED_URL` instead. A body that stalls past `LINKEDIN_POST_BODY_MS` (10 s) is cut and read the same way.
- `withPostDeadline` (`post-deadline.ts`) stops saying Posting after `LINKEDIN_POST_DEADLINE_MS` (3 minutes) and answers `unknown`. The gateway finishes a post it took even when nobody waits, so running out says nothing about LinkedIn. The request is aborted on this device only, and the wait is raced rather than awaited so a transport that ignores the abort still settles. The clock stops once `answered` is called, because the 2xx headers already prove the post is up.
- In `postLinkedInImage` (`http.ts`), a 401 means the gateway refused the bearer before it posted anything. The post runs on `fetchWithoutAuthReplay`, so the generic replay never sends it again under a different person; the post's own rule replays once only when the refreshed bearer names the same person (a token that went stale while the device slept), and otherwise answers `signed_out`. The post request has its own controller so a stalled body can be cut after the deadline stopped.
- The connect's loopback fallback retries exactly once: the retry names `app`, which never matches the refusal again.

### Text checks before sending

`linkedInUpload` (`upload.ts`) refuses before any request what the gateway would refuse: empty text, text too long as the gateway counts it (after backslash-prefixing LinkedIn's reserved characters, `linkedInCommentaryLength`, so a post full of `#`, `@` or `_` is caught here), and an image over the cap or of a type the gateway does not take. Control characters other than line breaks and tabs are dropped, not refused, because a paste can carry them unseen. Alt text past its cap is cut rather than refused, since the person never wrote it.
