import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { FileIntegrationGrantStore } from "./grant-store";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "houston-grant-store-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const AGENT = "Work/Assistant";
function fileFor(): string {
  const dir = join(root, "Work", "Assistant", ".houston");
  mkdirSync(dir, { recursive: true });
  return join(dir, "integration-grants.json");
}

test("round-trips a v2 accounts record atomically", async () => {
  const store = new FileIntegrationGrantStore(root);
  const accounts = [
    { connectionId: "c1", toolkit: "gmail" },
    { connectionId: "c2", toolkit: "slack" },
  ];
  await store.put(AGENT, accounts);
  expect(await store.get(AGENT)).toEqual({ stored: true, accounts });
});

test("a missing file reads as no record", async () => {
  expect(await new FileIntegrationGrantStore(root).get(AGENT)).toEqual({
    stored: false,
  });
});

test("a legacy {toolkits} file reads as no-record but carries legacyToolkits", async () => {
  writeFileSync(fileFor(), JSON.stringify({ toolkits: ["gmail", "slack"] }));
  expect(await new FileIntegrationGrantStore(root).get(AGENT)).toEqual({
    stored: false,
    legacyToolkits: ["gmail", "slack"],
  });
});

test("a corrupt or unrecognized file reads as no record (never a crash)", async () => {
  writeFileSync(fileFor(), "{not json");
  expect(await new FileIntegrationGrantStore(root).get(AGENT)).toEqual({
    stored: false,
  });
  writeFileSync(
    fileFor(),
    JSON.stringify({ accounts: [{ toolkit: "gmail" }] }),
  );
  expect(await new FileIntegrationGrantStore(root).get(AGENT)).toEqual({
    stored: false,
  });
});

test("a bad agent id is rejected on write and reads as no record", async () => {
  const store = new FileIntegrationGrantStore(root);
  await expect(store.put("../evil", [])).rejects.toThrow(/invalid agent id/);
  expect(await store.get("no-slash")).toEqual({ stored: false });
});
