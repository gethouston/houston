import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

/**
 * Contract test for the per-agent pi-runtime container image
 * (packages/runtime/Dockerfile + Dockerfile.dockerignore + docker-compose.yml).
 *
 * We cannot run `docker build` here (no daemon), so instead we assert the
 * Dockerfile encodes the SAME contract the runtime source actually depends on:
 * the port it binds, the env vars config.ts reads, the entrypoint, the health
 * route the server serves, and the sibling workspace dependency. If the engine
 * drifts (e.g. someone renames HOUSTON_WORKSPACE_DIR or moves /health), these
 * assertions fail instead of the breakage surfacing only at deploy time.
 */

// This test lives at packages/runtime/, so the engine dir is its own directory.
const ENGINE = dirname(fileURLToPath(import.meta.url));

const dockerfile = readFileSync(join(ENGINE, "Dockerfile"), "utf8");
const dockerignore = readFileSync(
  join(ENGINE, "Dockerfile.dockerignore"),
  "utf8",
);
const compose = readFileSync(join(ENGINE, "docker-compose.yml"), "utf8");
const engineConfig = readFileSync(join(ENGINE, "src", "config.ts"), "utf8");
const engineServer = readFileSync(
  join(ENGINE, "src", "transport", "server.ts"),
  "utf8",
);
const enginePkg = JSON.parse(
  readFileSync(join(ENGINE, "package.json"), "utf8"),
) as { dependencies?: Record<string, string> };

test("uses the Node Debian base image", () => {
  expect(dockerfile).toMatch(/^FROM node:22-bookworm-slim AS deps/m);
  expect(dockerfile).toMatch(/^FROM node:22-bookworm-slim AS runtime/m);
});

test("binds 0.0.0.0 on the engine port 4317", () => {
  // The default port the engine listens on, straight from config.ts.
  const portDefault = engineConfig.match(/HOUSTON_PORT \|\| (\d+)/);
  expect(portDefault?.[1]).toBe("4317");

  expect(dockerfile).toContain("HOUSTON_HOST=0.0.0.0");
  expect(dockerfile).toContain("HOUSTON_PORT=4317");
  expect(dockerfile).toMatch(/^EXPOSE 4317/m);
});

test("sets the data + workspace mount env vars config.ts reads", () => {
  // Whatever env names config.ts consumes, the Dockerfile must set the same.
  expect(engineConfig).toContain("HOUSTON_DATA_DIR");
  expect(engineConfig).toContain("HOUSTON_WORKSPACE_DIR");

  expect(dockerfile).toContain("HOUSTON_DATA_DIR=/data");
  expect(dockerfile).toContain("HOUSTON_WORKSPACE_DIR=/data/workspace");
});

test("installs common shell tools for the agent", () => {
  expect(dockerfile).toContain("apt-get install -y --no-install-recommends");
  expect(dockerfile).toContain("git python3 ca-certificates");
});

test("installs deps from the frozen pnpm lockfile", () => {
  expect(dockerfile).toContain("pnpm install --frozen-lockfile");
  // The lockfile referenced must exist for that command to be reproducible.
  expect(() =>
    readFileSync(join(ENGINE, "..", "..", "pnpm-lock.yaml")),
  ).not.toThrow();
});

test("vendors the workspace sibling dep the engine declares", () => {
  // The engine depends on @houston/runtime-client via a workspace path; the image
  // must copy that sibling in or the frozen install can't resolve it.
  expect(enginePkg.dependencies?.["@houston/runtime-client"]).toBe(
    "workspace:*",
  );
  expect(dockerfile).toContain("COPY packages/runtime-client/");
  expect(dockerfile).toContain("COPY packages/protocol/");
});

test("runs the engine entrypoint via Node + tsx", () => {
  expect(dockerfile).toMatch(
    /CMD \["node", "--import", "tsx", "src\/main\.ts"\]/,
  );
});

test("compose builds the canonical runtime image from the repo root", () => {
  expect(compose).toContain("context: ../..");
  expect(compose).toContain("dockerfile: packages/runtime/Dockerfile");
  expect(compose).toContain("image: houston/pi-runtime:local");
  expect(compose).not.toContain("Dockerfile.standalone");
  expect(compose).not.toContain("Dockerfile.compiled");
});

test("does not keep alternate runtime Docker images", () => {
  expect(existsSync(join(ENGINE, "Dockerfile.standalone"))).toBe(false);
  expect(existsSync(join(ENGINE, "Dockerfile.compiled"))).toBe(false);
});

test("HEALTHCHECK targets the /health route the server serves", () => {
  // The server only treats /health as a public, unauthenticated liveness route.
  expect(engineServer).toContain('path === "/health"');
  expect(dockerfile).toContain("HEALTHCHECK");
  expect(dockerfile).toMatch(/\/health/);
});

test("runs as a non-root user", () => {
  // Last USER directive before CMD must not be root.
  const userDirectives = [...dockerfile.matchAll(/^USER\s+(\S+)/gm)].map(
    (m) => m[1],
  );
  expect(userDirectives.length).toBeGreaterThan(0);
  expect(userDirectives.at(-1)).not.toBe("root");
  expect(userDirectives.at(-1)).toBe("node");
});

test(".dockerignore excludes the heavy / non-shipping paths", () => {
  for (const pat of ["**/node_modules", ".git", "**/target", "*.log"]) {
    expect(dockerignore).toContain(pat);
  }
  expect(dockerignore).toContain("engine/");
  expect(dockerignore).toContain("selfhost/");
  expect(dockerignore).toContain("packages/host/");
  expect(dockerignore).toContain("packages/host-cloud/");
});
