import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { runWithActingContext } from "../../session/acting-context";
import type { ResolvedModel } from "../types";
import {
  buildClaudeEnv,
  type ClaudeBackendDeps,
  type ClaudeToken,
  createClaudeBackend,
} from "./backend";
import { claudeLoginConfigDir } from "./paths";

// Capture the deps the backend hands a session WITHOUT running the SDK: the
// whole point of the scope guard is that a refused turn never builds an env at
// all, so "was a session constructed, and with which env" is the assertion —
// plus, since PRODUCT-1355, "does its refreshAuth re-read the CURRENT token".
type CapturedDeps = {
  baseOptions: Options;
  refreshAuth: () => { env: Record<string, string>; accessDigest?: string };
  usedAccessDigest?: string;
};
const { built } = vi.hoisted(() => ({ built: [] as CapturedDeps[] }));
vi.mock("./session", () => ({
  ClaudeSession: class {
    constructor(deps: CapturedDeps) {
      built.push(deps);
    }
  },
}));

// buildClaudeEnv reads process.env; snapshot the three credential vars so a test
// that plants a stale one can't leak into another.
const CREDS = [
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(CREDS.map((k) => [k, process.env[k]]));
  for (const k of CREDS) delete process.env[k];
  built.length = 0;
});
afterEach(() => {
  for (const k of CREDS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const oauth: ClaudeToken = { kind: "oauth-token", value: "sk-ant-oat01-x" };
const apiKey: ClaudeToken = { kind: "api-key", value: "sk-ant-api03-x" };

test("buildClaudeEnv pins the isolated config dir", () => {
  const env = buildClaudeEnv("/data/cfg", oauth);
  expect(env.CLAUDE_CONFIG_DIR).toBe("/data/cfg");
});

test("an OAuth token scrubs a stale ambient ANTHROPIC_API_KEY", () => {
  // The exact fail-open: the host process has an API key, the user connects an
  // OAuth subscription token. The subprocess must carry ONLY the OAuth token.
  process.env.ANTHROPIC_API_KEY = "stale-host-key";
  process.env.ANTHROPIC_AUTH_TOKEN = "stale-alias";
  const env = buildClaudeEnv("/cfg", oauth);
  expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("sk-ant-oat01-x");
  expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
});

test("an API key scrubs a stale ambient OAuth token", () => {
  process.env.CLAUDE_CODE_OAUTH_TOKEN = "stale-oauth";
  process.env.ANTHROPIC_AUTH_TOKEN = "stale-alias";
  const env = buildClaudeEnv("/cfg", apiKey);
  expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-api03-x");
  expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
});

test("no connected token clears every ambient credential var", () => {
  process.env.ANTHROPIC_API_KEY = "stale-host-key";
  process.env.CLAUDE_CODE_OAUTH_TOKEN = "stale-oauth";
  process.env.ANTHROPIC_AUTH_TOKEN = "stale-alias";
  const env = buildClaudeEnv("/cfg", undefined);
  expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
});

test("operational ambient env (PATH) is preserved", () => {
  const env = buildClaudeEnv("/cfg", oauth);
  expect(env.PATH).toBe(process.env.PATH);
});

test("the Windows Git Bash override reaches the subprocess", () => {
  // The desktop shell repairs CLAUDE_CODE_GIT_BASH_PATH into the engine's env
  // on Windows (app/src-tauri shell_env.rs) so the CLI's shell gate passes.
  // If the allowlist drops it, sign-in works but every turn exits at startup
  // on machines that need the override.
  const saved = process.env.CLAUDE_CODE_GIT_BASH_PATH;
  process.env.CLAUDE_CODE_GIT_BASH_PATH =
    "C:\\Program Files\\Git\\bin\\bash.exe";
  try {
    const env = buildClaudeEnv("/cfg", oauth);
    expect(env.CLAUDE_CODE_GIT_BASH_PATH).toBe(
      "C:\\Program Files\\Git\\bin\\bash.exe",
    );
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CODE_GIT_BASH_PATH;
    else process.env.CLAUDE_CODE_GIT_BASH_PATH = saved;
  }
});

test("the username (USER/LOGNAME) reaches the subprocess", () => {
  // The Claude CLI derives its macOS Keychain item's ACCOUNT from the
  // username. Scrubbing USER made the SDK resolve "unknown" and read a
  // DIFFERENT (empty) Keychain item than the one `claude auth login` wrote —
  // connected in the UI, unauthenticated at every turn, unfixable by
  // reconnecting.
  const savedIdentity = {
    USER: process.env.USER,
    LOGNAME: process.env.LOGNAME,
  };
  process.env.USER = "jane";
  process.env.LOGNAME = "jane";
  try {
    const env = buildClaudeEnv("/cfg", oauth);
    expect(env.USER).toBe("jane");
    expect(env.LOGNAME).toBe("jane");
  } finally {
    for (const [k, v] of Object.entries(savedIdentity)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("Houston host secrets never reach the subprocess env", () => {
  // The core of the finding: the SDK subprocess runs model-directed Bash, so any
  // host secret in its env is one `printenv` away from exfiltration. These are the
  // control-plane credentials config.ts reads from process.env — none may survive.
  const secrets = {
    HOUSTON_SANDBOX_TOKEN: "sbx-tok",
    HOUSTON_CODE_SANDBOX_TOKEN: "code-sbx-tok",
    HOUSTON_TURN_TOKEN: "turn-tok",
    HOUSTON_RUNTIME_TOKEN: "runtime-tok",
    COMPOSIO_API_KEY: "composio-key",
    GOOGLE_APPLICATION_CREDENTIALS: "/var/gcp/key.json",
    SOME_ARBITRARY_HOST_SECRET: "leak-me",
  } as const;
  const prev = Object.fromEntries(
    Object.keys(secrets).map((k) => [k, process.env[k]]),
  );
  Object.assign(process.env, secrets);
  try {
    const env = buildClaudeEnv("/cfg", oauth);
    for (const key of Object.keys(secrets)) {
      expect(env[key]).toBeUndefined();
    }
    // The allowlisted essentials still survive so the SDK works.
    expect(env.PATH).toBe(process.env.PATH);
    expect(env.CLAUDE_CONFIG_DIR).toBe("/cfg");
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("sk-ant-oat01-x");
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

/**
 * The READ-side mirror of the credentials-file scope guard (HOU-976):
 * `CLAUDE_CONFIG_DIR` is
 * the POD-SHARED login dir holding the TEAM's `.credentials.json`. Handing it to
 * the SDK with no personal token in the env makes a member's turn authenticate as
 * the team AND lets the SDK self-refresh the team's refresh-token family — a
 * second rotator beside the gateway, plus a cross-member credential leak.
 */
function actingToken(sub: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub, agent: "acme", exp: 9_000_000_000 }),
  ).toString("base64url");
  return `acting-v1.${payload}.sig`;
}

const alice = { actingAs: actingToken("sub-alice") };

const MODEL: ResolvedModel = {
  provider: "anthropic",
  id: "claude-sonnet-4-6",
  contextWindow: 200_000,
};

function backendDeps(readToken: ClaudeBackendDeps["readToken"]) {
  // A real directory: the tool policy's workspace clamp realpath()s the cwd.
  const workspaceDir = mkdtempSync(join(tmpdir(), "claude-backend-scope-"));
  return {
    workspaceDir,
    dataDir: workspaceDir,
    readToken,
    toolSelection: { toolNames: [], includeRunCode: false },
    systemPrompt: "houston",
  } satisfies ClaudeBackendDeps;
}

test("a personal scope with NO personal token refuses the session", async () => {
  const backend = createClaudeBackend(backendDeps(() => undefined));
  await expect(
    runWithActingContext(alice, () =>
      backend.createSession({ conversationId: "c1", model: MODEL }),
    ),
  ).rejects.toThrow(/^No provider connected\./);
  // No session, and therefore no env pinned at the pod-shared login dir.
  expect(built).toEqual([]);
});

test("a personal scope with its OWN token proceeds (env token outranks the dir)", async () => {
  const backend = createClaudeBackend(backendDeps(() => oauth));
  await runWithActingContext(alice, () =>
    backend.createSession({ conversationId: "c1", model: MODEL }),
  );
  expect(built).toHaveLength(1);
  expect(built[0]?.baseOptions.env?.CLAUDE_CODE_OAUTH_TOKEN).toBe(
    "sk-ant-oat01-x",
  );
});

test("the team scope still pins the shared login dir with no token (unchanged)", async () => {
  // Desktop / self-host / every pre-HOU-976 request: the SDK legitimately reads
  // the credential cached in its own login dir. Byte-identical to before.
  const backend = createClaudeBackend(backendDeps(() => undefined));
  await backend.createSession({ conversationId: "c1", model: MODEL });
  expect(built).toHaveLength(1);
  expect(built[0]?.baseOptions.env?.CLAUDE_CONFIG_DIR).toBe(
    claudeLoginConfigDir(),
  );
  expect(built[0]?.baseOptions.env?.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
});

test("the session's refreshAuth re-reads the CURRENT token — a rotation between turns reaches the next spawn (PRODUCT-1355)", async () => {
  // The live incident: the serve path updates auth.json every turn, but the
  // session's env was baked at build. refreshAuth must read THROUGH to the
  // store on every call, digest included.
  let current: ClaudeToken = {
    kind: "oauth-token",
    value: "sk-ant-oat01-old",
    accessDigest: "digest-old",
  };
  const backend = createClaudeBackend(backendDeps(() => current));
  await backend.createSession({ conversationId: "c1", model: MODEL });
  expect(built[0]?.usedAccessDigest).toBe("digest-old");

  current = {
    kind: "oauth-token",
    value: "sk-ant-oat01-new",
    accessDigest: "digest-new",
  };
  const fresh = built[0]?.refreshAuth();
  expect(fresh?.env.CLAUDE_CODE_OAUTH_TOKEN).toBe("sk-ant-oat01-new");
  expect(fresh?.accessDigest).toBe("digest-new");
});

test("refreshAuth re-asserts the personal-scope guard: a token that vanished mid-conversation refuses the turn, never falls through to the team dir", async () => {
  let current: ClaudeToken | undefined = oauth;
  const backend = createClaudeBackend(backendDeps(() => current));
  await runWithActingContext(alice, () =>
    backend.createSession({ conversationId: "c1", model: MODEL }),
  );
  current = undefined;
  expect(() =>
    runWithActingContext(alice, () => built[0]?.refreshAuth()),
  ).toThrow(/^No provider connected\./);
});

test("browser-login path: shared config dir, NO token env (SDK reads the cached cred)", () => {
  // The desktop primary path passes claudeLoginConfigDir() + no token: the SDK
  // reads the credential cached in the shared dir and self-refreshes, so we must
  // pin CLAUDE_CONFIG_DIR to that dir and set none of the credential vars.
  const prevHome = process.env.HOUSTON_HOME;
  process.env.HOUSTON_HOME = "/home/x/.houston";
  try {
    const env = buildClaudeEnv(claudeLoginConfigDir(), undefined);
    expect(env.CLAUDE_CONFIG_DIR).toBe("/home/x/.houston/claude-login");
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  } finally {
    if (prevHome === undefined) delete process.env.HOUSTON_HOME;
    else process.env.HOUSTON_HOME = prevHome;
  }
});
