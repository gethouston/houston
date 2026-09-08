import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Credential } from "@earendil-works/pi-ai";
import { accessDigest } from "@houston/protocol/access-digest";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

// The shared login file is re-parsed only when it CHANGED, and "how many times
// did we open it" is the whole claim — so the real `readFileSync` is wrapped
// (never replaced) to make the count observable. Everything else in node:fs is
// the genuine article, this suite's own setup included.
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return { ...real, default: real, readFileSync: vi.fn(real.readFileSync) };
});

import {
  servedProvidersPathIn,
  writeServedProvidersAt,
} from "../../auth/auth-file";
import type { HoustonAuthStore } from "../../auth/credential-store";
import { config } from "../../config";
import {
  runWithActingContext,
  TEAM_CREDENTIAL_SCOPE,
} from "../../session/acting-context";
import { claudeCredentialsFile, claudeLoginConfigDir } from "./paths";
import { readAnthropicToken } from "./read-token";
import { forgetSharedLoginCacheForTest } from "./shared-login-file";

/**
 * A minimal credential-store stub over ONE entry, honouring both halves of the
 * contract: `get` reads it, `remove` drops it (so a test can assert the stored
 * entry is gone, not merely skipped). `removed` records the ids removed.
 */
function store(
  cred: Credential | undefined,
): Pick<HoustonAuthStore, "get" | "remove"> & { removed: string[] } {
  let held = cred;
  const removed: string[] = [];
  return {
    removed,
    get: (id: string) => (id === "anthropic" ? held : undefined),
    remove: (id: string) => {
      removed.push(id);
      if (id === "anthropic") held = undefined;
    },
  };
}

// The shared-login fallback reads `<HOUSTON_HOME>/claude-login/.credentials.json`,
// so the suite pins HOUSTON_HOME to an EMPTY temp dir: without it the developer's
// real login dir would leak into these assertions. A plain env pin is enough —
// `houstonHome()` resolves `process.env` on every call, so no dynamic import of
// the modules under test is needed here.
let prevHome: string | undefined;
let prevDataDir: string;
let home: string;

beforeAll(() => {
  prevHome = process.env.HOUSTON_HOME;
  home = mkdtempSync(join(tmpdir(), "read-token-home-"));
  process.env.HOUSTON_HOME = home;
  // The serve-mode cases below read the served-providers manifest out of the
  // data dir; pinned into the same temp home so no test ever touches (or
  // reads) the developer's real one.
  prevDataDir = config.dataDir;
  config.dataDir = join(home, "data");
});

afterAll(() => {
  if (prevHome === undefined) delete process.env.HOUSTON_HOME;
  else process.env.HOUSTON_HOME = prevHome;
  config.dataDir = prevDataDir;
  rmSync(home, { recursive: true, force: true });
});

/** Materialize the shared login dir's `.credentials.json` for one test. */
function writeSharedLoginFile(body: unknown): void {
  const dir = claudeLoginConfigDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(claudeCredentialsFile(dir), JSON.stringify(body));
}

/** An envelope in the Claude CLI's own on-disk shape. */
function envelope(access: string, expiresAt: number): unknown {
  return {
    claudeAiOauth: { accessToken: access, refreshToken: "r", expiresAt },
  };
}

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  rmSync(claudeLoginConfigDir(), { recursive: true, force: true });
  // The parsed file is cached by (inode, size, mtime); a suite that rewrites it
  // several times inside one millisecond must not read a previous test's copy.
  forgetSharedLoginCacheForTest();
  rmSync(servedProvidersPathIn(config.dataDir, TEAM_CREDENTIAL_SCOPE), {
    force: true,
  });
  config.controlPlaneUrl = "";
  config.sandboxToken = "";
});

/** Put this runtime on a managed pod whose gateway serves `providers`. */
function serveModeServing(providers: string[]): void {
  config.controlPlaneUrl = "http://control-plane.test";
  config.sandboxToken = "sbx-token";
  writeServedProvidersAt(
    servedProvidersPathIn(config.dataDir, TEAM_CREDENTIAL_SCOPE),
    providers,
  );
}

test("a setup token (sk-ant-oat01…) maps to an oauth-token", () => {
  const token = readAnthropicToken(
    store({ type: "api_key", key: "sk-ant-oat01-abc" }),
  );
  expect(token).toEqual({ kind: "oauth-token", value: "sk-ant-oat01-abc" });
});

