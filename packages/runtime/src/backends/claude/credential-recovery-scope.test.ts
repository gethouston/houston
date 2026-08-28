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

/**
 * MID-TURN 401 RECOVERY, per credential scope (HOU-976).
 *
 * A personal Anthropic credential is served ACCESS-ONLY per turn, so it can
 * expire while the turn is still running. The Claude CLI then runs its own 401
 * recovery, which re-reads its credential store and adopts whatever access token
 * it finds — and that store is normally the POD-SHARED claude-login dir, i.e.
 * the TEAM's credential. The member's turn would continue on the team account
 * with no message and no card.
 *
 * The recovery lives inside the CLI subprocess, so what these tests pin is the
 * one thing Houston controls and the recovery is a pure function of: WHERE that
 * subprocess is told to look. `cliCredentialStoreDir` /
 * `recoverAccessTokenAfter401` below transcribe the CLI's own rules so the
 * assertion is about the real consequence ("would this turn continue on the team
 * token?"), not merely about an env var's presence.
 */

/**
 * The CLI's credential-store resolution, transcribed from the Claude Code build
 * the pinned SDK spawns (2.1.201, bundled in `@anthropic-ai/claude-agent-sdk`
 * 0.3.201 — internally `UJ()` for the dir and `oF()` for the macOS Keychain
 * service name, which is hashed from the SAME dir):
 * `CLAUDE_SECURESTORAGE_CONFIG_DIR` wins over `CLAUDE_CONFIG_DIR`, and an EMPTY
 * value means `~/.claude` — the machine user's own credential (trap #2), which is
 * why `buildClaudeEnv` refuses a non-absolute value outright.
 */
function cliCredentialStoreDir(env: Record<string, string>): string {
  const override = env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
  if (override !== undefined) return override || join(homedir(), ".claude");
  return env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
}

/**
 * The CLI's mid-turn 401 recovery, transcribed from the same build (`M5d`): an
 * env-supplied access token carries no refresh token, so the recovery re-reads
 * `.credentials.json` from its credential store and ADOPTS
 * `claudeAiOauth.accessToken` whenever that differs from the token that just
 * 401'd (`tengu_oauth_401_recovered_from_disk`). Returns the token the turn would
 * silently continue on, or undefined when the recovery finds nothing — in which
 * case the 401 stands and the turn surfaces the honest typed auth error.
 */
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
    return undefined; // no credential store to recover from
  }
  const found = (
    JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string } }
  ).claudeAiOauth?.accessToken;
  return found && found !== failedAccessToken ? found : undefined;
}

// Capture the `baseOptions` the backend hands a session WITHOUT running the SDK
// (same seam as backend.test.ts): the env IS the contract under test.
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

/** The TEAM credential materialized on the pod-shared login dir. */
const TEAM_ACCESS_TOKEN = "sk-ant-oat01-TEAM-account";
/** The member's OWN served access token — the one that expires mid-turn. */
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
  // The pod's shared login dir, holding the TEAM's credential exactly as
  // `credentials-file.ts` materializes it for a team-scope connect.
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
  // A real directory: the tool policy's workspace clamp realpath()s the cwd.
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
  // THE BUG: the member's served access token expires mid-turn. With the CLI
  // pointed at the pod-shared login dir it re-reads the TEAM's credential from
  // disk and finishes the turn on it — no error, no card, one member's prompt
  // billed to (and reading as) another account.
  const env = await turnEnv(alice);

  const recovered = recoverAccessTokenAfter401(env, MEMBER_ACCESS_TOKEN);
  expect(recovered).not.toBe(TEAM_ACCESS_TOKEN);
  // Nothing at all to recover onto: the 401 stands and the turn surfaces the
  // honest typed auth error instead of silently continuing.
  expect(recovered).toBeUndefined();
});

test("a team-scope turn's 401 recovery still reads the shared login dir (unchanged)", async () => {
  // Desktop, self-host, and every pre-HOU-976 request: that dir holds this
  // identity's OWN credential, and recovering from it is correct. Byte-identical
  // to before the guard existed.
  const env = await turnEnv(undefined);

  expect(env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBeUndefined();
  expect(recoverAccessTokenAfter401(env, "sk-ant-oat01-expired")).toBe(
    TEAM_ACCESS_TOKEN,
  );
});

test("a routine's bare acting-user turn keeps the team store (no signed identity)", async () => {
  // `actingUser` alone cannot select a member's credentials (acting-context.ts),
  // so an in-pod routine runs on the team account — including its recovery.
  const env = await turnEnv({ actingUser: "sub-alice" });

  expect(env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBeUndefined();
  expect(recoverAccessTokenAfter401(env, "sk-ant-oat01-expired")).toBe(
    TEAM_ACCESS_TOKEN,
  );
});

test("a personal scope keeps the SHARED config dir, so transcripts and resume are untouched", async () => {
  // The whole reason the credential store is relocated on its own: the
  // `projects/` transcript tree, resume ids and the sessions store all hang off
  // CLAUDE_CONFIG_DIR, and two members continuing one conversation must keep
  // seeing the same transcript.
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
  // Under `auth-users/`, whose whole subtree is excluded from store-sync and
  // denied to the agent's own file tools — so a credential the CLI ever wrote
  // there can neither sync out nor be read by the model.
  for (const dir of [
    aliceEnv.CLAUDE_SECURESTORAGE_CONFIG_DIR,
    bobEnv.CLAUDE_SECURESTORAGE_CONFIG_DIR,
  ]) {
    expect(dir).toContain(join(dataDir, "auth-users"));
    // The acting identity itself is never spelled out on a shared pod's
    // filesystem — the scope key is hashed (auth/auth-file.ts).
    expect(dir).not.toContain("sub-alice");
    expect(dir).not.toContain("sub-bob");
  }
});

test("the one-shot path (titles, anonymize) isolates identically", async () => {
  // Same pod-shared config dir, same 401, same leak — so the same guard. A title
  // that quietly ran on the team account would be invisible in the UI.
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
  // The one way a future SDK call site could regress this is by forgetting to
  // thread its data dir through. That must be an error, not a silent fallback.
  expect(() =>
    runWithActingContext(alice, () => anthropicCredentialStorageDir(undefined)),
  ).toThrow(/cannot isolate the Claude credential store/);
  // The team scope needs no data dir at all — it legitimately reads its own dir.
  expect(anthropicCredentialStorageDir(undefined)).toBeUndefined();
});

test("a non-absolute credential store is refused (it would resolve inside the workspace, or at ~/.claude)", () => {
  // The CLI resolves a relative value against the subprocess cwd — the agent's
  // workspace — and an EMPTY one against `~/.claude`, the machine user's PERSONAL
  // credential (trap #2). Both are worse than the leak this closes.
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
  // It is not in the passthrough allowlist, so a stray host value can neither
  // hijack a personal turn's store nor strand a team turn on an empty one.
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
