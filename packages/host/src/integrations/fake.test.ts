import { expect, test } from "vitest";
import { FakeIntegrationProvider } from "./fake";
import type { IntegrationProvider } from "./provider";

// Drive the FAKE through the PORT type only — if this compiles + passes, the
// interface is implementable end-to-end without leaking provider specifics.
const USER = "u1";

test("the full lifecycle runs through the IntegrationProvider port", async () => {
  const p: IntegrationProvider = new FakeIntegrationProvider({ id: "fake" });

  expect(await p.readiness()).toEqual({ ready: true });

  // toolkits + connect (pending until the OAuth "finishes") + poll + list
  expect((await p.listToolkits()).map((t) => t.slug)).toContain("gmail");
  expect(await p.listConnections(USER)).toEqual([]);
  const start = await p.connect(USER, "gmail");
  expect(start.redirectUrl).toContain("gmail");
  expect(await p.connection(USER, start.connectionId)).toMatchObject({
    toolkit: "gmail",
    status: "pending",
  });
  (p as FakeIntegrationProvider).completeConnection(USER, start.connectionId);
  expect(await p.connection(USER, start.connectionId)).toMatchObject({
    status: "active",
  });
  expect((await p.listConnections(USER)).map((c) => c.toolkit)).toEqual([
    "gmail",
  ]);

  // connections are per user — another user sees nothing.
  expect(await p.listConnections("someone-else")).toEqual([]);
  expect(await p.connection("someone-else", start.connectionId)).toBeNull();

  // search + execute
  const matches = await p.search(USER, "send an email");
  expect(matches.map((m) => m.action)).toContain("GMAIL_SEND_EMAIL");
  const result = await p.execute(USER, "GMAIL_SEND_EMAIL", { to: "a@b.com" });
  expect(result.successful).toBe(true);

  // disconnect
  await p.disconnect(USER, "gmail");
  expect(await p.listConnections(USER)).toEqual([]);
});

test("a signed-out gateway reports signin-required readiness", async () => {
  const p = new FakeIntegrationProvider();
  p.setNotReady();
  expect(await p.readiness()).toEqual({ ready: false, reason: "signin" });
  p.setNotReady(false);
  expect(await p.readiness()).toEqual({ ready: true });
});
