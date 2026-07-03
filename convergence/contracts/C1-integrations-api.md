# C1 — Gateway integrations API (Composio platform mode)

The gateway owns the Composio platform key (`COMPOSIO_API_KEY`, k8s Secret) and
serves ALL integration endpoints itself — never proxied to agent pods. Composio
`user_id` is ALWAYS the verified Supabase `sub` of the acting user; a client can
never choose it. Base URL `https://backend.composio.dev`, header `x-api-key`.

These wire shapes are already implemented + live-verified in
`houston` `packages/host/src/integrations/composio*.ts` (adapter),
`packages/host/src/routes/integrations.ts` (routes). Port them; do not invent.

## Auth modes (per request, in precedence order)

1. **User JWT** — `Authorization: Bearer <supabase jwt>` (the normal app path).
   Acting user = JWT `sub`.
2. **Acting-as token** — `Authorization: Bearer <acting-as token>` (see C2),
   presented by agent pods for runtime tool calls. Acting user = token `sub`;
   token also binds `agentSlug` (used for grant checks).
3. Anything else → 401.

## Routes (all under the gateway, JSON)

| Route | Auth | Behavior |
|---|---|---|
| `GET /v1/integrations` | 1,2 | `{items:[{provider:"composio", ready:true}]}` (503 if no key configured) |
| `GET /v1/integrations/composio/toolkits` | 1,2 | Full catalog, cached ≥1h in-process. `{items: Toolkit[]}` |
| `GET /v1/integrations/composio/connections` | 1,2 | Acting user's connections. `{items: Connection[]}` |
| `POST /v1/integrations/composio/connect` `{toolkit}` | 1 only | Auth-config get-or-create (managed OAuth if available, else `use_custom_auth`+`authScheme`+empty credentials) → `POST /api/v3.1/connected_accounts/link {auth_config_id, user_id, callback_url?}` → `{redirectUrl, connectionId}` |
| `GET /v1/integrations/composio/connections/:id` | 1 | Poll one connection: `{toolkit, connectionId, status}`; 404 if absent or another user's |
| `POST /v1/integrations/composio/disconnect` `{toolkit}` | 1 | DELETE every connected account of that toolkit for the acting user → `{ok:true}` |
| `POST /v1/integrations/composio/search` `{query}` | 1,2 | `GET /api/v3/tools?query=&limit=10` **scoped by grants** (below) → `{items: ToolMatch[]}` |
| `POST /v1/integrations/composio/execute` `{action, params}` | 1,2 | **Grant-checked**, then `POST /api/v3/tools/execute/:action {user_id, arguments}` → `{successful, data?, error?}` |
| `GET /v1/agents/:slug/integration-grants` | 1 | `{toolkits: string[]}` — the acting user's grants for that agent (must be assigned to it) |
| `PUT /v1/agents/:slug/integration-grants` `{toolkits: string[]}` | 1 | Replace the acting user's grant set for that agent (must be assigned) → `{ok:true}` |

## Port shapes (identical to houston `packages/host/src/integrations/types.ts`)

```ts
Toolkit    = { slug, name, description?, logoUrl?, categories? }
Connection = { toolkit, connectionId, status: "active"|"pending"|"error" }
ToolMatch  = { action, toolkit, description, inputParams? }
ActionResult = { successful, data?, error? }
```
Status mapping: ACTIVE→active; INITIALIZING/INITIATED→pending; else error.

## Grant enforcement (C4 semantics)

For `(actingUser, agentContext)` where agentContext = acting-as token's
`agentSlug` (auth mode 2). Auth mode 1 (a human in the UI, no agent context):
NO grant filter — humans see their own full state.

- `search` (mode 2): add `toolkit_slug=<granted,csv>` to the Composio query;
  empty grant set → return `{items: []}` (NOT an error).
- `execute` (mode 2): action's toolkit prefix (slug before first `_`, matched
  against granted toolkits case-insensitively — verify against a real ToolMatch's
  `toolkit` field instead if available; prefer looking up the tool once) not
  granted → **403** `{error:"this agent doesn't have access to <toolkit>",
  code:"toolkit_not_granted"}`.
- Grant reads/writes require the acting user to be **assigned** to the agent
  (C3); owners/admins are implicitly assigned to agents they created.

## Errors

- Missing key → 503 `{error:"integrations not configured"}` on every route.
- Composio non-2xx → 502 `{error:"composio <method> <path> → <status>: <detail ≤300>"}`
  (surface, never swallow).
- Unknown provider segment → 404.
