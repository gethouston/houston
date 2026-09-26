/**
 * The hosted gateway's client-facing multiplayer surface: the routes the app
 * reaches that `packages/host` will never serve, each with what it is for.
 *
 * Multiplayer is not a host concept. Spaces, members, roles, per-agent
 * access policy, API keys, billing and the routes that move a pod between
 * namespaces exist because `cloud` runs many tenants; `packages/host` serves
 * one workspace and has nothing to answer with. Each family here has its SDK
 * module, and that module is permanently host-less — which is what this
 * inventory records, not debt against the host.
 *
 * NOT an input to the SDK-parity gate: that gate reads its own written
 * exceptions from `scripts/sdk-parity-exceptions.json` and never this file.
 * Neither of its rules fires on these routes — R1 ("a route classified `sdk`
 * that no `@houston/sdk` method issues") because every one is issued, and R2
 * ("an SDK method no server serves") because the gateway serves every one.
 *
 * Keys are `"METHOD path"` spelled exactly as the gateway registers the
 * pattern (`cloud/internal/edge/routes.generated.json`) — a route survives the
 * migration, a function name does not. `gateway-only-routes.test.ts` holds
 * every line here to a route the gateway actually serves, so a retired route
 * cannot linger as an entry nobody owns.
 */
export const GATEWAY_ONLY_ROUTES: Readonly<Record<string, string>> = {
  // ---- org administration ----
  "GET /v1/org": "the active space's own record; only the gateway knows orgs",
  "GET /v1/org/profiles":
    "teammate display names and photos, from the gateway's user directory",
  "GET /v1/org/people": "the co-member roster behind @mention autocomplete",
  "POST /v1/org/members":
    "invites a person into the space; the gateway owns invitations and their email",
  "DELETE /v1/org/invites/{inviteId}":
    "withdraws a pending invitation the gateway issued",
  "DELETE /v1/org/members/{userId}": "removes a person from the space",
  "PATCH /v1/org/members/{userId}": "changes a member's role in the space",
  "GET /v1/org/audit": "the admin activity log the gateway records",
  "GET /v1/org/usage": "per-member turn usage the gateway meters",
  "GET /v1/org/compute-usage": "engine-pod compute the gateway meters",

  // ---- spaces ----
  "GET /v1/orgs": "the spaces this user belongs to, plus pending invitations",
  "POST /v1/orgs": "creates a team space, which provisions a namespace",
  "DELETE /v1/orgs/{slug}":
    "deletes a team space and everything provisioned under it",
  "POST /v1/org-invites/{inviteId}/accept": "the invitee joining a space",
  "DELETE /v1/org-invites/{inviteId}": "the invitee declining an invitation",
  "POST /v1/agents/{slug}/move":
    "starts moving an agent to another space; a pod migration between namespaces",
  "GET /v1/agents/{slug}/move/{moveId}":
    "polls that migration until the agent answers in its new space",

  // ---- per-agent policy ----
  "PUT /v1/agents/{slug}/assignments": "who may use an agent, and as what",
  "GET /v1/agents/{slug}/settings":
    "the toolkit/model allowlist an admin set for an agent",
  "PUT /v1/agents/{slug}/settings": "writes that allowlist",
  "GET /v1/agents/{slug}/model-choice":
    "the model an admin pinned for an agent",
  "PUT /v1/agents/{slug}/model-choice": "pins that model",
  "GET /v1/agents/{slug}/trigger-status":
    "whether the agent's integration triggers are live, which only the gateway subscribes",

  // ---- account ----
  "GET /v1/me/profile": "the signed-in person's directory entry",
  "PUT /v1/me/profile": "edits that entry",
  "GET /v1/keys": "the account's API keys, minted and hashed by the gateway",
  "POST /v1/keys": "mints an API key",
  "DELETE /v1/keys/{id}": "revokes an API key",

  // ---- billing ----
  "GET /v1/org/billing": "the space's subscription, read from Stripe",
  "POST /v1/org/billing/checkout": "opens a Stripe checkout session",
  "POST /v1/org/billing/portal": "opens the Stripe customer portal",

  // ---- gateway control routes inside otherwise-host families ----
  "POST /v1/agents/{agentSlug}/routines/{routineId}/webhook-key":
    "mints the incoming-webhook secret the gateway itself authenticates",
  "GET /v1/integrations/composio/trigger-types":
    "the trigger catalogue read with the gateway's own Composio project key",
};
