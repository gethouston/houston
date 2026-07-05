# Houston pi-runtime — the only supported runtime image, two modes from one Node app:
#   server (default) — the legacy long-lived per-agent pod (GKE), connect-once
#                      serve mode: pulls a short-TTL ACCESS token per turn from
#                      the control plane; never holds a refresh token.
#   turn (HOUSTON_MODE=turn) — the per-turn Cloud Run hosting layer: one
#                      POST /turn = hydrate GCS prefix → run pi → sync → wipe.
#
# BUILD CONTEXT MUST BE THE MONOREPO ROOT (not packages/runtime), because the
# runtime depends on sibling pnpm workspace packages.
#
#   docker build -t houston/pi-runtime:dev -f packages/runtime/Dockerfile .
#   docker run -p 4317:4317 -v agent-data:/data houston/pi-runtime:dev
#
# Keep this as a source-run image, not a compiled-binary image. The final stage
# carries Node + source + node_modules so cloud turn mode, standalone server
# mode, stack traces, and dependency resolution all share the same deploy
# contract.

# ---------- Install stage ----------
FROM node:22-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/protocol/ ./packages/protocol/
COPY packages/runtime-client/ ./packages/runtime-client/
COPY packages/runtime/ ./packages/runtime/

RUN pnpm install --frozen-lockfile --prod --filter @houston/runtime...

# Drop the Claude Agent SDK's per-platform native binary (~250 MB). This image
# is CLOUD-only: server mode = the legacy GKE per-agent pod, turn mode = the
# per-turn Cloud Run runtime. Anthropic stays OFF in cloud (ToS), so this
# runtime never spawns the `claude` subprocess — conversation-cache registers
# the backend but createSession is never reached, and the SDK is a lazy import.
# Keeping the binary would bloat every cold-start image for a code path that
# never runs here. We remove ONLY the platform-binary package (glob matches
# `@anthropic-ai+claude-agent-sdk-<platform>-<arch>`, NOT the `…-sdk@<version>`
# JS package), so a stray import still fails as a clean typed error rather than
# a missing module — and esbuild/tsx's own optional platform binaries (which a
# blanket `--no-optional` would have stripped, breaking `node --import tsx`)
# stay intact. The self-host / engine-pod image (selfhost/Dockerfile) does NOT
# do this: there a user connects their own Anthropic subscription and needs it.
RUN rm -rf /app/node_modules/.pnpm/@anthropic-ai+claude-agent-sdk-*

# ---------- Runtime stage ----------
FROM node:22-bookworm-slim AS runtime

# Tools the agent commonly reaches for through its bash tool; ca-certificates is
# for outbound HTTPS to model providers and object storage.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git python3 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# /data is the mount point for the per-agent persistent volume. HOUSTON_DATA_DIR
# holds runtime data (auth.json, session JSONL); the workspace is the agent's
# working directory. Both live under /data so they survive sleep/wake cycles.
ENV HOUSTON_HOST=0.0.0.0 \
    HOUSTON_PORT=4317 \
    HOUSTON_DATA_DIR=/data \
    HOUSTON_WORKSPACE_DIR=/data/workspace \
    NODE_ENV=production

WORKDIR /app
COPY --from=deps /app /app

# /data is volume-mounted at runtime; pre-create + own it so the non-root node
# user can write there even before the volume's first mount populates it.
RUN mkdir -p /data/workspace && chown -R node:node /data /app
USER node
WORKDIR /app/packages/runtime

# The runtime binds HOUSTON_HOST:HOUSTON_PORT (0.0.0.0:4317 here).
EXPOSE 4317

# Liveness: hit the public /health route (no auth) and let Node's fetch decide.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:4317/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# main.ts loads config (mkdirs data dirs) then starts the node:http server.
CMD ["node", "--import", "tsx", "src/main.ts"]
