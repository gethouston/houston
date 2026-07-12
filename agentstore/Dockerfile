# Houston Agent Store — Next.js standalone container for GKE.
#
# BUILD CONTEXT IS THE HOUSTON REPO ROOT, not this directory, because the store
# pulls its sibling workspace packages (@houston-ai/core, agentstore-contract,
# design-tokens) through the pnpm workspace. From the repo root:
#
#   docker build -f agentstore/Dockerfile -t houston-agentstore .
#
# Base image + pnpm/corepack + non-root `node` conventions mirror
# selfhost/Dockerfile. Multi-stage: install+build, then a slim runtime that runs
# the traced standalone server with no build toolchain.

# ---- build stage ---------------------------------------------------------
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# Firebase web config for the browser sign-in flow. Next inlines every
# NEXT_PUBLIC_* value into the CLIENT bundle AT BUILD TIME, so these must be set
# here — a runtime env in the pod can never reach an already-inlined bundle.
# Without them firebaseConfig() is null and the whole authed surface (publish,
# claim, /me, /admin) is dead. All three are public web identifiers (they ship
# in the client bundle by design), passed via --build-arg from CI
# (.github/workflows/agentstore-image.yml).
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID

# The whole workspace is needed so pnpm can resolve the store's workspace deps
# and Next can transpile their TS source. .dockerignore trims node_modules and
# build artifacts from the context.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter houston-agentstore build

# ---- runtime stage -------------------------------------------------------
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3300 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# `output: "standalone"` with outputFileTracingRoot at the repo root emits a
# self-contained tree rooted at the workspace, with the server entry at
# agentstore/server.js and its traced node_modules alongside.
COPY --from=builder --chown=node:node /app/agentstore/.next/standalone ./
COPY --from=builder --chown=node:node /app/agentstore/.next/static ./agentstore/.next/static

USER node
EXPOSE 3300
CMD ["node", "agentstore/server.js"]
