import { expect, test, vi } from "vitest";
import { CustomExecutorHost } from "./executor-host";
import { CustomIntegrationManager } from "./manager";
import { MemoryCustomSecretStore } from "./secrets";
import { MemoryCustomIntegrationStore } from "./store";
import type { CustomIntegrationDef } from "./types";
import { viewOf } from "./views";

const def: CustomIntegrationDef = {
  kind: "mcp",
  slug: "supabase-mcp",
  name: "Supabase MCP",
  endpoint: "https://project.supabase.co/functions/v1/mcp",
  auth: "oauth",
  addedAtMs: 42,
  credential: { template: "header", secretIds: { token: "saved-token" } },
};
async function setup() {
  const store = new MemoryCustomIntegrationStore();
  const secrets = new MemoryCustomSecretStore();
  await store.put(def);
  await secrets.set("saved-token", "oauth-bundle");
  const host = new CustomExecutorHost(secrets, () => store.list());
  const ensure = vi.spyOn(host, "ensure");
  const changed = vi.fn();
  return {
    store,
    secrets,
    ensure,
    changed,
    manager: new CustomIntegrationManager(store, secrets, host, changed),
  };
}

test("rename preserves the OAuth identity and does not touch the executor", async () => {
  const { manager, store, secrets, ensure, changed } = await setup();
  await manager.updateDetails(def.slug, {
    name: " Spark ",
    website: "https://spark.studioroda.co",
  });
  const [updated] = await store.list();
  if (!updated) throw new Error("edited definition missing");
  expect(updated).toEqual({
    ...def,
    name: "Spark",
    website: "https://spark.studioroda.co/",
  });
  expect(await secrets.get("saved-token")).toBe("oauth-bundle");
  expect(ensure).not.toHaveBeenCalled();
  expect(changed).toHaveBeenCalledOnce();
  expect(viewOf(updated, { status: "active", toolCount: 2 }, [])).toMatchObject(
    {
      name: "Spark",
      website: "https://spark.studioroda.co/",
      iconUrl: "https://spark.studioroda.co/favicon.ico",
    },
  );
  await manager.updateDetails(def.slug, { name: "Spark", website: "" });
  expect((await store.list())[0]?.website).toBeUndefined();
});

test.each([
  { name: " ", website: "" },
  { name: "x".repeat(121), website: "" },
  { name: "Spark", website: "javascript:alert(1)" },
  { name: "Spark", website: "https://user:password@example.com" },
  { name: "Spark", website: "spark.studioroda.co" },
  { name: "Spark", website: "", endpoint: "https://other.example.com" },
  { name: "Spark", website: "", slug: "new-id" },
])("invalid details never change the stored connection: %j", async (input) => {
  const { manager, store, changed } = await setup();
  await expect(manager.updateDetails(def.slug, input)).rejects.toMatchObject({
    code: "invalid_details",
  });
  expect(await store.list()).toEqual([def]);
  expect(changed).not.toHaveBeenCalled();
});

test("a removed integration cannot be resurrected by an edit", async () => {
  const { manager, store } = await setup();
  await store.remove(def.slug);
  await expect(
    manager.updateDetails(def.slug, { name: "Spark", website: "" }),
  ).rejects.toMatchObject({ code: "not_found" });
  expect(await store.list()).toEqual([]);
});
