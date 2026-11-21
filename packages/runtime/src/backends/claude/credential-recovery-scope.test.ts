import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
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
import {
  claudeCredentialsFile,
  claudeLoginConfigDir,
  serverClaudeLayout,
} from "./paths";
import { anthropicCredentialStorageDir } from "./scope-guard";
import type { ClaudeQuery } from "./session";
import { titleWithClaude } from "./title";

function cliCredentialStoreDir(env: Record<string, string>): string {
  const override = env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
  if (override !== undefined) return override || join(homedir(), ".claude");
  return env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
}

function recoverAccessTokenAfter401(
  env: Record<string, string>,
  failedAccessToken: string,
): string | undefined {
  let raw: string;
  try {
    raw = readFileSync(
      join(cliCredentialStoreDir(env), ".credentials.json"),
      "utf8",
    );
  } catch {
    return undefined;
  }
  const found = (
    JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string } }
  ).claudeAiOauth?.accessToken;
  return found && found !== failedAccessToken ? found : undefined;
}

const { built } = vi.hoisted(() => ({ built: [] as Options[] }));
vi.mock("./session", () => ({
  ClaudeSession: class {
    constructor(deps: { baseOptions: Options }) {
      built.push(deps.baseOptions);
    }
  },
}));

const MODEL: ResolvedModel = {
  id: "claude-sonnet-5",
  provider: "anthropic",
} as ResolvedModel;

const TEAM_ACCESS_TOKEN = "sk-ant-oat01-TEAM-account";
const MEMBER_ACCESS_TOKEN = "sk-ant-oat01-alice-served";
const memberToken: ClaudeToken = {
  kind: "oauth-token",
  value: MEMBER_ACCESS_TOKEN,
};

function actingToken(sub: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub, agent: "acme", exp: 9_000_000_000 }),
  ).toString("base64url");
  return `acting-v1.${payload}.sig`;
}
const alice = { actingAs: actingToken("sub-alice") };
const bob = { actingAs: actingToken("sub-bob") };

let home: string;
let dataDir: string;
let savedHome: string | undefined;

beforeEach(() => {
  built.length = 0;
  savedHome = process.env.HOUSTON_HOME;
  home = mkdtempSync(join(tmpdir(), "claude-401-home-"));
  process.env.HOUSTON_HOME = home;
  dataDir = mkdtempSync(join(tmpdir(), "claude-401-data-"));
  mkdirSync(claudeLoginConfigDir(), { recursive: true });
  writeFileSync(
    claudeCredentialsFile(),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: TEAM_ACCESS_TOKEN,
        refreshToken: "team-refresh",
        expiresAt: Date.now() + 3_600_000,
      },
    }),
  );
});
afterEach(() => {
  if (savedHome === undefined) delete process.env.HOUSTON_HOME;
  else process.env.HOUSTON_HOME = savedHome;
});

function backendDeps(): ClaudeBackendDeps {
  const workspaceDir = mkdtempSync(join(tmpdir(), "claude-401-ws-"));
  return {
    workspaceDir,
    layout: serverClaudeLayout(dataDir),
    readToken: () => memberToken,
    toolSelection: { toolNames: [], includeRunCode: false },
    systemPrompt: "houston",
  } satisfies ClaudeBackendDeps;
}

async function turnEnv(
  ctx?: Parameters<typeof runWithActingContext>[0],
): Promise<Record<string, string>> {
  const backend = createClaudeBackend(backendDeps());
  await runWithActingContext(ctx, () =>
    backend.createSession({ conversationId: "c1", model: MODEL }),
  );
  const env = built.at(-1)?.env;
  if (!env) throw new Error("no session was built");
  return env as Record<string, string>;
}

test("a personal-scope turn's 401 recovery cannot adopt the pod-shared team token", async () => {
  const env = await turnEnv(alice);

  const recovered = recoverAccessTokenAfter401(env, MEMBER_ACCESS_TOKEN);
  expect(recovered).not.toBe(TEAM_ACCESS_TOKEN);
  expect(recovered).toBeUndefined();
});

