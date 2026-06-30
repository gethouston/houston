# Houston engine-pod image — the pi runtime running as a standalone k8s pod.
#
# The control plane's GkeLauncher creates one pod per agent. The pi runtime
# (`packages/runtime`) runs in server mode: binds 0.0.0.0:4317, enforces
# HOUSTON_RUNTIME_TOKEN as the inbound Bearer so only the control-plane proxy
# can reach it, and keeps the agent's workspace on the PVC at /data.
#
# BUILD CONTEXT MUST BE THE MONOREPO ROOT:
#   docker build -t houston/engine-pod:local -f cloud/k8s/poc/engine-pod.Dockerfile .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable

# Tools the agent's bash tool reaches for (python3 for scripting, git, etc.).
RUN apt-get update && apt-get install -y --no-install-recommends \
      git python3 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ui/agent-schemas/ /app/ui/agent-schemas/
COPY packages/protocol/ /app/packages/protocol/
COPY packages/runtime-client/ /app/packages/runtime-client/
COPY packages/domain/ /app/packages/domain/
COPY packages/runtime/ /app/packages/runtime/

RUN pnpm install --frozen-lockfile --prod --filter @houston/runtime...

RUN mkdir -p /data/workspace && chown -R node:node /app /data

# Defaults: override via k8s env vars in the Deployment spec.
ENV NODE_ENV=production \
    HOUSTON_HOST=0.0.0.0 \
    HOUSTON_PORT=4317 \
    HOUSTON_WORKSPACE_DIR=/data/workspace \
    HOUSTON_DATA_DIR=/data

USER node
WORKDIR /app/packages/runtime
EXPOSE 4317

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.HOUSTON_PORT||4317)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--import", "tsx", "src/main.ts"]
