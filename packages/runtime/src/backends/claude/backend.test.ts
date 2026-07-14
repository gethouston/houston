import { afterEach, beforeEach, expect, test } from "vitest";
import { buildClaudeEnv, type ClaudeToken } from "./backend";
import { claudeLoginConfigDir } from "./paths";

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
