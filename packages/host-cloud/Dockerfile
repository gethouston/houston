# Houston Cloud control-plane image (CLOSED). Stateless: Supabase-JWT auth,
# workspace/agent storage (Postgres), per-agent sandbox lifecycle (GKE),
# routing/SSE, per-turn dispatch, and the operator-admin surface. State lives in
# Postgres + the cluster, never here.
#
# The entry is `packages/host-cloud/src/main.ts` (the CLOUD wiring point). It
# depends on `@houston/host` (the OPEN server builder + ports) and sibling pnpm
# workspace packages.
#
# BUILD CONTEXT MUST BE THE MONOREPO ROOT:
#   docker build -t houston/control-plane -f packages/host-cloud/Dockerfile .

# ---------- Install stage ----------
FROM node:22-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ui/agent-schemas/ ./ui/agent-schemas/
COPY packages/protocol/ ./packages/protocol/
COPY packages/runtime-client/ ./packages/runtime-client/
COPY packages/domain/ ./packages/domain/
COPY packages/host/ ./packages/host/
COPY packages/host-cloud/ ./packages/host-cloud/

RUN pnpm install --frozen-lockfile --prod --filter @houston/host-cloud...

# ---------- Runtime stage ----------
FROM node:22-bookworm-slim AS runtime

# Bind externally; the API listener is on 8080.
ENV CP_HOST=0.0.0.0 \
    CP_PORT=8080 \
    CP_PROXY_PORT=8081 \
    NODE_ENV=production

WORKDIR /app
COPY --from=deps /app /app
RUN chown -R node:node /app
USER node
WORKDIR /app/packages/host-cloud

EXPOSE 8080 8081

# Liveness on the public /health route.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--import", "tsx", "src/main.ts"]
