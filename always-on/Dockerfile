# Houston Engine — standalone deployment image.
#
# Produces a minimal image that runs the `houston-engine` binary.
# Typical deployment: VPS (Houston Always On), behind a reverse proxy with TLS.
#
#   docker build -t houston/engine:dev -f always-on/Dockerfile .
#   docker run -p 7777:7777 \
#     -e HOUSTON_BIND_ALL=1 \
#     -e HOUSTON_BIND=0.0.0.0:7777 \
#     -e HOUSTON_ENGINE_TOKEN=<your-token> \
#     -v houston-home:/data/.houston \
#     -v houston-docs:/data/Houston \
#     houston/engine:dev

# ---------- Build stage ----------
FROM rust:1-slim-bookworm AS build
WORKDIR /src

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Cache the dependency compile by copying the manifests first.
COPY Cargo.toml Cargo.lock ./
COPY engine/ engine/
# Workspace lists `app/houston-tauri` and `app/src-tauri` as members, so their
# manifests must exist for cargo to load the workspace — even though `-p
# houston-engine-server` will not compile them (no path in its dep tree).
COPY app/houston-tauri/ app/houston-tauri/
COPY app/src-tauri/ app/src-tauri/
# `houston-agent-files` embeds the `@houston-ai/agent-schemas` JSON files
# (activity / routines / routine_runs / config / learnings) at compile time via
# `include_str!("../../../ui/agent-schemas/src/*.schema.json")` — that subtree
# is the source of truth for the `.houston/*` data layout, see
# `knowledge-base/architecture.md`.
COPY ui/agent-schemas/ ui/agent-schemas/

# Only build the engine server binary — excludes the desktop app crates.
RUN cargo build --release -p houston-engine-server --bin houston-engine

# ---------- Runtime stage ----------
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --create-home --home-dir /data houston \
 && mkdir -p /data/.houston /data/Houston \
 && chown -R houston:houston /data

COPY --from=build /src/target/release/houston-engine /usr/local/bin/houston-engine

USER houston
WORKDIR /data
ENV HOUSTON_HOME=/data/.houston \
    HOUSTON_DOCS=/data/Houston \
    HOUSTON_BIND=0.0.0.0:7777 \
    HOUSTON_BIND_ALL=1

EXPOSE 7777
CMD ["/usr/local/bin/houston-engine"]
