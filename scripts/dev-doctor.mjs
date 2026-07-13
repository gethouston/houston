#!/usr/bin/env node
// The `pnpm dev` preflight doctor. Validates tools, env, and ports for the
// full dev stack (see mprocs.yaml), collects EVERY failure with a precise
// remedy, and prints the feature matrix — what this run enables — so nobody
// discovers a silently-missing feature an hour in. Exit 1 on any failure.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  compareVersions,
  goModVersion,
  paint,
  parseEnvFile,
  portFree,
  portOwner,
  tryRun,
} from "./dev/doctor-lib.mjs";

const root = process.cwd();
const cloudDir = process.env.CLOUD_DIR || path.resolve(root, "..", "cloud");
const fails = [];
const warns = [];

// ── tools ────────────────────────────────────────────────────────────────────
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 22)
  fails.push(
    `node ${process.versions.node} is too old — packages/host needs >=22.19. Install via https://nodejs.org or \`mise use node@22\`.`,
  );
if (!tryRun("pnpm --version"))
  fails.push("pnpm not found. corepack enable  (or: npm i -g pnpm)");
if (!existsSync(path.join(root, "node_modules")))
  fails.push("node_modules missing (fresh worktree?). Run: pnpm install");
if (
  !existsSync(path.join(root, "node_modules", ".bin", "mprocs")) &&
  existsSync(path.join(root, "node_modules"))
)
  fails.push("mprocs not installed. Run: pnpm install");
if (!existsSync(path.join(cloudDir, "go.mod"))) {
  fails.push(
    `cloud repo not found at ${paint.bold(cloudDir)}. Clone gethouston/cloud beside this checkout, or set CLOUD_DIR=/path/to/cloud.`,
  );
} else {
  for (const cmd of ["cmd/gateway", "cmd/control-plane"]) {
    if (!existsSync(path.join(cloudDir, cmd)))
      fails.push(
        `cloud checkout has no ${cmd} — pull latest main (the dev loop runs the Go gateway).`,
      );
  }
}
const goVersion = tryRun("go version")?.match(/go(\d+(?:\.\d+)*)/)?.[1];
if (!goVersion) {
  fails.push(
    "Go toolchain not found (runs the gateway + control-plane). brew install go",
  );
} else {
  const want = goModVersion(path.join(cloudDir, "go.mod"));
  if (want && compareVersions(goVersion, want) < 0)
    warns.push(
      `go ${goVersion} < cloud/go.mod's ${want} — Go will auto-fetch the toolchain (GOTOOLCHAIN=auto); update with \`brew upgrade go\` to skip that.`,
    );
}
if (!tryRun("docker info"))
  fails.push(
    "Docker daemon not reachable (needed ONLY for the dev Postgres container). Start Docker Desktop, then re-run.",
  );

// ── env: the two-file contract ───────────────────────────────────────────────
const committed = parseEnvFile(path.join(root, ".env.development"));
const local = parseEnvFile(path.join(root, ".env.local"));
if (Object.keys(committed).length === 0)
  fails.push(
    ".env.development missing or empty — it is committed; restore it (git checkout .env.development).",
  );

const overlap = Object.keys(local).filter((k) => k in committed);
for (const key of overlap)
  fails.push(
    `.env.local re-defines ${paint.bold(key)}, which is owned by .env.development — remove it from .env.local (team-wide values change via PR).`,
  );

const LEGACY = {
  VITE_CP_DEV_TOKEN: "the web pane uses real Google sign-in now",
  VITE_HOSTED_ENGINE_URL:
    "the desktop pane runs the LOCAL profile; the web pane covers the cloud profile",
  VITE_HOSTED_ENGINE_AUTH: "superseded by the unified dev loop",
  VITE_HOSTED_ENGINE_TOKEN: "superseded by the unified dev loop",
  SUPABASE_URL: "auth moved to Firebase (GCIP); Supabase is gone",
  SUPABASE_ANON_KEY: "auth moved to Firebase (GCIP); Supabase is gone",
};
for (const [key, why] of Object.entries(LEGACY)) {
  if (key in local)
    fails.push(
      `.env.local sets legacy ${paint.bold(key)} — delete it (${why}).`,
    );
}

const env = { ...committed, ...local, ...process.env };
if (!env.FIREBASE_API_KEY)
  fails.push(
    `FIREBASE_API_KEY is required (Google sign-in for the web app's cloud profile). cp .env.example .env.local, then set it — get the key from a teammate or the GCIP console (project ${paint.bold(env.FIREBASE_PROJECT_ID || "gethouston")}).`,
  );

