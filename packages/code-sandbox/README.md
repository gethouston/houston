# @houston/code-sandbox

The per-task **code-execution sandbox** — the disposable box where a Houston
agent's *untrusted* code runs. A stateless HTTP service deployed to **Cloud Run
(gen2, `--concurrency=1`)**; it scales to zero, so it costs ~$0 when idle.

This is the "rented sandbox" half of the cheap-agent architecture: the
runtime's `run_code` tool (`packages/runtime/src/session/tools/run-code.ts`)
ships code and input files here and gets stdout, stderr and artifacts back,
so an agent needs no in-container shell.

## How it ships, and who calls it

1. `.github/workflows/code-sandbox-image.yml` builds this package's Dockerfile
   (monorepo root as context) and pushes `code-sandbox:<sha>` + `:latest` to
   Artifact Registry, then fires a `repository_dispatch` at the private
   gethouston/cloud repo. This repo never touches Cloud Run — that handoff is
   the trust boundary.
2. cloud deploys that digest to Cloud Run and points the gateway at it. The
   gateway serves `POST /v1/code/run` for a turn whose grant carries the
   `code-run` scope, and relays the request here.
3. A pooled **turn worker** calls `run_code` through that grant
   (`packages/runtime/src/turn/turn-sandbox-code.ts`): it holds no sandbox URL,
   no `SANDBOX_TOKEN` and no GCP identity, so a worker that serves another
   org's turn next has nothing durable to leak.
4. A **server-mode or self-host** runtime may still call this service directly
   with `HOUSTON_CODE_EXECUTION=remote` + `HOUSTON_CODE_SANDBOX_URL` +
   `HOUSTON_CODE_SANDBOX_TOKEN` (plus a metadata-server ID token where Cloud Run
   IAM applies). Turn mode needs none of those vars.

The Cloud Run service runs with **deny-all egress** (VPC connector + egress
rules): code that runs here can reach nothing. `pip install` at request time is
dead by design — bake every Python dependency into `requirements.txt` so it
ships in the image.

## API

- `GET /health` → `{ "status": "ok" }` (unauthenticated; never touches the executor).
- `POST /run` (gated on `X-Sandbox-Token`; see the auth note under Config):

  ```jsonc
  // request
  { "language": "python|bash|node", "code": "print('hi')",
    "files": [{ "path": "in.csv", "contentBase64": "…" }], "timeoutMs": 60000 }
  // response
  { "exitCode": 0, "stdout": "hi\n", "stderr": "", "timedOut": false, "truncated": false,
    "artifacts": [{ "path": "out.txt", "contentBase64": "…", "bytes": 7 }], "durationMs": 42 }
  ```

Each request runs in a **fresh temp workdir** that is wiped when the request
returns, with a minimal non-secret environment, a hard timeout, and output +
artifact caps. The service holds no secrets and no persistent state.

## Run / test locally

```sh
# /run refuses without a token, so dev either sets one or opts out explicitly.
SANDBOX_ALLOW_UNAUTHENTICATED=1 pnpm dev   # listens on :8080 (or $PORT)
pnpm test                                  # real python/bash/node execution + HTTP routing
```

## Config (env)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Cloud Run injects this. |
| `SANDBOX_TOKEN` | `""` | The app-layer token, presented in `X-Sandbox-Token`. Empty **refuses** `/run` with 401. |
| `SANDBOX_ALLOW_UNAUTHENTICATED` | `""` | `1` = serve `/run` with no token. The ONLY way an empty `SANDBOX_TOKEN` means "open" — local dev only. |
| `SANDBOX_MAX_BODY_BYTES` | `33554432` | Reject larger request bodies. |

An unset token is a deploy mistake, not a decision: behind the gateway relay
anything that reaches this service has already been told it may run code, so the
service fails closed instead of executing for whoever arrives.

## Deploy

Merging to `main` builds and publishes the image; the cloud repo deploys it (see
"How it ships" above). Tag `code-sandbox-v*` to ship the same build to prod.

By hand, or for a private deployment: build `packages/code-sandbox/Dockerfile`
with the **monorepo root** as build context, push it, and create a Cloud Run
gen2 service with `--concurrency=1`, `--no-allow-unauthenticated`,
deny-all egress, and `SANDBOX_TOKEN` set from Secret Manager.
