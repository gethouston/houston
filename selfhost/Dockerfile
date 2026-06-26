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
# pull their sibling packages via `file:` links (the root .dockerignore trims
# node_modules/target/.git out of the context):
#
#   docker build -t houston/self-host -f selfhost/Dockerfile .
#   # or just `docker compose up -d --build` from selfhost/ (wires the proxy + volumes).

# The Debian variant ships bash + coreutils, which the agent's bash/file tools
# rely on. Pin the Bun minor line; swap for a digest for a fully reproducible build.
FROM oven/bun:1.3-debian

# Extras the agent commonly reaches for through its bash tool; ca-certificates is
# for the runtime's outbound HTTPS to the model provider.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git python3 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install in dependency order, each package's `file:` siblings present before the
# package that links them (mirrors packages/runtime/Dockerfile.standalone, and
# verified end-to-end as a clean-room build). node_modules is excluded by the
# repo-root .dockerignore, so these COPYs bring only source + manifests.
COPY ui/agent-schemas/ /app/ui/agent-schemas/
COPY packages/protocol/ /app/packages/protocol/
COPY packages/runtime-client/ /app/packages/runtime-client/
COPY packages/domain/ /app/packages/domain/
RUN cd /app/packages/protocol       && bun install --frozen-lockfile \
 && cd /app/packages/runtime-client && bun install --frozen-lockfile \
 && cd /app/packages/domain         && bun install --frozen-lockfile

# The runtime the host spawns per agent, and the host itself.
COPY packages/runtime/ /app/packages/runtime/
RUN cd /app/packages/runtime && bun install --frozen-lockfile
COPY packages/host/ /app/packages/host/
RUN cd /app/packages/host && bun install --frozen-lockfile \
 && rm -rf /root/.bun/install/cache

# The whole ~/.houston equivalent (workspaces + credentials + db) lives here so a
# single named volume persists everything. Owned by the non-root `bun` user so a
# mounted volume comes up writable.
RUN mkdir -p /data/workspaces /data/db && chown -R bun:bun /app /data

ENV NODE_ENV=production \
    HOUSTON_HOME=/data \
    HOUSTON_HOST_BIND=0.0.0.0 \
    HOUSTON_HOST_PORT=4318 \
    HOUSTON_RUNTIME_COMMAND="bun run /app/packages/runtime/src/main.ts"
# HOUSTON_HOST_TOKEN is deliberately NOT defaulted: an unset token would leave the
# host open to anyone who can reach the port. docker-compose.yml requires it.

USER bun
WORKDIR /app/packages/host
EXPOSE 4318

# /health is public (no token). Uses bun so the image needs no curl.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.HOUSTON_HOST_PORT||4318)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form → bun is PID 1 and gets SIGTERM from `docker stop`; local/main.ts
# handles it (stops the scheduler/watcher and kills spawned runtimes).
CMD ["bun", "run", "src/local/main.ts"]
