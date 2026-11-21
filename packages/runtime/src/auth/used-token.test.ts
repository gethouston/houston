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

test("holds the DIGEST of the recorded token, never the raw value", () => {
  const capture = newUsedTokenCapture();
  capture.record("anthropic", "the-raw-token");
  expect(capture.digestFor("anthropic")).toBe(accessDigest("the-raw-token"));
  expect(capture.digestFor("anthropic")).not.toContain("the-raw-token");
  expect(capture.digestFor("openai-codex")).toBeUndefined();
});

test("recordUsedToken writes into the ambient capture; a no-op outside a turn", () => {
  recordUsedToken("anthropic", "stray-token");

  const capture = newUsedTokenCapture();
  runWithUsedTokenCapture(capture, () => {
    recordUsedToken("anthropic", "turn-token");
    expect(currentUsedTokenDigest("anthropic")).toBe(
      accessDigest("turn-token"),
    );
  });
  expect(capture.digestFor("anthropic")).toBe(accessDigest("turn-token"));
  expect(capture.digestFor("anthropic")).not.toBe(accessDigest("stray-token"));
  expect(currentUsedTokenDigest("anthropic")).toBeUndefined();
});

test("concurrent turns record into THEIR OWN captures", async () => {
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
    await store.read("google");
  });
  expect(capture.digestFor("anthropic")).toBe(accessDigest("read-token"));
  expect(capture.digestFor("google")).toBeUndefined();
});

test("an OAuth refresh through modify() re-records the ROTATED token", async () => {
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
