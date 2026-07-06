import { afterEach, beforeEach, expect, test } from "vitest";
import type { ClaudeToken } from "./backend";
import type { ClaudeQuery } from "./session";
import { titleWithClaude } from "./title";

// Same credential-var hygiene as backend.test.ts: the title path must scrub
// identically, so plant/restore ambient credentials around each test.
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

/** A query stub that captures the env it was handed and yields no messages. */
function capturingQuery(): {
  query: ClaudeQuery;
  env: () => NodeJS.ProcessEnv;
} {
  let captured: NodeJS.ProcessEnv = {};
  const query: ClaudeQuery = ({ options }) => {
    captured = options.env as NodeJS.ProcessEnv;
    return (async function* () {})();
  };
  return { query, env: () => captured };
}

test("titleWithClaude scrubs a stale API key when an OAuth token is connected", async () => {
  process.env.ANTHROPIC_API_KEY = "stale-host-key";
  const oauth: ClaudeToken = { kind: "oauth-token", value: "sk-ant-oat01-x" };
  const { query, env } = capturingQuery();

  await titleWithClaude({
    excerpt: "hello",
    titlePrompt: "title it",
    workspaceDir: "/ws",
    readToken: () => oauth,
    query,
  });

  expect(env().CLAUDE_CODE_OAUTH_TOKEN).toBe("sk-ant-oat01-x");
  expect(env().ANTHROPIC_API_KEY).toBeUndefined();
  expect(env().ANTHROPIC_AUTH_TOKEN).toBeUndefined();
});
