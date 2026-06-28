# Houston code-execution sandbox — the per-task, scale-to-zero box where the
# agent's UNTRUSTED code runs. Deployed to Cloud Run (gen2, --concurrency=1).
#
# BUILD CONTEXT = monorepo root (so the COPY paths below resolve), e.g.:
#   gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT/houston/code-sandbox:v1 .
#
# Cloud Run injects PORT (8080). The container runs as the non-root node user;
# each request executes in a fresh /tmp workdir that is wiped when it returns.
FROM node:22-bookworm-slim
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable

# Interpreters the sandbox can run, plus the common Python libs that make the
# headline use cases work out of the box (decks, spreadsheets, charts, images).
# --break-system-packages: Debian's python3 is PEP-668 externally-managed; inside
# a single-purpose container, installing into system site-packages is fine.
COPY packages/code-sandbox/requirements.txt /tmp/requirements.txt
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt \
    && rm -rf /var/lib/apt/lists/* /tmp/requirements.txt

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/code-sandbox/ ./packages/code-sandbox/
RUN pnpm install --frozen-lockfile --prod --filter @houston/code-sandbox... \
    && chown -R node:node /app

ENV NODE_ENV=production \
    SANDBOX_HOST=0.0.0.0

USER node
WORKDIR /app/packages/code-sandbox
EXPOSE 8080

# Liveness: /health is unauthenticated and never touches the executor.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--import", "tsx", "src/main.ts"]
