import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ClaudeOAuthCredential } from "@houston/runtime-client";
import { expect, test, vi } from "vitest";
import {
  CLI_LOGIN_INSTRUCTIONS,
  type CliLoginIo,
  CliLoginUnavailableError,
  podCliLoginAvailable,
  runAnthropicCliLogin,
  runAnthropicConnect,
  storeMintedClaudeCredential,
} from "./anthropic-cli-login";
import { PASTE_INSTRUCTIONS } from "./anthropic-setup-token";

/**
 * A scriptable stand-in for the spawned CLI: real streams (so the driver's
 * readline and stdin writes run for real), scripted exits. Matches the Rust
 * runner tests' fake-`claude`-binary approach without a subprocess.
 */
class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  stdinData = "";
  killed = false;
  constructor() {
    super();
    this.stdin.on("data", (c) => {
      this.stdinData += String(c);
    });
  }
  kill(): boolean {
    this.killed = true;
    return true;
  }
  asChild(): ChildProcessWithoutNullStreams {
    return this as unknown as ChildProcessWithoutNullStreams;
  }
}

const MINTED: ClaudeOAuthCredential = {
  accessToken: "sk-ant-oat01-access",
  refreshToken: "refresh-1",
  expiresAt: 4102444800000,
  subscriptionType: "max",
};

function fakeIo(
  child: FakeChild,
  overrides: Partial<CliLoginIo> = {},
): { io: CliLoginIo; removed: string[] } {
  const removed: string[] = [];
  return {
    removed,
    io: {
      makeMintDir: () => "/tmp/mint-under-test",
      removeMintDir: (d) => {
        removed.push(d);
      },
      spawn: () => child.asChild(),
      readCredential: () => MINTED,
      platform: "linux",
      env: {},
      urlTimeoutMs: 1_000,
      exitTimeoutMs: 5_000,
      ...overrides,
    },
  };
}

const tick = () => new Promise((r) => setImmediate(r));

const VISIT_LINE =
  "Please visit: https://claude.com/cai/oauth/authorize?code=true&state=s1\n";

test("happy path: URL relayed, pasted code fed to stdin, credential stored, mint dir scrubbed", async () => {
  const child = new FakeChild();
  const { io, removed } = fakeIo(child);
  const onAuth = vi.fn();
  const store = vi.fn();
  const run = runAnthropicCliLogin(
    { onAuth, onManualCodeInput: () => Promise.resolve("  code#state1  ") },
    { store },
    io,
  );
  child.stdout.write(VISIT_LINE);
  await tick();
  expect(onAuth).toHaveBeenCalledExactlyOnceWith({
    url: "https://claude.com/cai/oauth/authorize?code=true&state=s1",
    instructions: CLI_LOGIN_INSTRUCTIONS,
  });
  expect(child.stdinData).toBe("code#state1\n");
  child.emit("close", 0, null);
  await run;
  expect(store).toHaveBeenCalledExactlyOnceWith(MINTED);
  expect(removed).toEqual(["/tmp/mint-under-test"]);
});

test("a spawn error (no binary in this image) is fallback-eligible", async () => {
  const child = new FakeChild();
  const { io, removed } = fakeIo(child);
  const run = runAnthropicCliLogin(
    { onAuth: vi.fn(), onManualCodeInput: () => new Promise(() => {}) },
    { store: vi.fn() },
    io,
  );
  child.emit("error", new Error("spawn claude ENOENT"));
  await expect(run).rejects.toBeInstanceOf(CliLoginUnavailableError);
  expect(removed).toHaveLength(1);
});

test("silence past the URL window is fallback-eligible and kills the child", async () => {
  const child = new FakeChild();
  const { io } = fakeIo(child, { urlTimeoutMs: 20 });
  await expect(
    runAnthropicCliLogin(
      { onAuth: vi.fn(), onManualCodeInput: () => new Promise(() => {}) },
      { store: vi.fn() },
      io,
    ),
  ).rejects.toThrow(CliLoginUnavailableError);
  expect(child.killed).toBe(true);
});