test("a console API key (sk-ant-api03…) maps to an api-key", () => {
  const token = readAnthropicToken(
    store({ type: "api_key", key: "sk-ant-api03-xyz" }),
  );
  expect(token).toEqual({ kind: "api-key", value: "sk-ant-api03-xyz" });
});

test("surrounding whitespace is trimmed before mapping", () => {
  const token = readAnthropicToken(
    store({ type: "api_key", key: "  sk-ant-oat01-abc\n" }),
  );
  expect(token).toEqual({ kind: "oauth-token", value: "sk-ant-oat01-abc" });
});

test("no stored credential returns undefined without warning (not connected)", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(readAnthropicToken(store(undefined))).toBeUndefined();
  expect(warn).not.toHaveBeenCalled();
});

test("an unrecognized token prefix returns undefined AND logs the reason", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(
    readAnthropicToken(store({ type: "api_key", key: "junk-token" })),
  ).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("unrecognized prefix"),
  );
});

test("a served oauth credential maps its ACCESS token to an oauth-token", () => {
  // The connect-once serve path (managed cloud) writes pi's oauth variant with
  // a short-TTL access token and refresh="" — the SDK consumes the access
  // token via CLAUDE_CODE_OAUTH_TOKEN exactly like a setup token. It also
  // carries the access token's digest, captured HERE (spawn preparation) so a
  // revoked-token report can name the token the failed turn actually ran on
  // instead of whatever a re-serve stored since (PRODUCT-1319).
  const token = readAnthropicToken(
    store({
      type: "oauth",
      access: " sk-ant-oat01-served \n",
      refresh: "",
      expires: Date.now() + 60 * 60 * 1000,
    }),
  );
  expect(token).toEqual({
    kind: "oauth-token",
    value: "sk-ant-oat01-served",
    accessDigest: accessDigest("sk-ant-oat01-served"),
  });
});

test("a PASTED token (api_key-typed entry) carries NO access digest", () => {
  // Only OAUTH-typed store entries feed the revoked-token report (the
  // reporter's oauth gate, enforced at capture) — a pasted setup token stored
  // as api_key must stay digest-less even though it maps to an oauth-token env
  // var.
  const token = readAnthropicToken(
    store({ type: "api_key", key: "sk-ant-oat01-pasted" }),
  );
  expect(token?.kind).toBe("oauth-token");
  expect(token?.accessDigest).toBeUndefined();
});

test("an EXPIRED served oauth token is refused (falls back to the config dir)", () => {
  // The env token outranks the config dir's self-refreshing credential inside
  // the SDK — an expired served token must never shadow a working one.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(
    readAnthropicToken(
      store({
        type: "oauth",
        access: "sk-ant-oat01-stale",
        refresh: "",
        expires: Date.now() - 1,
      }),
    ),
  ).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("expired"));
});

test("an oauth entry with NO recorded expiry (expires=0) is served as-is", () => {
  const token = readAnthropicToken(
    store({ type: "oauth", access: "sk-ant-oat01-x", refresh: "", expires: 0 }),
  );
  expect(token).toEqual({
    kind: "oauth-token",
    value: "sk-ant-oat01-x",
    accessDigest: accessDigest("sk-ant-oat01-x"),
  });
});

test("an oauth credential with an empty access token returns undefined AND logs", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(
    readAnthropicToken(
      store({ type: "oauth", access: "  ", refresh: "", expires: 0 }),
    ),
  ).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("empty access token"),
  );
});

test("an oauth credential with an unrecognized prefix returns undefined AND logs", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(
    readAnthropicToken(
      store({ type: "oauth", access: "junk", refresh: "", expires: 0 }),
    ),
  ).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("unrecognized prefix"),
  );
});

test("an unknown stored variant returns undefined AND logs", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const bogus = { type: "wat" } as unknown as Credential;
  expect(readAnthropicToken(store(bogus))).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("expected api_key or oauth"),
  );
});

// ---------------------------------------------------------------------------
// The shared-login-dir fallback: one login heals EVERY agent's runtime.
// ---------------------------------------------------------------------------

