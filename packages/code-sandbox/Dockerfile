# Houston code-execution sandbox — the per-task, scale-to-zero box where the
# agent's UNTRUSTED code runs. Deployed to Cloud Run (gen2, --concurrency=1).
#
# BUILD CONTEXT = monorepo root (so the COPY paths below resolve), e.g.:
#   gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT/houston/code-sandbox:v1 .
# The service has NO npm/bun dependencies (Node/Bun stdlib only); the only
# heavyweight bits are the language toolchains + the Python "batteries".
#
# Cloud Run injects PORT (8080). The container runs as the non-root `bun` user;
# each request executes in a fresh /tmp workdir that is wiped when it returns.
FROM oven/bun:1-slim

# Interpreters the sandbox can run, plus the common Python libs that make the
# headline use cases work out of the box (decks, spreadsheets, charts, images).
# --break-system-packages: Debian's python3 is PEP-668 externally-managed; inside
# a single-purpose container, installing into system site-packages is fine.
COPY packages/code-sandbox/requirements.txt /tmp/requirements.txt
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip nodejs ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt \
    && rm -rf /var/lib/apt/lists/* /tmp/requirements.txt

WORKDIR /app
COPY packages/code-sandbox/package.json ./
COPY packages/code-sandbox/src ./src

ENV NODE_ENV=production \
    SANDBOX_HOST=0.0.0.0

USER bun
EXPOSE 8080

# Liveness: /health is unauthenticated and never touches the executor.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD bun --eval "const r = await fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health'); if(!r.ok) process.exit(1);"

CMD ["bun", "run", "src/main.ts"]
