# Convergence follow-ups (non-blocking)

Items deliberately left as clean follow-ups by the autonomous finish pass. None block
the product; each is either cosmetic, or carries a risk best paid with a live app to test
against. Listed so they're tracked, not lost.

## 1. Route prefix `/agents/*` → `/v1/agents/*`
The domain families added during convergence already live under `/v1/*`
(`/v1/workspaces`, `/v1/preferences`, `/v1/integrations`, `/v1/events`, …). The original
conversation/agent routes are still un-prefixed (`/agents/:id/...`). They work correctly;
the `/v1/` prefix is consistency only. Deferred because it's a coordinated host+client wire
change (no compat layer, per the no-backwards-compat rule) and the client call sites are
plain `fetch` URLs not caught by typecheck — safest done with the app running so a missed
caller surfaces as a 404 immediately. Touch: `packages/host/src/routes/agents.ts` +
`server.ts` mounts, `packages/web/src/engine-adapter/*`, any app caller.

## 2. v3 client consolidation
The real v3 client transport currently lives in `packages/web/src/engine-adapter/` and the
app aliases `@houston-ai/engine-client` → it. The legacy `ui/engine-client` is still the v1
(Rust-engine) client used by the default build. After the final cutover (engine gone), move
the v3 client into `@houston-ai/engine-client` (`ui/engine-client`) so app + web share ONE
client package, and delete the v1 transport. This is the plan's "engine-client transport
rewritten; engine-adapter deleted" end-state, reached by consolidation rather than deletion.

## 3. `createControlPlaneServer` → `createHostServer`
The package is now `@houston/host`, but the server-builder identifier is still
`createControlPlaneServer` (and a few `[control-plane]` log prefixes / `MANAGED_BY` value /
`HOUSTON_CONTROL_PLANE_URL` env). These are internal identifiers, not paths — left intact by
the rename (renaming them is a behavior-touching change, not a path move). Cosmetic; do in a
dedicated identifier-rename pass.

## 4. `build-host-sidecar.sh --verify` curl race
The `--verify` step curls the freshly-built sidecar immediately after the LISTENING banner
with no port-poll, so it can race on a cold boot (the binary boots + serves fine — confirmed
manually). Make `--verify` poll `/health` with a short retry loop instead of a single curl.

## 5. Cloud adapter integration tests (real infra)
The closed `@houston/host-cloud` (now in its own repo) covers Pg (pg-mem) and Redis
(ioredis-mock) behaviorally. `GcsVfs` and `GkeLauncher` are env-gated integration tests that
need a real bucket / cluster — see that package's `src/vfs/README-testing.md` and
`src/launcher/README-testing.md`. Wire these into a nightly/integration CI there that has
the credentials (the PR gate stays hermetic).

## 6. Deploy identities still say "control-plane"
The k8s Deployment/Service/SA names, the `control-plane:v8` image tag, `CP_*` env vars, and
`houston.ai/component: control-plane` labels were intentionally NOT renamed (changing a live
deploy identity is an ops migration, not a code rename). Rename them as a coordinated infra
change in the closed Houston Cloud repo when convenient.

## 7. Own-message attribution label decision
C5 currently keeps the viewer's own user bubbles visually unchanged in shared chats; teammate
bubbles show labels once a thread has multiple authors. If product wants an explicit localized
"You" label later, make that a deliberate UI decision and update `convergence/contracts/C5-attribution.md`
plus `ui/chat` label defaults together.
