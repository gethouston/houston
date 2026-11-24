# Code sandbox: design decisions

Covers `packages/code-sandbox/`: the stateless code execution service. Short file paths are relative to `packages/code-sandbox/src/`.

## Deployment and isolation model

The sandbox is a stateless HTTP service on Cloud Run (gen2, `--concurrency=1`). One request runs one program in a fresh working directory that is removed in `finally`, so request N+1 never sees request N's files. It holds no secrets and no persistent state. Runs are kept apart by Cloud Run's per-instance microVM; the service only provides in-instance hygiene so a warm instance can be reused. Submitted code is written by an agent, so the service assumes nothing about what it does.

Lives in `packages/code-sandbox/src/config.ts`, `packages/code-sandbox/src/run.ts` (`runInSandbox`).

## Two gates, two headers

The service deploys with `--no-allow-unauthenticated`, so Cloud Run IAM consumes the `Authorization` header (a Google-signed ID token). The app-layer token therefore rides `X-Sandbox-Token`; putting it in `Authorization` would make IAM reject it first. A `Bearer <token>` value sent in `X-Sandbox-Token` fails rather than half working. The comparison is constant time so the token cannot be recovered through response timing; the length difference is not secret.

Lives in `packages/code-sandbox/src/server.ts` (token check), `config.ts` (`token`).

## An empty token refuses

The service sits behind the gateway's `/v1/code/run` relay, so anything reaching it has already been allowed to run code. A deploy without `SANDBOX_TOKEN` is a deploy mistake and must answer 401 instead of executing for whoever arrives. Local development opts out explicitly with `SANDBOX_ALLOW_UNAUTHENTICATED=1`, the only way an empty token means open. `config` reads the environment once at import, so tests set the override before importing `./config`, and the gate tests re-import `./server` per configuration.

Lives in `config.ts` (`allowUnauthenticated`), `server.ts`, `server-auth.test.ts`, `server.test.ts`.

## Errors carry the real reason

Validation failures (bad language, path outside the workdir, oversize body) answer 400 with the real reason. Executor failures also surface their reason, because the caller is trusted infrastructure (control plane or runtime), never an end user. Request bodies over the configured cap are rejected early; input files are base64, so the cap also caps uploads.

Lives in `server.ts` (`readJson`, `/run` handler), `config.ts` (body cap).

## Kill the process group, settle on exit

The child is spawned `detached` so it leads its own process group. On timeout and after exit the whole group gets SIGKILL, because submitted code can fork grandchildren (`subprocess.Popen`, `sleep &`). Completion is taken from `exit`, not `close`, because a grandchild that inherited stdout can hold the pipe open forever. Killing an already-gone group is the success case. Non-interactive bash puts `&` jobs in the shell's process group, which is why the group kill reaches them.

Lives in `packages/code-sandbox/src/exec.ts` (`killGroup`, `runProcess`).

## Minimal environment

The child gets an explicit environment with nothing inherited; `HOME` and `TMPDIR` point at the disposable workdir.

Lives in `exec.ts`.

## Paths stay inside the workdir

Caller paths resolve strictly inside the run root: absolute paths and `..` segments are refused.

Lives in `packages/code-sandbox/src/paths.ts`.

## Artifact budget in returned bytes

Artifacts are files new or changed relative to seeded inputs, minus the program file. Symlinks are skipped (`dirent.isFile()` is false), so a link cannot read outside the workdir. The budget is enforced on the bytes actually read (no stat/read window) and measured in base64, because base64 inflates by about 4/3 and the response must stay bounded. A file over the budget is listed by path so the caller can tell the model it existed; nothing is dropped silently. Output streams cut at the per-stream cap are flagged.

Lives in `packages/code-sandbox/src/artifacts.ts`, `types.ts`.