test("NO store entry falls back to the shared login dir's credential file", () => {
  // The bug: only the runtime that RECEIVED the pushed credential holds an
  // auth.json entry. Every other agent (the roster-hidden assistant can never
  // be the push target) resolved nothing and dropped to the platform config-dir
  // mechanism — the macOS Keychain, which the push never writes — so every turn
  // failed `unauthenticated / token_expired`.
  writeSharedLoginFile(envelope("sk-ant-oat01-shared", Date.now() + HOUR));
  expect(readAnthropicToken(store(undefined))).toEqual({
    kind: "oauth-token",
    value: "sk-ant-oat01-shared",
  });
});

test("an EXPIRED store entry falls back to the shared login dir's credential", () => {
  writeSharedLoginFile(envelope("sk-ant-oat01-shared", Date.now() + HOUR));
  expect(
    readAnthropicToken(
      store({
        type: "oauth",
        access: "sk-ant-oat01-stale",
        refresh: "",
        expires: Date.now() - 1,
      }),
    ),
  ).toEqual({ kind: "oauth-token", value: "sk-ant-oat01-shared" });
});

test("an UNEXPIRED store entry still outranks the shared login file", () => {
  writeSharedLoginFile(envelope("sk-ant-oat01-shared", Date.now() + HOUR));
  expect(
    readAnthropicToken(
      store({
        type: "oauth",
        access: "sk-ant-oat01-served",
        refresh: "",
        expires: Date.now() + HOUR,
      }),
    ),
  ).toMatchObject({ kind: "oauth-token", value: "sk-ant-oat01-served" });
});

test("an EXPIRED shared login file is NOT used (falls through to the config dir)", () => {
  // An expired access token in the env var would SHADOW the config dir's
  // self-refreshing credential — strictly worse than resolving nothing.
  writeSharedLoginFile(envelope("sk-ant-oat01-dead", Date.now() - 1));
  expect(readAnthropicToken(store(undefined))).toBeUndefined();
});

test("a shared login file with NO recorded expiry is used as-is", () => {
  writeSharedLoginFile({
    claudeAiOauth: { accessToken: "sk-ant-oat01-noexp" },
  });
  expect(readAnthropicToken(store(undefined))).toEqual({
    kind: "oauth-token",
    value: "sk-ant-oat01-noexp",
  });
});

test("a MALFORMED shared login file is tolerated and falls through", () => {
  const dir = claudeLoginConfigDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(claudeCredentialsFile(dir), "{not json");
  expect(() => readAnthropicToken(store(undefined))).not.toThrow();
  expect(readAnthropicToken(store(undefined))).toBeUndefined();
});

test("a shared login file with the wrong envelope shape falls through", () => {
  writeSharedLoginFile({ someOtherKey: { accessToken: "sk-ant-oat01-x" } });
  expect(readAnthropicToken(store(undefined))).toBeUndefined();
});

test("an ABSENT shared login file resolves nothing, without warning", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(readAnthropicToken(store(undefined))).toBeUndefined();
  expect(warn).not.toHaveBeenCalled();
});

test("a PERSONAL scope never reads the shared login file (HOU-976)", () => {
  // The read-side mirror of `credentials-file.ts`'s write refusal: that file is
  // pod-WIDE, so on a managed pod it holds the TEAM's credential. A member
  // acting under their own scope must surface "not connected", never silently
  // run (and bill) on the team account.
  writeSharedLoginFile(envelope("sk-ant-oat01-team", Date.now() + HOUR));
  const token = runWithActingContext({ credentialScopeKey: "u:member-1" }, () =>
    readAnthropicToken(store(undefined)),
  );
  expect(token).toBeUndefined();
});

test("the shared login file's token carries NO access digest", () => {
  // The revoked-token report names the token a failed turn ran on, and is gated
  // to OAUTH-typed STORE entries (the reporter's own gate). A config-dir
  // credential has no store entry to report against, so it stays digest-less —
  // which also keeps `claudeSessionTokenStale` from rebuilding sessions under a
  // working setup.
  writeSharedLoginFile(envelope("sk-ant-oat01-shared", Date.now() + HOUR));
  expect(readAnthropicToken(store(undefined))?.accessDigest).toBeUndefined();
});

// ── One authoritative login across runtimes ────────────────────────────────
// Every agent has its own runtime and its own `auth.json`, but ONE shared login
// file. A reconnect reaches exactly one runtime's store; the others learn about
// it only from that file, so an unexpired copy of the account the user just
// left must not outrank it.

