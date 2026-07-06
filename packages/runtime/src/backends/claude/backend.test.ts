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

test("non-credential ambient env (PATH) is preserved", () => {
  const env = buildClaudeEnv("/cfg", oauth);
  expect(env.PATH).toBe(process.env.PATH);
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
