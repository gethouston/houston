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
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";

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

afterEach(() => {
  vi.restoreAllMocks();
});

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

let prevHome: string | undefined;
let prevDataDir: string;
let home: string;

beforeAll(() => {
  prevHome = process.env.HOUSTON_HOME;
  home = mkdtempSync(join(tmpdir(), "read-token-home-"));
  process.env.HOUSTON_HOME = home;
  prevDataDir = config.dataDir;
  config.dataDir = join(home, "data");
});

afterAll(() => {
  if (prevHome === undefined) delete process.env.HOUSTON_HOME;
  else process.env.HOUSTON_HOME = prevHome;
  config.dataDir = prevDataDir;
  rmSync(home, { recursive: true, force: true });
});

function writeSharedLoginFile(body: unknown): void {
  const dir = claudeLoginConfigDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(claudeCredentialsFile(dir), JSON.stringify(body));
}

function envelope(access: string, expiresAt: number): unknown {
  return {
    claudeAiOauth: { accessToken: access, refreshToken: "r", expiresAt },
  };
}

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  rmSync(claudeLoginConfigDir(), { recursive: true, force: true });
  forgetSharedLoginCacheForTest();
  rmSync(servedProvidersPathIn(config.dataDir, TEAM_CREDENTIAL_SCOPE), {
    force: true,
  });
  config.controlPlaneUrl = "";
  config.sandboxToken = "";
});

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
  const token = readAnthropicToken(
    store({ type: "api_key", key: "sk-ant-oat01-pasted" }),
  );
  expect(token?.kind).toBe("oauth-token");
  expect(token?.accessDigest).toBeUndefined();
});

test("an EXPIRED served oauth token is refused (falls back to the config dir)", () => {
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

test("NO store entry falls back to the shared login dir's credential file", () => {
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
  writeSharedLoginFile(envelope("sk-ant-oat01-team", Date.now() + HOUR));
  const token = runWithActingContext({ credentialScopeKey: "u:member-1" }, () =>
    readAnthropicToken(store(undefined)),
  );
  expect(token).toBeUndefined();
});

test("the shared login file's token carries NO access digest", () => {
  writeSharedLoginFile(envelope("sk-ant-oat01-shared", Date.now() + HOUR));
  expect(readAnthropicToken(store(undefined))?.accessDigest).toBeUndefined();
});

test("a newer shared login outranks this runtime's own unexpired copy", () => {
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

  rmSync(claudeLoginConfigDir(), { recursive: true, force: true });
  expect(readAnthropicToken(s)).toBeUndefined();
});

test("a store entry that is NOT superseded is left in place", () => {
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

test("a served anthropic entry is never superseded by the pod-shared file", () => {
  serveModeServing(["anthropic"]);
  writeSharedLoginFile(envelope("sk-ant-oat01-pushed", Date.now() + 8 * HOUR));
  const s = store({
    type: "oauth",
    access: "sk-ant-oat01-served",
    refresh: "",
    expires: Date.now() + 5 * 60 * 1000,
  });

  expect(readAnthropicToken(s)).toMatchObject({
    value: "sk-ant-oat01-served",
  });
  expect(s.removed).toEqual([]);
  expect(s.get("anthropic")).toBeDefined();
});

test("a managed pod that does NOT serve anthropic keeps the supersede rule", () => {
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
  expect(error).toHaveBeenCalledWith(
    expect.stringContaining("could not drop the superseded"),
    expect.stringContaining("ENOSPC"),
  );
  error.mockRestore();
});

test("an unchanged shared login file is read from disk once, not per call", () => {
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
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
  expect(readAnthropicToken(held)).toMatchObject({
    value: "sk-ant-oat01-newer",
  });
  expect(held.removed).toEqual(["anthropic"]);
});
