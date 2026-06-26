import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileIntegrationCredentialStore,
  type IntegrationCredentialStore,
  MemoryIntegrationCredentialStore,
} from "./credential-store";
import type { ProviderCredential } from "./types";

const cred = (apiKey: string): ProviderCredential => ({
  provider: "composio",
  data: { apiKey, userId: "consumer-1" },
});

function contract(name: string, make: () => IntegrationCredentialStore) {
  test(`${name}: get/put/remove, keyed per (user, provider)`, async () => {
    const s = make();
    expect(await s.get("u1", "composio")).toBeNull();

    await s.put("u1", cred("uak_1"));
    expect((await s.get("u1", "composio"))?.data.apiKey).toBe("uak_1");

    // Different users are isolated.
    expect(await s.get("u2", "composio")).toBeNull();
    await s.put("u2", cred("uak_2"));
    expect((await s.get("u2", "composio"))?.data.apiKey).toBe("uak_2");
    expect((await s.get("u1", "composio"))?.data.apiKey).toBe("uak_1");

    await s.remove("u1", "composio");
    expect(await s.get("u1", "composio")).toBeNull();
    expect((await s.get("u2", "composio"))?.data.apiKey).toBe("uak_2");
  });
}

contract(
  "MemoryIntegrationCredentialStore",
  () => new MemoryIntegrationCredentialStore(),
);
contract("FileIntegrationCredentialStore", () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "houston-int-cred-")),
    "integrations.json",
  );
  return new FileIntegrationCredentialStore(path);
});

test("FileIntegrationCredentialStore persists across a reload", async () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "houston-int-cred-")),
    "integrations.json",
  );
  const a = new FileIntegrationCredentialStore(path);
  await a.put("u1", cred("uak_persist"));

  // A fresh instance over the same file sees the stored credential.
  const b = new FileIntegrationCredentialStore(path);
  expect((await b.get("u1", "composio"))?.data.apiKey).toBe("uak_persist");
});
