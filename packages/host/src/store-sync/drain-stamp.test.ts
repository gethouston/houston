import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_EXCLUDES,
  excluded,
} from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { STORE_SYNC_EXCLUDES } from "./daemon-policy";
import {
  DRAIN_STAMP_FILE,
  drainStampPath,
  expireDrainStamp,
  parseDrainStamp,
  readDrainStampFile,
  writeDrainStamp,
} from "./drain-stamp";

function root() {
  return mkdtempSync(join(tmpdir(), "drain-stamp-"));
}

test("the stamp round-trips through the sync root", async () => {
  const rootDir = root();
  await writeDrainStamp(rootDir, { since: 1_000, until: 6_000 });
  expect(drainStampPath(rootDir)).toBe(join(rootDir, DRAIN_STAMP_FILE));
  expect(JSON.parse(readFileSync(drainStampPath(rootDir), "utf8"))).toEqual({
    since: 1_000,
    until: 6_000,
  });
  expect(await readDrainStampFile(drainStampPath(rootDir))).toEqual({
    since: 1_000,
    until: 6_000,
  });
  // Expiring keeps `since` and closes the window at `now`.
  await expireDrainStamp(rootDir, 9_000);
  expect(await readDrainStampFile(drainStampPath(rootDir))).toEqual({
    since: 1_000,
    until: 9_000,
  });
});

test("expiring with no stamp on disk writes a closed window", async () => {
  const rootDir = root();
  await expireDrainStamp(rootDir, 5_000);
  expect(await readDrainStampFile(drainStampPath(rootDir))).toEqual({
    since: 5_000,
    until: 5_000,
  });
});

test("a stamp that is not two finite numbers is not a stamp", async () => {
  expect(parseDrainStamp("not json")).toBeUndefined();
  expect(parseDrainStamp("null")).toBeUndefined();
  expect(parseDrainStamp('{"since":1}')).toBeUndefined();
  expect(parseDrainStamp('{"since":"1","until":"2"}')).toBeUndefined();
  expect(parseDrainStamp('{"since":1,"until":null}')).toBeUndefined();
  const rootDir = root();
  writeFileSync(drainStampPath(rootDir), "{ truncated", "utf8");
  expect(await readDrainStampFile(drainStampPath(rootDir))).toBeUndefined();
});

// The handshake only works if the object actually syncs: an excluded name
// would be written locally and never reach (or leave) the store.
test("the stamp name survives both exclude lists", () => {
  expect(excluded(DRAIN_STAMP_FILE, STORE_SYNC_EXCLUDES)).toBe(false);
  expect(excluded(DRAIN_STAMP_FILE, DEFAULT_EXCLUDES)).toBe(false);
});
