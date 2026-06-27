# @houston/host — the Houston host (cloud control plane + local desktop supervisor)

The host is the one HTTP/SSE server the frontend talks to. Local desktop and
Houston Cloud share the same router, auth seam, domain layer, scheduler, event
bus, and runtime-channel contracts; only the adapter profile changes at `main()`.
Cloud-only concrete adapters live in `@houston/host-cloud`.

The package is pnpm-managed and frontend-agnostic. Bun is not required for dev,
tests, or Docker runtime; it is only used by `scripts/build-host-sidecar.sh` when
compiling the desktop host-sidecar binary.

## Run

```bash
pnpm install
cd packages/host
pnpm dev          # local desktop/web host, src/local/main.ts, serves :4318
```

Cloud profile:

```bash
cd packages/host-cloud
CP_DEV=1 pnpm dev # cloud wiring with fake stores/launchers
```

## Test

```bash
cd packages/host
pnpm test
```

See `convergence/README.md` for architecture and parity gates.
