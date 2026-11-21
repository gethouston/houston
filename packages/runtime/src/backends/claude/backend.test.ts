import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { runWithActingContext } from "../../session/acting-context";
import type { ResolvedModel } from "../types";
import {
  buildClaudeEnv,
  type ClaudeBackendDeps,
  type ClaudeToken,
  createClaudeBackend,
} from "./backend";
import { claudeLoginConfigDir, serverClaudeLayout } from "./paths";
import type { ClaudeSessionDeps } from "./session-deps";

type CapturedDeps = Pick<
  ClaudeSessionDeps,
  "baseOptions" | "refreshAuth" | "recordedContextTokens" | "usedAccessDigest"
>;
const { built } = vi.hoisted(() => ({ built: [] as CapturedDeps[] }));
vi.mock("./session", () => ({
  ClaudeSession: class {
    constructor(deps: CapturedDeps) {
      built.push(deps);
    }
  },
}));

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
  const env = buildClaudeEnv(oauth, { configDir: "/data/cfg" });
  expect(env.CLAUDE_CONFIG_DIR).toBe("/data/cfg");
});

test("every session skips the CLI's git context and keeps its overflow recovery", () => {
  process.env.DISABLE_AUTO_COMPACT = "1";
  process.env.DISABLE_COMPACT = "1";
  try {
    const env = buildClaudeEnv(oauth, { configDir: "/cfg" });
    expect(env.CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS).toBe("1");
    expect(env.DISABLE_AUTO_COMPACT).toBeUndefined();
    expect(env.DISABLE_COMPACT).toBeUndefined();
  } finally {
    delete process.env.DISABLE_AUTO_COMPACT;
    delete process.env.DISABLE_COMPACT;
  }
});

test("an OAuth token scrubs a stale ambient ANTHROPIC_API_KEY", () => {
  process.env.ANTHROPIC_API_KEY = "stale-host-key";
  process.env.ANTHROPIC_AUTH_TOKEN = "stale-alias";
  const env = buildClaudeEnv(oauth, { configDir: "/cfg" });
  expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("sk-ant-oat01-x");
  expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
});

test("an API key scrubs a stale ambient OAuth token", () => {
  process.env.CLAUDE_CODE_OAUTH_TOKEN = "stale-oauth";
  process.env.ANTHROPIC_AUTH_TOKEN = "stale-alias";
  const env = buildClaudeEnv(apiKey, { configDir: "/cfg" });
  expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-api03-x");
  expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
});

test("no connected token clears every ambient credential var", () => {
  process.env.ANTHROPIC_API_KEY = "stale-host-key";
  process.env.CLAUDE_CODE_OAUTH_TOKEN = "stale-oauth";
  process.env.ANTHROPIC_AUTH_TOKEN = "stale-alias";
  const env = buildClaudeEnv(undefined, { configDir: "/cfg" });
  expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
});

test("operational ambient env (PATH) is preserved", () => {
  const env = buildClaudeEnv(oauth, { configDir: "/cfg" });
  expect(env.PATH).toBe(process.env.PATH);
});

test("the Windows Git Bash override reaches the subprocess", () => {
  const saved = process.env.CLAUDE_CODE_GIT_BASH_PATH;
  process.env.CLAUDE_CODE_GIT_BASH_PATH =
    "C:\\Program Files\\Git\\bin\\bash.exe";
  try {
    const env = buildClaudeEnv(oauth, { configDir: "/cfg" });
    expect(env.CLAUDE_CODE_GIT_BASH_PATH).toBe(
      "C:\\Program Files\\Git\\bin\\bash.exe",
    );
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CODE_GIT_BASH_PATH;
    else process.env.CLAUDE_CODE_GIT_BASH_PATH = saved;
  }
});

test("the username (USER/LOGNAME) reaches the subprocess", () => {
  const savedIdentity = {
    USER: process.env.USER,
    LOGNAME: process.env.LOGNAME,
  };
  process.env.USER = "jane";
  process.env.LOGNAME = "jane";
  try {
    const env = buildClaudeEnv(oauth, { configDir: "/cfg" });
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
    const env = buildClaudeEnv(oauth, { configDir: "/cfg" });
    for (const key of Object.keys(secrets)) {
      expect(env[key]).toBeUndefined();
    }
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
  const workspaceDir = mkdtempSync(join(tmpdir(), "claude-backend-scope-"));
  return {
    workspaceDir,
    layout: serverClaudeLayout(workspaceDir),
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
  const backend = createClaudeBackend(backendDeps(() => undefined));
  await backend.createSession({ conversationId: "c1", model: MODEL });
  expect(built).toHaveLength(1);
  expect(built[0]?.baseOptions.env?.CLAUDE_CONFIG_DIR).toBe(
    claudeLoginConfigDir(),
  );
  expect(built[0]?.baseOptions.env?.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
});

test("every session names itself, so the CLI never spends a request titling it", async () => {
  const backend = createClaudeBackend(backendDeps(() => oauth));
  await backend.createSession({ conversationId: "c1", model: MODEL });
  expect(built[0]?.baseOptions.title).toEqual(expect.stringMatching(/\S/));
});

test("the session's refreshAuth re-reads the CURRENT token — a rotation between turns reaches the next spawn (PRODUCT-1355)", async () => {
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

test("the session's refreshAuth sizes the CLI's first-byte deadline for the prompt it is given", async () => {
  const backend = createClaudeBackend(backendDeps(() => oauth));
  await backend.createSession({
    conversationId: "c1",
    model: MODEL,
    recordedContextTokens: () => 640_000,
  });
  expect(built[0]?.refreshAuth().env.API_TIMEOUT_MS).toBe("15000");
  expect(built[0]?.refreshAuth(800_000).env.API_TIMEOUT_MS).toBe("55000");
  expect(built[0]?.recordedContextTokens?.()).toBe(640_000);
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
  const prevHome = process.env.HOUSTON_HOME;
  process.env.HOUSTON_HOME = "/home/x/.houston";
  try {
    const env = buildClaudeEnv(undefined, {
      configDir: claudeLoginConfigDir(),
    });
    expect(env.CLAUDE_CONFIG_DIR).toBe("/home/x/.houston/claude-login");
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  } finally {
    if (prevHome === undefined) delete process.env.HOUSTON_HOME;
    else process.env.HOUSTON_HOME = prevHome;
  }
});
