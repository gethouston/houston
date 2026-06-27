# Houston Cloud control-plane image (CLOSED). Stateless: Supabase-JWT auth,
# workspace/agent storage (Postgres), per-agent sandbox lifecycle (GKE),
# routing/SSE, per-turn dispatch, and the operator-admin surface. State lives in
# Postgres + the cluster, never here.
#
# The entry is `packages/host-cloud/src/main.ts` (the CLOUD wiring point). It
# depends on `@houston/host` (the OPEN server builder + ports) via the lockfile
# entry `file:../host`, which itself links `@houston/domain` / `@houston/protocol`
# / `@houston/runtime-client`.
#
# BUILD CONTEXT MUST BE THE MONOREPO ROOT:
#   docker build -t houston/control-plane -f packages/host-cloud/Dockerfile .

# ---------- Install stage ----------
FROM oven/bun:1-slim AS deps
WORKDIR /app

# The `file:` siblings must exist for the frozen-lockfile installs to resolve.
# Install in dependency order (each package's siblings present before it links
# them), mirroring selfhost/Dockerfile. node_modules is excluded by the repo-root
# .dockerignore, so these COPYs bring only source + manifests.
COPY ui/agent-schemas/ ./ui/agent-schemas/
COPY packages/protocol/ ./packages/protocol/
COPY packages/runtime-client/ ./packages/runtime-client/
COPY packages/domain/ ./packages/domain/
RUN cd /app/packages/protocol       && bun install --frozen-lockfile \
 && cd /app/packages/runtime-client && bun install --frozen-lockfile \
 && cd /app/packages/domain         && bun install --frozen-lockfile

# The OPEN host (the server builder host-cloud wires), then host-cloud itself.
COPY packages/host/ ./packages/host/
RUN cd /app/packages/host && bun install --frozen-lockfile
COPY packages/host-cloud/ ./packages/host-cloud/
WORKDIR /app/packages/host-cloud
RUN bun install --frozen-lockfile

# ---------- Runtime stage ----------
FROM oven/bun:1-slim AS runtime

# Bind externally; the API listener is on 8080.
ENV CP_HOST=0.0.0.0 \
    CP_PORT=8080 \
    CP_PROXY_PORT=8081 \
    NODE_ENV=production

WORKDIR /app
COPY --from=deps /app/ui /app/ui
COPY --from=deps /app/packages/protocol /app/packages/protocol
COPY --from=deps /app/packages/runtime-client /app/packages/runtime-client
COPY --from=deps /app/packages/domain /app/packages/domain
COPY --from=deps /app/packages/host /app/packages/host
COPY --from=deps /app/packages/host-cloud /app/packages/host-cloud

WORKDIR /app/packages/host-cloud

# Run as the image's built-in non-root `bun` user (uid 1000).
USER bun

EXPOSE 8080 8081

# Liveness on the public /health route; bun --eval exits non-zero on non-2xx.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD bun --eval "const r = await fetch('http://127.0.0.1:8080/health'); if (!r.ok) process.exit(1);"

CMD ["bun", "run", "src/main.ts"]