test("a team-scope turn's 401 recovery still reads the shared login dir (unchanged)", async () => {
  const env = await turnEnv(undefined);

  expect(env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBeUndefined();
  expect(recoverAccessTokenAfter401(env, "sk-ant-oat01-expired")).toBe(
    TEAM_ACCESS_TOKEN,
  );
});

test("a routine's bare acting-user turn keeps the team store (no signed identity)", async () => {
  const env = await turnEnv({ actingUser: "sub-alice" });

  expect(env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBeUndefined();
  expect(recoverAccessTokenAfter401(env, "sk-ant-oat01-expired")).toBe(
    TEAM_ACCESS_TOKEN,
  );
});

test("a personal scope keeps the SHARED config dir, so transcripts and resume are untouched", async () => {
  const env = await turnEnv(alice);

  expect(env.CLAUDE_CONFIG_DIR).toBe(claudeLoginConfigDir());
  expect(typeof env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe("string");
  expect(env.CLAUDE_SECURESTORAGE_CONFIG_DIR).not.toBe(claudeLoginConfigDir());
  expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe(MEMBER_ACCESS_TOKEN);
});

test("each member gets their OWN credential store, never a shared one", async () => {
  const aliceEnv = await turnEnv(alice);
  const bobEnv = await turnEnv(bob);

  expect(aliceEnv.CLAUDE_SECURESTORAGE_CONFIG_DIR).not.toBe(
    bobEnv.CLAUDE_SECURESTORAGE_CONFIG_DIR,
  );
  for (const dir of [
    aliceEnv.CLAUDE_SECURESTORAGE_CONFIG_DIR,
    bobEnv.CLAUDE_SECURESTORAGE_CONFIG_DIR,
  ]) {
    expect(dir).toContain(join(dataDir, "auth-users"));
    expect(dir).not.toContain("sub-alice");
    expect(dir).not.toContain("sub-bob");
  }
});

test("the one-shot path (titles) isolates identically", async () => {
  let env: Record<string, string> = {};
  const query: ClaudeQuery = ({ options }) => {
    env = options.env as Record<string, string>;
    return (async function* () {})();
  };
  await runWithActingContext(alice, () =>
    titleWithClaude({
      excerpt: "hello",
      titlePrompt: "title it",
      workspaceDir: "/ws",
      readToken: () => memberToken,
      dataDir,
      query,
    }),
  );

  expect(env.CLAUDE_CONFIG_DIR).toBe(claudeLoginConfigDir());
  expect(recoverAccessTokenAfter401(env, MEMBER_ACCESS_TOKEN)).toBeUndefined();
});

test("a personal scope with no data dir fails loud instead of inheriting the team store", () => {
  expect(() =>
    runWithActingContext(alice, () => anthropicCredentialStorageDir(undefined)),
  ).toThrow(/cannot isolate the Claude credential store/);
  expect(anthropicCredentialStorageDir(undefined)).toBeUndefined();
});

test("a non-absolute credential store is refused (it would resolve inside the workspace, or at ~/.claude)", () => {
  expect(() =>
    buildClaudeEnv(memberToken, {
      configDir: "/cfg",
      credentialStorageDir: "auth-users/x",
    }),
  ).toThrow(/must be an absolute path/);
  expect(() =>
    buildClaudeEnv(memberToken, {
      configDir: "/cfg",
      credentialStorageDir: "",
    }),
  ).toThrow(/must be an absolute path/);
});

test("an ambient CLAUDE_SECURESTORAGE_CONFIG_DIR never reaches the subprocess", async () => {
  const prev = process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
  process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = "/tmp/ambient-store";
  try {
    expect(
      (await turnEnv(undefined)).CLAUDE_SECURESTORAGE_CONFIG_DIR,
    ).toBeUndefined();
    expect((await turnEnv(alice)).CLAUDE_SECURESTORAGE_CONFIG_DIR).not.toBe(
      "/tmp/ambient-store",
    );
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
    else process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = prev;
  }
});