test("a newer shared login outranks this runtime's own unexpired copy", () => {
  // The repro: runtime A holds an unexpired token for the account the user left
  // (or one the reconnect superseded); the user reconnects via runtime B, which
  // updates the shared file. Before this, A preferred its own copy until it
  // expired — hours of turns failing on an identity the user already replaced.
  writeSharedLoginFile(
    envelope("sk-ant-oat01-reconnected", Date.now() + 8 * HOUR),
  );

  const token = readAnthropicToken(
    store({
      type: "oauth",
      access: "sk-ant-oat01-superseded",
      refresh: "",
      expires: Date.now() + HOUR,
    }),
  );

  expect(token).toEqual({
    kind: "oauth-token",
    value: "sk-ant-oat01-reconnected",
  });
});

test("a SUPERSEDED store entry is DELETED, not just skipped", () => {
  // Skipping is not enough. The dead entry stays in auth.json and wins again
  // the moment the shared file can no longer prove it is newer — here, by the
  // file being removed — putting the runtime back on the account the user left.
  writeSharedLoginFile(
    envelope("sk-ant-oat01-reconnected", Date.now() + 8 * HOUR),
  );
  const s = store({
    type: "oauth",
    access: "sk-ant-oat01-superseded",
    refresh: "",
    expires: Date.now() + HOUR,
  });

  expect(readAnthropicToken(s)).toEqual({
    kind: "oauth-token",
    value: "sk-ant-oat01-reconnected",
  });
  expect(s.removed).toEqual(["anthropic"]);
  expect(s.get("anthropic")).toBeUndefined();

  // The proof it matters: with the shared file gone, the superseded token must
  // not come back. Before the delete this resolved it again.
  rmSync(claudeLoginConfigDir(), { recursive: true, force: true });
  expect(readAnthropicToken(s)).toBeUndefined();
});

test("a store entry that is NOT superseded is left in place", () => {
  // The delete is scoped to a PROVEN supersession — an older shared file must
  // never cost the runtime the credential the gateway just served it.
  writeSharedLoginFile(envelope("sk-ant-oat01-stale-file", Date.now() + HOUR));
  const s = store({
    type: "oauth",
    access: "sk-ant-oat01-just-served",
    refresh: "",
    expires: Date.now() + 8 * HOUR,
  });

  expect(readAnthropicToken(s)).toMatchObject({
    value: "sk-ant-oat01-just-served",
  });
  expect(s.removed).toEqual([]);
});

test("an OLDER shared login never displaces a freshly served credential", () => {
  // The same bug facing the other way: on a managed pod the gateway serves this
  // runtime a token per turn, and a login file left behind by an earlier
  // connect must never pull the pod back onto it.
  writeSharedLoginFile(envelope("sk-ant-oat01-stale-file", Date.now() + HOUR));

  const token = readAnthropicToken(
    store({
      type: "oauth",
      access: "sk-ant-oat01-just-served",
      refresh: "",
      expires: Date.now() + 8 * HOUR,
    }),
  );

  expect(token).toMatchObject({ value: "sk-ant-oat01-just-served" });
});

test("a shared login with no expiry recorded cannot prove it is newer", () => {
  writeSharedLoginFile({
    claudeAiOauth: { accessToken: "sk-ant-oat01-undated", refreshToken: "r" },
  });

  const token = readAnthropicToken(
    store({
      type: "oauth",
      access: "sk-ant-oat01-mine",
      refresh: "",
      expires: Date.now() + HOUR,
    }),
  );

  expect(token).toMatchObject({ value: "sk-ant-oat01-mine" });
});

test("the same token in both sinks is one login, and stays digest-stamped", () => {
  const access = "sk-ant-oat01-same";
  writeSharedLoginFile(envelope(access, Date.now() + 8 * HOUR));

  const token = readAnthropicToken(
    store({ type: "oauth", access, refresh: "", expires: Date.now() + HOUR }),
  );

  // Taking the file here would silently drop the digest the revoked-token
  // report needs (PRODUCT-1319) for no gain — it is the same credential.
  expect(token).toEqual({
    kind: "oauth-token",
    value: access,
    accessDigest: accessDigest(access),
  });
});

