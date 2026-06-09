# Houston pi-runtime — per-agent sandbox image (cloud / "control plane" control plane).
#
# Replaces the obsolete Rust always-on/Dockerfile. One container == one agent's
# pi engine, scheduled by the control plane SandboxManager (GKE / Agent-Sandbox). It runs
# KEYLESS: no real provider key lives here — pi-ai's baseUrl points at the control plane
# keyless proxy and the sandbox carries only a non-secret control plane-issued token.
#
# BUILD CONTEXT MUST BE THE MONOREPO ROOT (not packages/runtime), because the
# engine depends on the sibling package `@houston/runtime-client` via the
# lockfile entry `file:../runtime-client`. `bun install --frozen-lockfile` has to
# see that sibling on disk to resolve the dep:
#
#   docker build -t houston/pi-runtime:dev -f packages/runtime/Dockerfile .
#   docker run -p 4317:4317 -v agent-data:/data houston/pi-runtime:dev
#
# NOTE: this image was authored without a docker daemon available, so it has not
# been built/run here. It is intended to be correct and minimal; verify with a
# real `docker build` in CI before shipping.

# ---------- Install stage ----------
# Resolve dependencies in a throwaway layer so the runtime stage carries only
# the engine + its installed node_modules, not bun's global cache or build cruft.
FROM oven/bun:1-slim AS deps
WORKDIR /app

# @houston/runtime-client is a `file:` sibling dep. Its package.json + src must
# exist for the frozen-lockfile install to resolve. At runtime the engine only
# ever does `import type` from it (fully erased by Bun), so no `dist` build is
# needed — the package just has to be resolvable here.
COPY packages/runtime-client/package.json ./packages/runtime-client/package.json
COPY packages/runtime-client/src ./packages/runtime-client/src

# Copy the engine manifest + lockfile first so this layer caches on deps alone:
# it only re-runs when package.json / bun.lock change, not on every src edit.
COPY packages/runtime/package.json packages/runtime/bun.lock ./packages/runtime/

# --frozen-lockfile: fail loudly if package.json and bun.lock have drifted,
# instead of silently resolving a different tree (no silent failures).
WORKDIR /app/packages/runtime
RUN bun install --frozen-lockfile

# ---------- Runtime stage ----------
# Slim Bun base. The official oven/bun image already ships a non-root `bun`
# user (uid 1000); we run as it rather than minting our own.
FROM oven/bun:1-slim AS runtime

# /data is the mount point for the per-agent persistent volume. HOUSTON_HOME
# holds engine data (auth.json, session JSONL); the workspace is the agent's
# working directory. Both live under /data so they survive sleep/wake cycles.
ENV HOUSTON_HOST=0.0.0.0 \
    HOUSTON_PORT=4317 \
    HOUSTON_HOME=/data \
    HOUSTON_WORKSPACE_DIR=/data/workspace \
    NODE_ENV=production

WORKDIR /app/packages/runtime

# Bring in the resolved dependency trees from the install stage. The sibling
# engine-client tree is referenced by the engine's node_modules `file:` symlink,
# so it has to be present at the same relative path it was installed against.
COPY --from=deps /app/packages/runtime/node_modules ./node_modules
COPY --from=deps /app/packages/runtime-client /app/packages/runtime-client

# Application source. Copied after node_modules so a code change doesn't bust
# the (heavier) dependency layer.
COPY packages/runtime/package.json packages/runtime/bun.lock ./
COPY packages/runtime/src ./src

# /data is volume-mounted at runtime; pre-create + own it so the non-root `bun`
# user can write there even before the volume's first mount populates it.
USER root
RUN mkdir -p /data/workspace && chown -R bun:bun /data /app
USER bun

# The engine binds HOUSTON_HOST:HOUSTON_PORT (0.0.0.0:4317 here).
EXPOSE 4317

# Liveness: hit the public /health route (no auth) and let bun's fetch decide.
# `bun --eval` exits non-zero on a non-2xx or a thrown fetch error, so an
# unhealthy engine is reported as such instead of being swallowed.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD bun --eval "const r = await fetch('http://127.0.0.1:4317/health'); if (!r.ok) process.exit(1);"

# main.ts loads config (mkdir's data dirs) then starts the node:http server.
CMD ["bun", "run", "src/main.ts"]
