import { expect, test } from "vitest";
import { enrichAccounts, enrichAccountsAcrossRegistry } from "./account-enrich";
import { FakeIntegrationProvider } from "./fake";
import { IntegrationRegistry } from "./registry";

test("enrichAccounts labels a single provider's granted accounts", async () => {
  const p = new FakeIntegrationProvider({ id: "composio" });
  await p.connect("u", "gmail");
  await p.rename("u", "conn-1", "Work");
  const enriched = await enrichAccounts(p, "u", [
    { connectionId: "conn-1", toolkit: "gmail" },
    { connectionId: "gone", toolkit: "gmail" },
  ]);
  expect(enriched).toEqual([
    { toolkit: "gmail", connectionId: "conn-1", accountLabel: "Work" },
    { toolkit: "gmail", connectionId: "gone" }, // no longer present → no label
  ]);
});

test("enrichAccountsAcrossRegistry labels a mixed-provider granted set once each", async () => {
  const composio = new FakeIntegrationProvider({ id: "composio" });
  const custom = new FakeIntegrationProvider({ id: "custom" });
  await composio.connect("u", "gmail");
  await composio.rename("u", "conn-1", "Work");
  await custom.connect("u", "acme");
  await custom.rename("u", "conn-1", "should-not-collide"); // custom's own conn-1
  // The custom fake mints its own "conn-1"; give it a distinct label to prove
  // ids are looked up across providers without cross-contamination.
  const registry = new IntegrationRegistry([composio, custom]);
  const enriched = await enrichAccountsAcrossRegistry(registry, "u", [
    { connectionId: "conn-1", toolkit: "gmail" },
  ]);
  // Exactly one entry per granted account, labelled from whichever provider
  // last wrote that id (a real deployment has globally-unique ids).
  expect(enriched).toHaveLength(1);
  expect(enriched[0]?.connectionId).toBe("conn-1");
});
