# syntax=docker/dockerfile:1
#
# Houston SELF-HOST image — the whole single-user product in ONE container.
#
# This runs the Houston HOST in its local adapter profile (the same server the
# desktop app spawns as its sidecar: packages/host/src/local/main.ts).
# The host serves the v3 API + SSE and lazily spawns pi-runtime subprocesses
# IN THIS CONTAINER over loopback, one per agent — exactly like the desktop, so
# "local = the cloud shrunk to one machine" holds literally here too. No
# Postgres, no Redis, no GCS, no Kubernetes: a single user, a single machine.
#
# Security: the host binds 0.0.0.0 here (HOUSTON_HOST_BIND) so it's reachable
# from outside the container, but EVERY request still needs the boot token, and
# it is meant to sit behind the TLS reverse proxy in docker-compose.yml — never
# exposed as plain HTTP on the internet. The runtime children it spawns stay on
# 127.0.0.1 inside the container; only the host port is published.
#
# BUILD CONTEXT MUST BE THE MONOREPO ROOT — the host + the runtime it spawns
# pull their sibling packages through the pnpm workspace (the root .dockerignore
# trims node_modules/target/.git out of the context):
#
#   docker build -t houston/self-host -f selfhost/Dockerfile .
#   # or just `docker compose up -d --build` from selfhost/ (wires the proxy + volumes).

# The bookworm-slim variant ships bash + coreutils, which the agent's bash/file
# tools rely on. Swap node:22 for a digest for a fully reproducible build.
FROM node:22-bookworm-slim AS host-base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable

# Extras the agent commonly reaches for through its bash tool (curl/wget for
# fetching, git/python3 for scripting); ca-certificates is for the runtime's
# outbound HTTPS to the model provider.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git python3 curl wget ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ui/agent-schemas/ /app/ui/agent-schemas/
COPY packages/protocol/ /app/packages/protocol/
COPY packages/runtime-client/ /app/packages/runtime-client/
COPY packages/domain/ /app/packages/domain/
COPY packages/runtime/ /app/packages/runtime/
COPY packages/host/ /app/packages/host/
# Optional deps are installed on purpose (no --no-optional): the runtime the
# host spawns registers the Claude Agent SDK backend for the `anthropic`
# provider, and self-host / managed-pod users connect their OWN Anthropic
# subscription. That pulls the SDK's per-platform native `claude` binary
# (@anthropic-ai/claude-agent-sdk-linux-<arch>, ~250 MB, glibc — bookworm is
# glibc, so the glibc variant is the right one). It resolves via require.resolve
# under `node --import tsx` (NOT Bun), so no pathToClaudeCodeExecutable override
# is needed here. The CLOUD-only per-turn image (packages/runtime/Dockerfile)
# strips this binary because Anthropic stays off there (ToS).
RUN pnpm install --frozen-lockfile --prod \
      --filter @houston/runtime... \
      --filter @houston/host...

# The whole ~/.houston equivalent (workspaces + credentials + db) lives here so a
# single named volume persists everything. Owned by the non-root node user so a
# mounted volume comes up writable.
RUN mkdir -p /data/workspaces /data/db && chown -R node:node /app /data

ENV NODE_ENV=production \
    HOUSTON_HOME=/data \
    HOUSTON_HOST_BIND=0.0.0.0 \
    HOUSTON_HOST_PORT=4318 \
    HOUSTON_RUNTIME_COMMAND="node --import tsx /app/packages/runtime/src/main.ts"
# HOUSTON_HOST_TOKEN is deliberately NOT defaulted: an unset token would leave the
# host open to anyone who can reach the port. docker-compose.yml requires it.

USER node
WORKDIR /app/packages/host
EXPOSE 4318

# /health is public (no token). Uses Node fetch so the image needs no curl.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.HOUSTON_HOST_PORT||4318)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form → node is PID 1 and gets SIGTERM from `docker stop`; local/main.ts
# handles it (stops the scheduler/watcher and kills spawned runtimes).
CMD ["node", "--import", "tsx", "src/local/main.ts"]

FROM host-base AS engine-pod

# Pods run the agent's bash in-container (HOU-669): each pod is single-tenant
# and network-policied by the private repo, so the container IS the sandbox —
# same posture as self-host. "local" = pi's built-in bash + clamped file tools.
ENV HOUSTON_MANAGED_CLOUD=1 \
    HOUSTON_CODE_EXECUTION=local

FROM host-base AS selfhost
