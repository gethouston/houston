# C2 — Acting-as token (per-turn user identity for agent pods)

Agent pods are per-agent and shared by users; they must prove WHO is driving
when the runtime calls integration tools. Pods never hold user JWTs (they
expire; routines run with the app closed). Instead the gateway mints a
short-lived token it can verify itself.

## Format

Compact HMAC token (no JWT library needed — same style as `hostTokenFor`):

```
acting-v1.<payloadB64Url>.<sigB64Url>
payload = JSON {
  sub: string,          // acting user's Supabase sub
  name?: string,        // display name for attribution (C5), best-effort
  agent: AgentSlug,     // the ONLY agent this token may act through
  exp: number,          // unix seconds; TTL 30 minutes
}
sig = HMAC-SHA256(GW_HOST_TOKEN_SECRET, "acting-v1." + payloadB64Url)
```

Constant-time signature comparison. Expired/garbled → invalid.

## Mint points (gateway)

1. **Every authenticated request proxied to an agent pod** carries a fresh
   acting-as header: the gateway adds `x-houston-acting-as: <token>` to the
   forwarded request (the Authorization header keeps being swapped to the pod
   token as today). Cheap to mint; no caching needed.
2. **Routine path**: none minted by the gateway. The pod calls integration
   routes with its POD token (`Authorization: Bearer <hostToken>`) PLUS
   `x-houston-acting-user: <sub>` (the routine creator, stored per C3/OS-F).
   The gateway resolves which agent the pod token belongs to (it can recompute
   `hostTokenFor(org, slug)` for the agent in the URL path — pod tokens are
   deterministic), then checks the claimed user is ASSIGNED to that agent
   (C3). Assigned → treat as acting user; else 403.

## Verify points (gateway integrations routes, auth mode 2 of C1)

`Authorization: Bearer acting-v1...` → verify sig + exp → acting user = `sub`,
agent context = `agent`. Grant checks apply per C1/C4.

## Pod-side flow (open repo, OS-A)

- The pod host receives `x-houston-acting-as` on each proxied request. For a
  message dispatch (`POST .../conversations/:id/messages` and the equivalents),
  it passes the token to the runtime as the turn's `actingAs` parameter.
- **Gateway-fronted profiles only.** The runtime decodes the token's payload
  without verifying it, so the host relays the header ONLY when a trusted
  gateway in front mints it and strips client-supplied values
  (`ProxyChannel({ forwardActingHeader: true })`, the cloud wiring). The local
  desktop profile has no gateway — clients hit the host directly — so it sets
  `forwardActingHeader: false` and DROPS any inbound `x-houston-acting-as`
  (otherwise any local client could forge message attribution). The routine
  path is independent of this flag: `fireTurn` sends the server-minted
  `x-houston-acting-user`, never the acting-as header.
- The runtime holds it for the DURATION OF THE TURN only and sends it on
  `/sandbox/integrations/*` calls as `x-houston-acting-as`.
- The pod host's sandbox proxy forwards integration calls upstream
  (RemoteIntegrationProvider) attaching, in order of availability:
  a. the turn's acting-as token (header passthrough), else
  b. pod token + `x-houston-acting-user: <routine creator sub>` (routine turns),
  else the call fails 409 signin_required (surfaced to the agent as actionable).
- Locally (OSS single-user) nothing changes: the direct adapter ignores these.

## Trust statement

A prompt-injected agent can act ONLY as users who actually messaged it within
the TTL, and only through its own agent slug; via the routine path only as
still-assigned routine creators. Cross-agent and cross-user forgery requires
GW_HOST_TOKEN_SECRET.
