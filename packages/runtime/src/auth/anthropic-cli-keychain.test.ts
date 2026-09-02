import { expect, test } from "vitest";
import {
  discardKeychainCredential,
  keychainServiceFor,
  readKeychainCredential,
  type SecurityRun,
} from "./anthropic-cli-keychain";

const DIR = "/Users/daniel/.dev-houston/claude-login";
/** Known vector shared with the desktop shell's `credential.rs` test. */
const SERVICE = "Claude Code-credentials-3d1329c5";
const VALID = JSON.stringify({
  claudeAiOauth: {
    accessToken: "sk-ant-oat01-access",
    refreshToken: "sk-ant-ort01-refresh",
    expiresAt: 123,
  },
});
const HUSK = JSON.stringify({
  claudeAiOauth: { accessToken: "", refreshToken: "", expiresAt: 0 },
});

/** Script `security` by argv; records every invocation. */
function fakeSecurity(
  script: (args: string[]) => { code: number; stdout?: string },
): { run: SecurityRun; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    run: async (args) => {
      calls.push(args);
      const r = script(args);
      return { code: r.code, stdout: r.stdout ?? "" };
    },
  };
}

test("keychainServiceFor hashes the CLAUDE_CONFIG_DIR string like the CLI", () => {
  expect(keychainServiceFor(DIR)).toBe(SERVICE);
  expect(keychainServiceFor("/a/claude-login")).not.toBe(
    keychainServiceFor("/b/claude-login"),
  );
});

test("read: the username's dir-scoped item wins, output returned verbatim", async () => {
  const sec = fakeSecurity(() => ({ code: 0, stdout: `${VALID}\n` }));
  const got = await readKeychainCredential(DIR, {
    platform: "darwin",
    user: "daniel",
    run: sec.run,
  });
  expect(got).toBe(`${VALID}\n`);
  expect(sec.calls).toEqual([
    ["find-generic-password", "-s", SERVICE, "-a", "daniel", "-w"],
  ]);
});

test("read: a husk under the username falls through to any account", async () => {
  const sec = fakeSecurity((args) =>
    args.includes("-a")
      ? { code: 0, stdout: HUSK }
      : { code: 0, stdout: VALID },
  );
  const got = await readKeychainCredential(DIR, {
    platform: "darwin",
    user: "daniel",
    run: sec.run,
  });
  expect(got).toBe(VALID);
  expect(sec.calls).toHaveLength(2);
  expect(sec.calls[1]).toEqual(["find-generic-password", "-s", SERVICE, "-w"]);
});

test("read: absent item (exit 44) resolves null; no username skips -a", async () => {
  const sec = fakeSecurity(() => ({ code: 44 }));
  const got = await readKeychainCredential(DIR, {
    platform: "darwin",
    user: null,
    run: sec.run,
  });
  expect(got).toBeNull();
  expect(sec.calls).toEqual([["find-generic-password", "-s", SERVICE, "-w"]]);
});

test("read + discard: no-ops off macOS without touching security", async () => {
  const sec = fakeSecurity(() => ({ code: 0, stdout: VALID }));
  expect(
    await readKeychainCredential(DIR, { platform: "linux", run: sec.run }),
  ).toBeNull();
  await discardKeychainCredential(DIR, { platform: "linux", run: sec.run });
  expect(sec.calls).toEqual([]);
});

test("discard: deletes every item under the service until exit 44", async () => {
  let remaining = 2;
  const sec = fakeSecurity(() => ({ code: remaining-- > 0 ? 0 : 44 }));
  await discardKeychainCredential(DIR, { platform: "darwin", run: sec.run });
  expect(sec.calls).toHaveLength(3);
  expect(sec.calls[0]).toEqual(["delete-generic-password", "-s", SERVICE]);
});

test("discard: an unexpected security exit is an error, not a silent leftover", async () => {
  const sec = fakeSecurity(() => ({ code: 36 }));
  await expect(
    discardKeychainCredential(DIR, { platform: "darwin", run: sec.run }),
  ).rejects.toThrow(/exited 36/);
});
