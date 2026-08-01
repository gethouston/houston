import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  cred,
  runCredentialStoreContract,
} from "../testing/credential-contract";
import { FileCredentialStore } from "./file-store";
import { MemoryCredentialStore } from "./store";

/**
 * The OPEN CredentialStore adapters (Memory + File) run through the shared
 * contract (../testing/credential-contract.ts → runCredentialStoreContract).
 * The closed PgCredentialStore, which ran the SAME contract over pg-mem, was
 * retired with `@houston/host-cloud` (git history) — the contract stays open as
 * the behavioral bar for any out-of-repo adapter.
 */

runCredentialStoreContract(
  "MemoryCredentialStore",
  () => new MemoryCredentialStore(),
);
runCredentialStoreContract(
  "FileCredentialStore",
  () =>
    new FileCredentialStore(
      join(mkdtempSync(join(tmpdir(), "houston-cred-contract-")), "creds.json"),
    ),
);

// FileCredentialStore-specific behavior beyond the shared contract: a connect
// survives an app restart because the JSON file is the source of truth. Asserted
// here (not in the contract) since MemoryCredentialStore intentionally does NOT
// persist.
test("FileCredentialStore persists across re-open (a login survives a restart)", async () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "houston-cred-persist-")),
    "creds.json",
  );
  const first = new FileCredentialStore(path);
  await first.put(cred({ accountId: "acct-9" }));

  const reopened = new FileCredentialStore(path);
  expect((await reopened.get("ws_1", "openai-codex"))?.accountId).toBe(
    "acct-9",
  );
});

test("FileCredentialStore enforces owner-only permissions", async () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "houston-cred-mode-")),
    "creds.json",
  );
  const store = new FileCredentialStore(path);
  await store.put(cred());
  expect(statSync(path).mode & 0o777).toBe(0o600);
});

/**
 * The on-disk guarantee that makes the HOU-976 scope key safe to ship without a
 * migration: a credentials.json written by a PRE-scope build still loads (its
 * records carry no `scopeKey`, which reads as the team's), and a desktop that
 * never sees an acting identity keeps writing the exact historical record shape.
 * A regression here silently signs every existing desktop user out.
 */
test("FileCredentialStore reads a pre-scope file and keeps the team record shape", async () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "houston-cred-legacy-")),
    "creds.json",
  );
  // Exactly what an older build persisted: an array of bare credentials.
  const legacy = cred({ accountId: "acct-legacy" });
  writeFileSync(path, JSON.stringify([legacy], null, 2));

  const store = new FileCredentialStore(path);
  expect(await store.get("ws_1", "openai-codex")).toEqual(legacy);

  // A team write re-persists the SAME shape — no scopeKey key appears.
  await store.put(cred({ accessToken: "rotated" }));
  const onDisk = JSON.parse(readFileSync(path, "utf8")) as unknown[];
  expect(onDisk).toHaveLength(1);
  expect(Object.hasOwn(onDisk[0] as object, "scopeKey")).toBe(false);
});

/** A member's row round-trips across a restart, keyed to that member alone. */
test("FileCredentialStore persists a member's row separately from the team's", async () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "houston-cred-scope-")),
    "creds.json",
  );
  const acting = {
    actingAs: `acting-v1.${Buffer.from(
      JSON.stringify({ sub: "sub-alice" }),
    ).toString("base64url")}.sig`,
  };
  const first = new FileCredentialStore(path);
  await first.put(cred({ accessToken: "team-tok" }));
  await first.put(cred({ accessToken: "alice-tok" }), acting);

  const reopened = new FileCredentialStore(path);
  expect((await reopened.get("ws_1", "openai-codex"))?.accessToken).toBe(
    "team-tok",
  );
  expect(
    (await reopened.get("ws_1", "openai-codex", acting))?.accessToken,
  ).toBe("alice-tok");
});
