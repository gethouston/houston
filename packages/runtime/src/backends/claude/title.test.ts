import { afterEach, beforeEach, expect, test } from "vitest";
import { runWithActingContext } from "../../session/acting-context";
import type { ClaudeToken } from "./backend";
import { claudeLoginConfigDir } from "./paths";
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

test("titleWithClaude carries the title instruction in the PROMPT itself", async () => {
  // The CLI has been observed running its claude_code preset despite a custom
  // string systemPrompt — the model then ANSWERED the excerpt and the first
  // line of the answer became the board title. The instruction must ride the
  // prompt so the reply is a title whichever system prompt the CLI honors.
  let prompt = "";
  const query: ClaudeQuery = (req) => {
    prompt = String(req.prompt);
    return (async function* () {})();
  };

  await titleWithClaude({
    excerpt: "user: do you have image capabilities?",
    titlePrompt: "You generate conversation titles.",
    workspaceDir: "/ws",
    readToken: () => undefined,
    query,
  });

  expect(prompt).toContain("You generate conversation titles.");
  expect(prompt).toContain("user: do you have image capabilities?");
  expect(prompt).toContain("Reply with ONLY the title.");
});

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

function actingToken(sub: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub, agent: "acme", exp: 9_000_000_000 }),
  ).toString("base64url");
  return `acting-v1.${payload}.sig`;
}

test("a one-shot under a personal scope with no personal token refuses", async () => {
  // The one-shot path pins the same POD-SHARED CLAUDE_CONFIG_DIR a turn does, so
  // it needs the same read-side scope guard: a member's throwaway call must never
  // authenticate as the team account and self-refresh its credential.
  const { query, env } = capturingQuery();
  await expect(
    runWithActingContext({ actingAs: actingToken("sub-alice") }, () =>
      titleWithClaude({
        excerpt: "hello",
        titlePrompt: "title it",
        workspaceDir: "/ws",
        readToken: () => undefined,
        query,
      }),
    ),
  ).rejects.toThrow(/^No provider connected\./);
  expect(env().CLAUDE_CONFIG_DIR).toBeUndefined();
});

test("a one-shot on the team scope with no token still runs (unchanged)", async () => {
  const { query, env } = capturingQuery();
  await titleWithClaude({
    excerpt: "hello",
    titlePrompt: "title it",
    workspaceDir: "/ws",
    readToken: () => undefined,
    query,
  });
  expect(env().CLAUDE_CONFIG_DIR).toBe(claudeLoginConfigDir());
});