test("a pasted key is the user's own choice for this runtime, never superseded", () => {
  writeSharedLoginFile(envelope("sk-ant-oat01-shared", Date.now() + 8 * HOUR));

  const token = readAnthropicToken(
    store({ type: "api_key", key: "sk-ant-api03-pasted" }),
  );

  expect(token).toEqual({ kind: "api-key", value: "sk-ant-api03-pasted" });
});

test("a personal scope is never moved onto the pod-shared login", () => {
  // The file is the TEAM's credential on a managed pod. Adopting it for a
  // member would run — and bill — their turn on the team account.
  writeSharedLoginFile(envelope("sk-ant-oat01-team", Date.now() + 8 * HOUR));

  const token = runWithActingContext({ credentialScopeKey: "u:member-1" }, () =>
    readAnthropicToken(
      store({
        type: "oauth",
        access: "sk-ant-oat01-mine",
        refresh: "",
        expires: Date.now() + HOUR,
      }),
    ),
  );

  expect(token).toMatchObject({ value: "sk-ant-oat01-mine" });
});

// ── The served entry is authoritative on a managed pod ─────────────────────
// There the gateway rotates a short-TTL access token into auth.json before
// every turn and NOTHING rewrites the pod-shared login file, so the file's
// longer-lived push-time value would "supersede" every served token forever.

test("a served anthropic entry is never superseded by the pod-shared file", () => {
  // The ping-pong: each read deleted the just-served entry and ran the turn on
  // the older pushed token; the next sync re-applied the served one; repeat —
  // until Anthropic invalidated the previous holder and every turn 401'd
  // token_revoked.
  serveModeServing(["anthropic"]);
  writeSharedLoginFile(envelope("sk-ant-oat01-pushed", Date.now() + 8 * HOUR));
  const s = store({
    type: "oauth",
    access: "sk-ant-oat01-served",
    refresh: "",
    expires: Date.now() + 5 * 60 * 1000, // the gateway's short TTL
  });

  expect(readAnthropicToken(s)).toMatchObject({
    value: "sk-ant-oat01-served",
  });
  expect(s.removed).toEqual([]);
  expect(s.get("anthropic")).toBeDefined();
});

test("a managed pod that does NOT serve anthropic keeps the supersede rule", () => {
  // The desktop pushes anthropic to one agent's runtime there, so a reconnect
  // pushed to ANOTHER runtime reaches this one only through the shared file.
  serveModeServing(["openai-codex"]);
  writeSharedLoginFile(
    envelope("sk-ant-oat01-reconnected", Date.now() + 8 * HOUR),
  );
  const s = store({
    type: "oauth",
    access: "sk-ant-oat01-superseded",
    refresh: "",
    expires: Date.now() + HOUR,
  });

  expect(readAnthropicToken(s)).toMatchObject({
    value: "sk-ant-oat01-reconnected",
  });
  expect(s.removed).toEqual(["anthropic"]);
});

test("a disk that cannot drop the superseded entry still resolves the login", () => {
  // The drop is a write (auth.json); EACCES/ENOSPC must not fail the turn where
  // it used to degrade to "keep resolving".
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  writeSharedLoginFile(
    envelope("sk-ant-oat01-reconnected", Date.now() + 8 * HOUR),
  );
  const s = store({
    type: "oauth",
    access: "sk-ant-oat01-superseded",
    refresh: "",
    expires: Date.now() + HOUR,
  });
  s.remove = () => {
    throw Object.assign(new Error("ENOSPC: no space left on device"), {
      code: "ENOSPC",
    });
  };

  expect(readAnthropicToken(s)).toEqual({
    kind: "oauth-token",
    value: "sk-ant-oat01-reconnected",
  });
  // Never silent to us: console.error is the runtime's Sentry feed.
  expect(error).toHaveBeenCalledWith(
    expect.stringContaining("could not drop the superseded"),
    expect.stringContaining("ENOSPC"),
  );
  error.mockRestore();
});

// ── The shared login file is parsed once per CHANGE, not once per read ─────

test("an unchanged shared login file is read from disk once, not per call", () => {
  // Every credential read of a turn lands here (prompt prep, summarizer,
  // anonymizer, each cache lookup), and each one used to open, read and parse
  // the file again.
  writeSharedLoginFile(envelope("sk-ant-oat01-shared", Date.now() + HOUR));
  const path = claudeCredentialsFile(claudeLoginConfigDir());
  vi.mocked(readFileSync).mockClear();

  const first = readAnthropicToken(store(undefined));
  for (let i = 0; i < 5; i++) {
    expect(readAnthropicToken(store(undefined))).toEqual(first);
  }

  expect(first).toMatchObject({ value: "sk-ant-oat01-shared" });
  expect(
    vi.mocked(readFileSync).mock.calls.filter((call) => call[0] === path),
  ).toHaveLength(1);
});

