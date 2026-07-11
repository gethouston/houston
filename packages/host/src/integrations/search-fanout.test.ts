import { expect, test } from "vitest";
import type { IntegrationProvider } from "./provider";
import { IntegrationRegistry } from "./registry";
import { searchAllProviders } from "./search-fanout";
import { IntegrationSigninRequiredError, type ToolMatch } from "./types";

/** A provider stub where only `id` + `search` matter for the fan-out. */
function searcher(
  id: string,
  search: () => Promise<ToolMatch[]>,
): IntegrationProvider {
  const unused = () => Promise.reject(new Error("not under test"));
  return {
    id,
    readiness: () => Promise.resolve({ ready: true }),
    listToolkits: unused,
    listConnections: unused,
    connect: unused,
    connection: unused,
    disconnect: unused,
    search,
    execute: unused,
  };
}

const match = (action: string, toolkit: string): ToolMatch => ({
  action,
  toolkit,
  description: "d",
});

test("fan-out merges every provider's results, stamped with its provider id", async () => {
  const registry = new IntegrationRegistry([
    searcher("composio", async () => [match("GMAIL_SEND_EMAIL", "gmail")]),
    searcher("composio-apps", async () => [
      match("COMPOSIO_SEARCH_TOOLS", "composio-apps"),
    ]),
  ]);
  const items = await searchAllProviders(registry, "u1", "email", undefined);
  expect(items.map((i) => [i.action, i.provider])).toEqual([
    ["GMAIL_SEND_EMAIL", "composio"],
    ["COMPOSIO_SEARCH_TOOLS", "composio-apps"],
  ]);
});

test("one provider's failure drops its results but keeps the others'", async () => {
  const registry = new IntegrationRegistry([
    searcher("composio", async () => {
      throw new Error("upstream down");
    }),
    searcher("composio-apps", async () => [
      match("COMPOSIO_SEARCH_TOOLS", "composio-apps"),
    ]),
  ]);
  const items = await searchAllProviders(registry, "u1", "q", undefined);
  expect(items.map((i) => i.provider)).toEqual(["composio-apps"]);
});

test("empty merged results + a signin failure propagate the signin error", async () => {
  const registry = new IntegrationRegistry([
    searcher("composio", async () => {
      throw new IntegrationSigninRequiredError();
    }),
    searcher("composio-apps", async () => []),
  ]);
  await expect(
    searchAllProviders(registry, "u1", "q", undefined),
  ).rejects.toBeInstanceOf(IntegrationSigninRequiredError);
});

test("signin failure is swallowed when another provider has results", async () => {
  const registry = new IntegrationRegistry([
    searcher("composio", async () => {
      throw new IntegrationSigninRequiredError();
    }),
    searcher("composio-apps", async () => [
      match("COMPOSIO_SEARCH_TOOLS", "composio-apps"),
    ]),
  ]);
  const items = await searchAllProviders(registry, "u1", "q", undefined);
  expect(items).toHaveLength(1);
});

test("all providers failing propagates the first error", async () => {
  const registry = new IntegrationRegistry([
    searcher("composio", async () => {
      throw new Error("boom-1");
    }),
    searcher("composio-apps", async () => {
      throw new Error("boom-2");
    }),
  ]);
  await expect(
    searchAllProviders(registry, "u1", "q", undefined),
  ).rejects.toThrow("boom-1");
});
