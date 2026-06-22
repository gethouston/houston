import { expect, test } from "bun:test";
import { FakeIntegrationProvider } from "./fake";
import type { IntegrationProvider } from "./provider";
import type { ProviderCredential } from "./types";

// Drive the FAKE through the PORT type only — if this compiles + passes, the
// interface is implementable end-to-end without leaking provider specifics.
const cred: ProviderCredential = {
  provider: "fake",
  data: { user: "u1", apiKey: "k1" },
};

test("the full lifecycle runs through the IntegrationProvider port", async () => {
  const p: IntegrationProvider = new FakeIntegrationProvider({ id: "fake" });

  // login: pending until completed, then yields a credential.
  const start = await p.startLogin();
  expect(start.loginUrl).toContain(start.pollKey);
  expect(await p.pollLogin(start.pollKey)).toEqual({ status: "pending" });
  (p as FakeIntegrationProvider).completeLogin(start.pollKey, cred);
  expect(await p.pollLogin(start.pollKey)).toEqual({
    status: "linked",
    credential: cred,
  });

  // verify
  expect(await p.verifyCredential(cred)).toEqual({ accountId: "u1" });

  // toolkits + connect + list
  expect((await p.listToolkits(cred)).map((t) => t.slug)).toContain("gmail");
  expect(await p.listConnections(cred)).toEqual([]);
  const conn = await p.connect(cred, "gmail");
  expect(conn.redirectUrl).toContain("gmail");
  expect((await p.listConnections(cred)).map((c) => c.toolkit)).toEqual([
    "gmail",
  ]);

  // search + execute
  const matches = await p.search(cred, "send an email");
  expect(matches.map((m) => m.action)).toContain("GMAIL_SEND_EMAIL");
  const result = await p.execute(cred, "GMAIL_SEND_EMAIL", { to: "a@b.com" });
  expect(result.successful).toBe(true);

  // disconnect
  await p.disconnect(cred, "gmail");
  expect(await p.listConnections(cred)).toEqual([]);
});

test("an invalidated credential fails verification", async () => {
  const p = new FakeIntegrationProvider();
  expect(await p.verifyCredential(cred)).not.toBeNull();
  p.invalidate("k1");
  expect(await p.verifyCredential(cred)).toBeNull();
});
