# @houston/code-sandbox

The per-task **code-execution sandbox** — the disposable box where a Houston
agent's *untrusted* code runs. A stateless HTTP service deployed to **Cloud Run
(gen2, `--concurrency=1`)**; it scales to zero, so it costs ~$0 when idle.

This is the "rented sandbox" half of the cheap-agent architecture: the
runtime's `run_code` tool (`packages/runtime/src/session/tools/run-code.ts`)
ships code and input files here and gets stdout, stderr and artifacts back,
so an agent needs no in-container shell. The runtime selects it with
`HOUSTON_CODE_EXECUTION=remote` + `HOUSTON_CODE_SANDBOX_URL`
(`packages/runtime/src/config.ts`).

**Deployment status:** not deployed. No committed manifest in this repo or in
the cloud repo sets `HOUSTON_CODE_SANDBOX_URL`, so every runtime today runs
with `local` (in-container bash) or `disabled`.

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

There is no deploy script in this repo (the one this README used to point at
lived in a retired repository). To deploy: build `packages/code-sandbox/Dockerfile`
with the **monorepo root** as build context, push it, and create a Cloud Run
gen2 service with `--concurrency=1`, `--no-allow-unauthenticated`, and
`SANDBOX_TOKEN` set; then point the runtime at it with
`HOUSTON_CODE_SANDBOX_URL` and `HOUSTON_CODE_EXECUTION=remote`.
