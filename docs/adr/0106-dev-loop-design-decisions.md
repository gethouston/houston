# Dev loop: design decisions

Covers `scripts/dev/` and `scripts/dev-doctor.mjs`: the `pnpm dev` entry, the reaper, the doctor, the env model and the panes.

## Entry point and reaping

`scripts/dev/dev.sh` is the only `pnpm dev` entry. Order: reap any running stack (one stack per machine; last starter wins so parallel worktrees never fight), then the doctor (after the reap, so only genuinely foreign port holders fail it), then record the owner pid and worktree in a marker (`$$` becomes the mprocs pid via `exec`).

`scripts/dev/reap.sh` kills in this order: the recorded mprocs owner (TERM, graceful), a signature sweep for orphans (a compiled `go run` child outlives its wrapper; the host runs as both tsx's `cli.mjs` and its loader child; per-agent engines carry the absolute `packages/runtime` path), the dev Postgres container (data stays in the `houston-dev-pg` volume), then holders of the stack's ports only when their command looks like ours. Foreign processes are left for the doctor to name. Ports: 5433, 9080, 9091, 8081, 9092, 4318, 1430, 1420 (1420 is the desktop vite server; 9091 and 9092 are the gateway and control-plane metrics listeners, and a leftover holding only 9091 stops the next gateway at boot).

## Doctor (`scripts/dev-doctor.mjs`, `scripts/dev/doctor-lib.mjs`)

Collects every failure with a remedy and prints the feature matrix, exiting 1 on any failure. `.env.local` is parsed early because `CLOUD_DIR` may live there and the doctor must resolve the same cloud checkout the panes will use; precedence mirrors the shell (inline env, then file, then default). `.env.local` may override only the committed keys listed in `PER_DEVELOPER`; any other overlap with `.env.development` is drift and fails. Busy ports hard-fail, because booting anyway guarantees a confusing bind error in whichever pane loses. `portFree` uses lsof first: Node's bind probe sets `SO_REUSEADDR`, so binding a specific address can succeed while another process holds the wildcard address a real pane binds; the wildcard bind probe is only the fallback.

## Env model

`scripts/dev/env.sh` is the shared prelude: `.env.development` (committed, non-secret contract) plus `.env.local` (gitignored secrets that must not redefine committed keys). `CLOUD_DIR` defaults to a sibling `cloud` checkout. `wait_pg` uses `pg_isready`, because docker-proxy accepts TCP before Postgres is up.

## Panes

`logged.sh` tees each pane to `$HOUSTON_HOME/logs/dev-<name>.log` (previous boot kept as `.prev`), because pane scrollback dies with the stack, including when another worktree's `pnpm dev` reaps it. It uses bash for `pipefail` so a crashed pane is not reported as tee's clean exit. `HOUSTON_HOME` defaults to `~/.dev-houston` like the root `dev:host` script. The pane name is restricted to a bare identifier because it becomes part of a file path.

`pg.sh` recreates the container every boot (data persists in the volume) so a half-dead leftover cannot wedge the loop, on port 5433 to avoid a system Postgres; keep in lockstep with `GW_DB_URL`.

`gateway.sh` runs real GCIP sign-in (`GW_DEV` deliberately unset). The gateway serves and clamps models from `GW_CATALOG_PATH`, falling back to a compiled snapshot that lags every pi bump; in the cluster the engine roll writes that file, and here the host pane is the engine, so a loop mirrors the host's `/v1/catalog` into it (the gateway re-reads on mtime change). `exec` keeps the shell's PID so the loop ends with the gateway.

`control-plane.sh` runs dev-launcher mode: agents are local host processes from this checkout, with data under `~/.dev-houston-cloud`. The engine command mirrors the engine-pod image (managed-cloud profile, eager runtime) plus `HOUSTON_LOOPBACK_EGRESS=1`, because dev pods run on this machine and can reach a local model server on 127.0.0.1, unlike a real pod behind its NetworkPolicy.

`web.sh` runs the cloud profile on :1430 against the local gateway. `VITE_NEW_ENGINE_URL` is exported empty because `resolveEngine` gives it top priority and a leaked desktop value would point the web app at the local host, which 401s the GCIP token. `VITE_CP_DEV_TOKEN` must stay unset.

`app.sh` (desktop) has two profiles selected by `DEV_DESKTOP_PROFILE`: `local` (the host pane, and the only pane exercising terminal, reveal-in-OS, dictation and local models) and `cloud` (the local gateway in hosted-oauth mode, multiplayer). Without the Google desktop OAuth client, the local profile blanks `FIREBASE_API_KEY` so the uncompletable auth gate never mounts, and the cloud profile refuses to start.

`tunnel.sh` exposes the gateway on a stable Cloudflare named tunnel so Slack events and OAuth reach :9080; without `CLOUDFLARE_TUNNEL` it idles.

`staging.sh` (`pnpm dev:staging`) runs only the desktop shell against staging, from a single self-contained `.env.staging`. It deliberately does not source `.env.development`, whose localhost `VITE_NEW_ENGINE_URL` would pin the desktop to a host that is not running. Setting `VITE_HOSTED_ENGINE_URL` selects hosted-oauth (and tells the Rust shell to skip the sidecar); `VITE_NEW_ENGINE_URL` is cleared so a leftover cannot win. The `X-Houston-App-Version` identity is log attribution only (the gateway's version floor was retired), and main's version lags the released line by design.

`reset-local.sh` clears the dev stack and Postgres volume, the dev WKWebView container `~/Library/WebKit/houston-app` (named after the productName, not the bundle id, or onboarding flags survive), and `~/.houston` only with `--with-data`, since that data is the cloud-migration source.

`wrong-entry.mjs` keeps retired commands (`pnpm start`, `pnpm dev:cloud`) as loud failures pointing to `pnpm dev`, rather than deleting them and leaving an unhelpful "no script" error.