test("a pre-URL non-zero exit is fallback-eligible and carries the stderr tail", async () => {
  const child = new FakeChild();
  const { io } = fakeIo(child);
  const run = runAnthropicCliLogin(
    { onAuth: vi.fn(), onManualCodeInput: () => new Promise(() => {}) },
    { store: vi.fn() },
    io,
  );
  child.stderr.write("unknown command: auth");
  await tick();
  child.emit("close", 1, null);
  await expect(run).rejects.toThrow(
    /Claude sign-in failed \(exit 1\): unknown command: auth/,
  );
  await expect(run).rejects.toBeInstanceOf(CliLoginUnavailableError);
});

test("a post-URL failure (declined approval) is a real error, never a fallback", async () => {
  const child = new FakeChild();
  const { io, removed } = fakeIo(child);
  const run = runAnthropicCliLogin(
    { onAuth: vi.fn(), onManualCodeInput: () => new Promise(() => {}) },
    { store: vi.fn() },
    io,
  );
  child.stdout.write(VISIT_LINE);
  await tick();
  child.stderr.write("authentication was declined");
  await tick();
  child.emit("close", 1, null);
  await expect(run).rejects.toThrow(/authentication was declined/);
  await expect(run).rejects.not.toBeInstanceOf(CliLoginUnavailableError);
  expect(removed).toHaveLength(1);
});

test("a post-URL signal death is a real error, never a fallback", async () => {
  const child = new FakeChild();
  const { io } = fakeIo(child);
  const run = runAnthropicCliLogin(
    { onAuth: vi.fn(), onManualCodeInput: () => new Promise(() => {}) },
    { store: vi.fn() },
    io,
  );
  child.stdout.write(VISIT_LINE);
  await tick();
  child.emit("close", null, "SIGKILL");
  await expect(run).rejects.toThrow(/Claude sign-in failed \(SIGKILL\)/);
  await expect(run).rejects.not.toBeInstanceOf(CliLoginUnavailableError);
});

test("an abort (cancel/expiry) is a cancellation, never a fallback — even pre-URL", async () => {
  const child = new FakeChild();
  const { io, removed } = fakeIo(child);
  const abort = new AbortController();
  const run = runAnthropicCliLogin(
    { onAuth: vi.fn(), onManualCodeInput: () => new Promise(() => {}) },
    { store: vi.fn(), signal: abort.signal },
    io,
  );
  await tick();
  abort.abort();
  await expect(run).rejects.toThrow(/login cancelled/);
  await expect(run).rejects.not.toBeInstanceOf(CliLoginUnavailableError);
  expect(child.killed).toBe(true);
  expect(removed).toHaveLength(1);
});

test("a clean exit that never printed a URL is fallback-eligible, not a success", async () => {
  // A fresh mint dir has no cached session, so exit 0 without an authorize URL
  // cannot be a mint — resolving would report success while the client's
  // dialog never opened.
  const child = new FakeChild();
  const { io } = fakeIo(child);
  const store = vi.fn();
  const run = runAnthropicCliLogin(
    { onAuth: vi.fn(), onManualCodeInput: () => new Promise(() => {}) },
    { store },
    io,
  );
  await tick();
  child.emit("close", 0, null);
  await expect(run).rejects.toBeInstanceOf(CliLoginUnavailableError);
  expect(store).not.toHaveBeenCalled();
});

test("a synchronously-throwing stdin write neither crashes nor changes the outcome", async () => {
  const child = new FakeChild();
  child.stdin.write = () => {
    throw new Error("ERR_STREAM_DESTROYED");
  };
  const { io } = fakeIo(child);
  const store = vi.fn();
  const run = runAnthropicCliLogin(
    { onAuth: vi.fn(), onManualCodeInput: () => Promise.resolve("code#state") },
    { store },
    io,
  );
  child.stdout.write(VISIT_LINE);
  await tick();
  child.emit("close", 0, null);
  await run;
  expect(store).toHaveBeenCalledTimes(1);
});

