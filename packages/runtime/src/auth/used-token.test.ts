import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accessDigest } from "@houston/protocol/access-digest";
import { expect, test } from "vitest";
import { HoustonAuthStore } from "./credential-store";
import {
  currentUsedTokenDigest,
  newUsedTokenCapture,
  recordUsedToken,
  runWithUsedTokenCapture,
} from "./used-token";

/**
 * The used-token capture pins a revoked-token report to the token the FAILED
 * turn ran on (PRODUCT-1319). What matters: only the digest is held (never the
 * raw token), recording is per-turn (concurrent turns cannot overwrite each
 * other's evidence), and the credential store records at pi's request-time
 * read — the moment the token a request runs on is knowable.
 */

test("holds the DIGEST of the recorded token, never the raw value", () => {
  const capture = newUsedTokenCapture();
  capture.record("anthropic", "the-raw-token");
  expect(capture.digestFor("anthropic")).toBe(accessDigest("the-raw-token"));
  expect(capture.digestFor("anthropic")).not.toContain("the-raw-token");
  expect(capture.digestFor("openai-codex")).toBeUndefined();
});

test("recordUsedToken writes into the ambient capture; a no-op outside a turn", () => {
  // Outside a turn (login flows, status probes) there is nothing to record
  // into — must not throw, must not leak into a later turn.
  recordUsedToken("anthropic", "stray-token");

  const capture = newUsedTokenCapture();
  runWithUsedTokenCapture(capture, () => {
    recordUsedToken("anthropic", "turn-token");
    expect(currentUsedTokenDigest("anthropic")).toBe(
      accessDigest("turn-token"),
    );
  });
  expect(capture.digestFor("anthropic")).toBe(accessDigest("turn-token"));
  // The stray pre-turn record never reached this turn's capture.
  expect(capture.digestFor("anthropic")).not.toBe(accessDigest("stray-token"));
  // And outside the subtree there is no ambient capture again.
  expect(currentUsedTokenDigest("anthropic")).toBeUndefined();
});

test("concurrent turns record into THEIR OWN captures", async () => {
  // A module-level "last read" map would let turn B's fresher read overwrite
  // turn A's evidence between A's 401 and A's report — the exact window the
  // per-turn holder closes.
  const a = newUsedTokenCapture();
  const b = newUsedTokenCapture();
  await Promise.all([
    runWithUsedTokenCapture(a, async () => {
      await new Promise((r) => setTimeout(r, 1));
      recordUsedToken("anthropic", "token-A");
    }),
    runWithUsedTokenCapture(b, async () => {
      recordUsedToken("anthropic", "token-B");
    }),
  ]);
  expect(a.digestFor("anthropic")).toBe(accessDigest("token-A"));
  expect(b.digestFor("anthropic")).toBe(accessDigest("token-B"));
});

test("the credential store records an oauth read into the turn's capture", async () => {
  // pi calls `read()` inside `prepareRequest` on every stream() — inside the
  // turn's async subtree — so this IS the request-preparation capture point.
  const dir = mkdtempSync(join(tmpdir(), "houston-used-token-"));
  const authPath = join(dir, "auth.json");
  writeFileSync(
    authPath,
    JSON.stringify({
      anthropic: {
        type: "oauth",
        access: "read-token",
        refresh: "",
        expires: 0,
      },
      google: { type: "api_key", key: "AIza-key" },
    }),
  );
  const store = new HoustonAuthStore(authPath);

  const capture = newUsedTokenCapture();
  await runWithUsedTokenCapture(capture, async () => {
    await store.read("anthropic");
    // api_key reads record nothing: an api_key has no revocation semantics
    // the report may act on (the reporter's oauth gate, enforced at capture).
    await store.read("google");
  });
  expect(capture.digestFor("anthropic")).toBe(accessDigest("read-token"));
  expect(capture.digestFor("google")).toBeUndefined();
});

test("an OAuth refresh through modify() re-records the ROTATED token", async () => {
  // pi's refresh runs through modify(); requests after it use the NEW token,
  // so a 401 on that token must be reported under ITS digest, not the
  // pre-refresh one.
  const dir = mkdtempSync(join(tmpdir(), "houston-used-token-refresh-"));
  const authPath = join(dir, "auth.json");
  writeFileSync(
    authPath,
    JSON.stringify({
      anthropic: {
        type: "oauth",
        access: "old-token",
        refresh: "r",
        expires: 0,
      },
    }),
  );
  const store = new HoustonAuthStore(authPath);

  const capture = newUsedTokenCapture();
  await runWithUsedTokenCapture(capture, async () => {
    await store.read("anthropic");
    expect(capture.digestFor("anthropic")).toBe(accessDigest("old-token"));
    await store.modify("anthropic", async () => ({
      type: "oauth",
      access: "rotated-token",
      refresh: "r",
      expires: 0,
    }));
  });
  expect(capture.digestFor("anthropic")).toBe(accessDigest("rotated-token"));
});