test("a REWRITTEN shared login file is picked up, not served from the cache", () => {
  writeSharedLoginFile(envelope("sk-ant-oat01-first", Date.now() + HOUR));
  expect(readAnthropicToken(store(undefined))).toMatchObject({
    value: "sk-ant-oat01-first",
  });

  // A reconnect rewrites the file: the very next read must see the new login,
  // or the runtime keeps authenticating with the credential it just replaced.
  writeSharedLoginFile(envelope("sk-ant-oat01-second", Date.now() + 2 * HOUR));
  expect(readAnthropicToken(store(undefined))).toMatchObject({
    value: "sk-ant-oat01-second",
  });
});

test("a shared login file removed under the cache resolves nothing", () => {
  writeSharedLoginFile(envelope("sk-ant-oat01-gone", Date.now() + HOUR));
  expect(readAnthropicToken(store(undefined))).toBeDefined();

  rmSync(claudeLoginConfigDir(), { recursive: true, force: true });
  expect(readAnthropicToken(store(undefined))).toBeUndefined();
});

test("expiry is judged per read, never cached with the parse", () => {
  // The file is parsed once; whether its token can still authenticate a turn
  // is a question about NOW, and must be re-asked on every read.
  const expiresAt = Date.now() + 50;
  writeSharedLoginFile(envelope("sk-ant-oat01-brief", expiresAt));
  expect(readAnthropicToken(store(undefined))).toMatchObject({
    value: "sk-ant-oat01-brief",
  });

  vi.useFakeTimers();
  vi.setSystemTime(expiresAt + 1);
  expect(readAnthropicToken(store(undefined))).toBeUndefined();
  vi.useRealTimers();
});

test("an expired SERVED token never falls back to the shared login file", () => {
  // On a pod the gateway is the authority for, the shared file is a push-time
  // leftover that can belong to another account entirely. Running the turn on
  // it would authenticate the user as someone else; failing the turn lets the
  // next sync bring a fresh token.
  serveModeServing(["anthropic"]);
  writeSharedLoginFile(
    envelope("sk-ant-oat01-someone-else", Date.now() + HOUR),
  );
  expect(
    readAnthropicToken(
      store({
        type: "oauth",
        access: "sk-ant-oat01-served",
        refresh: "",
        expires: Date.now() - 1,
      }),
    ),
  ).toBeUndefined();
});

test("an expired token still falls back where the file IS the authority", () => {
  // Desktop and self-host: one login, every agent. Nothing central serves
  // anthropic here, so the shared file is exactly what the user logged in with.
  writeSharedLoginFile(envelope("sk-ant-oat01-desktop", Date.now() + HOUR));
  expect(
    readAnthropicToken(
      store({
        type: "oauth",
        access: "sk-ant-oat01-old",
        refresh: "",
        expires: Date.now() - 1,
      }),
    ),
  ).toMatchObject({ kind: "oauth-token", value: "sk-ant-oat01-desktop" });
});

test("a caller with no remove drops nothing", () => {
  // The session staleness probe (session/claude-token-guard.ts) asks whether a
  // cached session's token is still current. It must answer, not act.
  writeSharedLoginFile(envelope("sk-ant-oat01-newer", Date.now() + 2 * HOUR));
  const held = store({
    type: "oauth",
    access: "sk-ant-oat01-older",
    refresh: "",
    expires: Date.now() + HOUR,
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const readOnly = readAnthropicToken({ get: held.get });
  expect(readOnly).toMatchObject({ value: "sk-ant-oat01-newer" });
  expect(held.removed).toEqual([]);
  // Not attempted at all: a probe that tries the write and reports the failure
  // is a probe that fills the log with an error nobody can act on.
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
  // The full read, which owns the drop, still records the supersession.
  expect(readAnthropicToken(held)).toMatchObject({
    value: "sk-ant-oat01-newer",
  });
  expect(held.removed).toEqual(["anthropic"]);
});
