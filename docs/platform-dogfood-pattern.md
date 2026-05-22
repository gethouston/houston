# Platform Dogfood Pattern — for AI-Product Authors

> Companion doc to [#256](https://github.com/gethouston/houston/issues/256).
> Captures patterns that surfaced from shipping an 8-PR autonomous arc onto a Houston-shaped substrate (chat surface routed through a gRPC/WS gateway to a Rust agent runtime). Houston team: please cherry-pick whatever fits the platform conventions; the rest is here as reference for product authors who hit the same walls.

## Why this exists

Every AI-product platform sits at a stack like:

```
browser  →  edge route  →  reverse-proxy  →  gateway  →  agent runtime  →  model provider
              (CORS, auth)   (Caddy/nginx)   (auth, scopes)   (inference)
```

Each hop can break silently. CI-green doesn't prove the substrate works end-to-end; the only test that closes the loop is **a real client-shaped request that opens the stream and reads a token**. We call this *dogfood*. Smoke testing is necessary; dogfood is sufficient.

This doc captures five rules + one diagnostic primitive that we wish we'd known before the arc began.

## Rule 1 — Dogfood, not just smoke

Pre-merge of the arc: 528 unit tests + a 5-probe curl smoke battery, all green.
Post-merge production: **chat broken end-to-end** for every user.

Cause: the unit tests stubbed the gateway WS client; the smoke battery only exercised auth-rejection paths (401/400). Neither opened a real WebSocket from a real browser-shaped client. The bug — a missing `Sec-WebSocket-Protocol`-based bearer extraction in the gateway — only surfaced when a real client tried to authenticate the WS upgrade.

**Rule:** every multi-PR arc that touches a streaming/WS surface MUST end with a dogfood request that:

1. Uses the production client shape (browser `WebSocket` API if the in-app UI is browser; matching headers and sub-protocol carriers)
2. Runs against the deployed code on the deploy target (not a local stack)
3. Asserts on the first *token* received, not on HTTP 200

If the platform can register a one-line dogfood probe per agent and run it post-deploy, the merge → deploy → green-light loop becomes self-closing.

## Rule 2 — Browser WebSocket has hidden auth constraints

`globalThis.WebSocket` (the browser API the in-app chat almost certainly uses) **cannot set the `Authorization` header on the upgrade request**. The WebSocket spec disallows it. Every WS library documents `Sec-WebSocket-Protocol: bearer.<token>` as the auth carrier in browsers; gateway middleware that only checks `Authorization` will silently reject every browser-originated request while passing every Node-`ws`-with-Authorization test.

**Two-part fix that worked for us:**

1. **Gateway side**: extract bearer from `Sec-WebSocket-Protocol: bearer.<jwt>` as a first-class source, not a fallback. Authorization wins when both are present. Echo the chosen sub-protocol back in the 101 response — the browser closes with code 1006 (silent failure) if the response doesn't echo at least one offered sub-protocol.
2. **Reverse-proxy side**: explicitly forward `Sec-WebSocket-Protocol` upstream during WS upgrade. Caddy strips it by default during the upgrade hop; nginx behavior varies by version + config. Use the full placeholder form, not shorthands.

**For Houston:** if Houston's substrate accepts browser-WS clients, the platform-level WS handler should accept both carriers out of the box, and the platform's reverse-proxy guidance should document the forwarding requirement.

## Rule 3 — Rich-editor UI inputs don't accept synthetic input

We tried five input methods (execCommand, OS-level synthetic, clipboard paste, scene-graph, eval) against a chat input built on Facebook's Lexical editor. **None reached the editor's internal React state.** This is shared with ProseMirror, Slate, Monaco — any state-managed contenteditable.

For any auto-dogfood / auto-QA agent that drives an in-app UI of an AI product, the chat input is the wall. The pivot: API-direct dogfood through the same handler the UI calls, plus a separate visual check that the UI loads and renders.

**For Houston:** ship a platform convention — `POST /houston/dogfood` or similar — that lets the autonomous loop send a user-shaped request to the same handler the UI calls, without going through the editor. Build it once at the platform layer; every Houston-built product reuses it.

## Rule 4 — Deployed ≠ merged

We spent ~90 minutes in a state where four PRs were merged + CI-green but production served stale code. The deploy target (Vercel) was failing every build silently due to a Next.js 16 `middleware.ts` / `proxy.ts` collision that landed in an earlier PR. The `merged` status on GitHub said nothing about prod.

**Rule:** after every merge to a deploy-target branch, confirm the deployed commit SHA matches the merged commit SHA *at the platform target* before declaring work complete:

```bash
# Vercel via GitHub deployments API
gh api repos/<owner>/<repo>/deployments?sha=$MERGE_SHA --jq '.[] | select(.environment | test("Production")) | .id' \
  | xargs -I{} gh api repos/<owner>/<repo>/deployments/{}/statuses --jq '.[0].state'
# expect: success

# Railway via railway CLI
railway service status --service <name> --json | jq -r .status
# expect: SUCCESS
```

For Houston's own deploy substrate, equivalent should exist and the autonomous loop should require `SUCCESS` from the platform target before declaring the work done.

## Rule 5 — Auto-merge availability is repo policy

`gh pr merge --auto --merge` returned `GraphQL: Auto merge is not allowed for this repository` on both repos in our arc. Every merge required manual `gh pr merge --merge` after CI-green. This broke the "fire watcher + walk away" pattern.

**Session-start check:**

```bash
gh api repos/<owner>/<repo> --jq .allow_auto_merge
```

If `false`: either enable it in repo Settings → Pull Requests, or budget for a manual-merge step in the autonomous loop.

## The one diagnostic primitive — distinguishing probe

The "Sec-WebSocket-Protocol path returns 'missing'" symptom had three root causes that looked identical from the outside:

1. Reverse-proxy strips the header before it reaches the gateway
2. Gateway image is old (extraction code not yet deployed)
3. Extraction code is wrong (deployed but buggy)

Each implies a different fix. The probe that separated them in 50ms:

```bash
curl -i --http1.1 -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Protocol: bearer.junk" \
  https://gateway.example.com/v1/agent/stream
```

- Response `Grpc-Message: invalid Tier-1 bearer` → bearer reached extraction → eliminates (1) and (2). Cause is (3).
- Response `Grpc-Message: missing Tier-1 bearer token` → bearer never extracted → eliminates (3). Cause is (1) or (2).

**Generalization:** before any non-trivial multi-cause fix, design a single probe that distinguishes the candidate root causes. Prefer probes that exercise the suspect output against a known-invalid input — the *error message* often discriminates faster than the success path. Bake favoured probes into a `dogfood-probes/` folder that ships with the platform.

## What we did differently after learning these

- Added request-header trace logging to the gateway's auth middleware (`has_authorization`, `has_subprotocol`, `subprotocol_value` at debug). Production-grade reverse-proxy debugging now takes one log grep instead of three PR cycles.
- Promoted "API-pivot when UI-input fails" to a documented gotcha in the in-house browser-automation skill.
- Treat deploy-target SHA confirmation as part of the merge gate, not a post-merge optional check.
- Added an autonomous-flow lessons section to `AGENTS.md` mapping each rule above to the workspace's existing primitive table (P1–P20).

## Status of these patterns in our workspace

| Rule | Maps to / extends |
|---|---|
| 1. Dogfood mandatory | P11 (Empirical) — extends "validate by interacting" to require *client-shaped* interaction |
| 2. Browser-WS constraints | P14 (Dep-Chain) — the dep chain for any in-browser feature must include browser-API constraints |
| 3. UI-input fallback to API | New tactic (rule-of-three pending) |
| 4. Deploy ≠ merge | P4 (Pipeline) — extends merge gate to include deploy-target SHA confirmation |
| 5. Auto-merge availability | P15 (Snapshot) — add `allow_auto_merge` to session-start state surface |
| Distinguishing probe | P11 (Empirical) sub-rule — probes that narrow the cause space |

Happy to discuss any of these, or extract / drop / rewrite sections — open this as a docs PR to invite comment.
