# @houston/code-sandbox

The per-task **code-execution sandbox** — the disposable box where a Houston
agent's *untrusted* code runs. A stateless HTTP service deployed to **Cloud Run
(gen2, `--concurrency=1`)**; it scales to zero, so it costs ~$0 when idle.

This is the "rented sandbox" half of the cheap-agent architecture. See
[`cloud/code-execution.md`](../../cloud/code-execution.md) for the full design,
isolation posture, and pricing.

## API

- `GET /health` → `{ "status": "ok" }` (unauthenticated; never touches the executor).
- `POST /run` (Bearer-gated when `SANDBOX_TOKEN` is set):

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
pnpm dev             # listens on :8080 (or $PORT)
pnpm test            # real python/bash/node execution + HTTP routing
```

## Config (env)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Cloud Run injects this. |
| `SANDBOX_TOKEN` | `""` | Required Bearer; empty = open (local dev only). |
| `SANDBOX_MAX_BODY_BYTES` | `33554432` | Reject larger request bodies. |

## Deploy

`./cloud/scripts/05-code-sandbox.sh` (build via Cloud Build → deploy to Cloud Run
with the untrusted-code isolation flags). Build context is the **monorepo root**.