// ── ports ────────────────────────────────────────────────────────────────────
const PORTS = [
  [5433, "postgres"],
  [9080, "gateway"],
  [8081, "control-plane"],
  [4318, "local host"],
  [1430, "web app"],
  [1420, "desktop app dev server"],
];
// Busy ports HARD-FAIL: booting anyway guarantees a mid-stack bind error a
// few seconds later, in whichever pane loses the race (learned the hard way —
// an orphaned gateway held :9080/:8082 and the next boot died confusingly).
for (const [port, who] of PORTS) {
  if (!(await portFree(port)))
    fails.push(
      `port ${port} (${who}) is in use by ${portOwner(port)} — a previous \`pnpm dev\` still running? Stop it or: kill $(lsof -ti tcp:${port})`,
    );
}

// ── report ───────────────────────────────────────────────────────────────────
for (const w of warns) console.log(`  ${paint.warn("!")} ${w}`);
if (fails.length > 0) {
  console.error(`\n${paint.fail(`Doctor found ${fails.length} issue(s):`)}`);
  for (const f of fails) console.error(`\n  ${paint.fail("✗")} ${f}`);
  console.error(`\nFix the above and re-run ${paint.bold("pnpm dev")}.`);
  process.exit(1);
}

const on = paint.ok("ON ");
const off = paint.warn("OFF");
const integrations = env.COMPOSIO_API_KEY || env.HOUSTON_INTEGRATIONS_URL;
const emailOtp = env.RESEND_API_KEY && env.GW_OTP_SIGNER_SA;
const bugReports = env.LINEAR_API_KEY && env.LINEAR_TEAM_ID;
const desktopLogin =
  env.GOOGLE_DESKTOP_CLIENT_ID && env.GOOGLE_DESKTOP_CLIENT_SECRET;
console.log(`
${paint.bold("── pnpm dev · feature matrix ──────────────────────────────────")}
  Desktop app   local profile   terminal · files · local models (login: see below)
  Web app       cloud profile   http://localhost:1430 · Google sign-in ·
                                multiplayer Teams/Spaces · agent moves
  Engines       local processes spawned per agent (data: ${(process.env.CP_DEV_DATA_DIR || path.join(homedir(), ".dev-houston-cloud")).replace(homedir(), "~")})
  ${desktopLogin ? on : off} desktop login  ${desktopLogin ? "Google loopback sign-in + sign-out (Settings → Account) on the desktop" : "desktop runs ACCOUNT-LESS — set GOOGLE_DESKTOP_CLIENT_ID + GOOGLE_DESKTOP_CLIENT_SECRET in .env.local to test login/logout there (web pane always has accounts)"}
  ${emailOtp ? on : off} email sign-in  ${emailOtp ? "Resend key + OTP signer present" : "the code field ERRORS in dev (gateway 503s without RESEND_API_KEY + GW_OTP_SIGNER_SA) — sign in with Google/Microsoft/Apple"}
  ${on} agent store    catalog/publish/install stay on the LOCAL gateway (never prod)
  ${bugReports ? on : off} bug reports    ${bugReports ? "desktop Report-bug files to Linear" : "desktop Report-bug ERRORS — set LINEAR_API_KEY + LINEAR_TEAM_ID in .env.local"}
  ${off} shared tunnel   local-model tunnel share needs desktop+team+hosted session (relay is prod-only); share endpoints via the web pane's team space instead
  ${integrations ? on : off} integrations   ${integrations ? "Composio configured" : "set COMPOSIO_API_KEY in .env.local to enable connected apps"}
  ${env.ANTHROPIC_API_KEY ? on : off} agent turns    ${env.ANTHROPIC_API_KEY ? "engines seeded with ANTHROPIC_API_KEY" : "no ANTHROPIC_API_KEY — connect a provider in-app per agent"}
  ${env.COMPOSIO_API_KEY && env.COMPOSIO_WEBHOOK_SECRET ? on : off} triggers       ${env.COMPOSIO_API_KEY && env.COMPOSIO_WEBHOOK_SECRET ? "Composio key + webhook secret present" : "need COMPOSIO_API_KEY + COMPOSIO_WEBHOOK_SECRET"}
  ${off} billing        dev runs without Stripe — teams are free
  ${off} analytics      PostHog/Sentry are no-ops in dev (by design)
${paint.bold("───────────────────────────────────────────────────────────────")}
`);
