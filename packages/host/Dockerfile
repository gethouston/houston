# Houston control-plane image. Stateless: Supabase-JWT auth, workspace/agent
# storage (Postgres), per-agent sandbox lifecycle (GKE), routing/SSE, and the
# keyless credential proxy. State lives in Postgres + the cluster, never here.
#
# BUILD CONTEXT MUST BE THE MONOREPO ROOT — it depends on the sibling package
# `@houston/runtime-client` via the lockfile entry `file:../runtime-client`:
#   docker build -t houston/control-plane -f packages/host/Dockerfile .

# ---------- Install stage ----------
FROM oven/bun:1-slim AS deps
WORKDIR /app

# The `file:` sibling must exist for the frozen-lockfile install to resolve it.
COPY packages/runtime-client/package.json ./packages/runtime-client/package.json
COPY packages/runtime-client/src ./packages/runtime-client/src

# Manifest + lockfile first so this layer caches on deps alone.
COPY packages/host/package.json packages/host/bun.lock ./packages/host/
WORKDIR /app/packages/host
RUN bun install --frozen-lockfile

# ---------- Runtime stage ----------
FROM oven/bun:1-slim AS runtime

# Bind externally; the two listeners are the API (8080) and the keyless proxy (8081).
ENV CP_HOST=0.0.0.0 \
    CP_PORT=8080 \
    CP_PROXY_PORT=8081 \
    NODE_ENV=production

WORKDIR /app/packages/host
COPY --from=deps /app/packages/host/node_modules ./node_modules
COPY --from=deps /app/packages/runtime-client /app/packages/runtime-client
COPY packages/host/package.json packages/host/bun.lock ./
COPY packages/host/src ./src

# Run as the image's built-in non-root `bun` user (uid 1000).
USER bun

EXPOSE 8080 8081

# Liveness on the public /health route; bun --eval exits non-zero on non-2xx.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD bun --eval "const r = await fetch('http://127.0.0.1:8080/health'); if (!r.ok) process.exit(1);"

CMD ["bun", "run", "src/main.ts"]