test("exit 0 with an unreadable mint is a real error and still scrubs", async () => {
  const child = new FakeChild();
  const { io, removed } = fakeIo(child, {
    readCredential: () => {
      throw new Error("left no credential");
    },
  });
  const run = runAnthropicCliLogin(
    { onAuth: vi.fn(), onManualCodeInput: () => new Promise(() => {}) },
    { store: vi.fn() },
    io,
  );
  child.stdout.write(VISIT_LINE);
  await tick();
  child.emit("close", 0, null);
  await expect(run).rejects.toThrow(/left no credential/);
  expect(removed).toHaveLength(1);
});

test("runAnthropicConnect degrades to the setup-token flow when the relay is unavailable", async () => {
  const child = new FakeChild();
  const { io } = fakeIo(child, { env: { HOUSTON_CLAUDE_POD_LOGIN: "0" } });
  const onAuth = vi.fn();
  const storeToken = vi.fn();
  await runAnthropicConnect(
    {
      onAuth,
      onManualCodeInput: () => Promise.resolve("sk-ant-oat01-pasted"),
    },
    { storeCredential: vi.fn(), storeToken },
    io,
  );
  expect(onAuth).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ instructions: PASTE_INSTRUCTIONS }),
  );
  expect(storeToken).toHaveBeenCalledExactlyOnceWith("sk-ant-oat01-pasted");
});

test("runAnthropicConnect surfaces a post-URL failure without switching flows", async () => {
  const child = new FakeChild();
  const { io } = fakeIo(child);
  const storeToken = vi.fn();
  const run = runAnthropicConnect(
    { onAuth: vi.fn(), onManualCodeInput: () => new Promise(() => {}) },
    { storeCredential: vi.fn(), storeToken },
    io,
  );
  child.stdout.write(VISIT_LINE);
  await tick();
  child.emit("close", 1, null);
  await expect(run).rejects.toThrow(/exit 1/);
  expect(storeToken).not.toHaveBeenCalled();
});

test("podCliLoginAvailable gates the kill switch and macOS", () => {
  expect(podCliLoginAvailable("linux", {})).toEqual({ ok: true });
  expect(podCliLoginAvailable("win32", {})).toEqual({ ok: true });
  expect(
    podCliLoginAvailable("linux", { HOUSTON_CLAUDE_POD_LOGIN: "0" }).ok,
  ).toBe(false);
  expect(podCliLoginAvailable("darwin", {}).ok).toBe(false);
});

function mintSink(opts: { serve: boolean; personal: boolean }) {
  const calls: {
    stored?: unknown;
    materialized?: { dir: string; cred: ClaudeOAuthCredential };
    warmed: boolean;
  } = { warmed: false };
  return {
    calls,
    io: {
      storage: {
        set: (_provider: string, cred: unknown) => {
          calls.stored = cred;
        },
      },
      serveMode: () => opts.serve,
      personalScope: () => opts.personal,
      materialize: (dir: string, cred: ClaudeOAuthCredential) => {
        calls.materialized = { dir, cred };
      },
      loginDir: () => "/data/claude-login",
      warmProbe: async () => {
        calls.warmed = true;
      },
    },
  };
}

test("mint sink, team + serve mode: full entry in auth.json, access-only file, warmed probe", async () => {
  const { io, calls } = mintSink({ serve: true, personal: false });
  await storeMintedClaudeCredential(MINTED, io);
  expect(calls.stored).toEqual({
    type: "oauth",
    access: "sk-ant-oat01-access",
    refresh: "refresh-1",
    expires: 4102444800000,
  });
  expect(calls.materialized).toEqual({
    dir: "/data/claude-login",
    cred: { ...MINTED, refreshToken: "" },
  });
  expect(calls.warmed).toBe(true);
});

test("mint sink, team + self-host: the materialized file keeps the refresh token", async () => {
  const { io, calls } = mintSink({ serve: false, personal: false });
  await storeMintedClaudeCredential(MINTED, io);
  expect(calls.materialized?.cred).toEqual(MINTED);
});

test("mint sink, personal scope: never touches the pod-shared file", async () => {
  const { io, calls } = mintSink({ serve: true, personal: true });
  await storeMintedClaudeCredential(MINTED, io);
  expect(calls.stored).toBeDefined();
  expect(calls.materialized).toBeUndefined();
  expect(calls.warmed).toBe(false);
});
