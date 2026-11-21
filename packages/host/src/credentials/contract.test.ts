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

test("FileCredentialStore reads a pre-scope file and keeps the team record shape", async () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "houston-cred-legacy-")),
    "creds.json",
  );
  const legacy = cred({ accountId: "acct-legacy" });
  writeFileSync(path, JSON.stringify([legacy], null, 2));

  const store = new FileCredentialStore(path);
  expect(await store.get("ws_1", "openai-codex")).toEqual(legacy);

  await store.put(cred({ accessToken: "rotated" }));
  const onDisk = JSON.parse(readFileSync(path, "utf8")) as unknown[];
  expect(onDisk).toHaveLength(1);
  expect(Object.hasOwn(onDisk[0] as object, "scopeKey")).toBe(false);
});

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
