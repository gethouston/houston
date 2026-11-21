import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type {
  CustomIntegrationView,
  IntegrationConnection,
} from "@houston/wire-types";
import { QueryClient } from "@tanstack/react-query";
import {
  connectionsWithout,
  customEditPatches,
  customRemovalPatches,
  customWithDetails,
  customWithout,
} from "../src/lib/integration-cache-patches.ts";
import { runOptimisticWrite } from "../src/lib/optimistic-core.ts";
import { queryKeys } from "../src/lib/query-keys.ts";

const conn = (
  toolkit: string,
  connectionId: string,
): IntegrationConnection => ({
  toolkit,
  connectionId,
  status: "active",
});
const custom = (slug: string, website?: string): CustomIntegrationView => ({
  slug,
  name: slug.toUpperCase(),
  kind: "mcp",
  addedAtMs: 1,
  state: "active",
  ...(website ? { website } : {}),
});

describe("integration cache patches", () => {
  it("a named disconnect drops one account; an unnamed one drops the app", () => {
    const rows = [conn("gmail", "a"), conn("gmail", "b"), conn("slack", "c")];
    deepStrictEqual(
      connectionsWithout(rows, "gmail", "a")?.map((c) => c.connectionId),
      ["b", "c"],
    );
    deepStrictEqual(
      connectionsWithout(rows, "gmail")?.map((c) => c.connectionId),
      ["c"],
    );
    strictEqual(connectionsWithout(rows, "drive"), rows);
    strictEqual(connectionsWithout(undefined, "gmail"), undefined);
  });

  it("removing a custom integration keeps an unsupported list null", () => {
    const list = [custom("acme"), custom("beta")];
    deepStrictEqual(
      customWithout(list, "acme")?.map((i) => i.slug),
      ["beta"],
    );
    strictEqual(customWithout(list, "nope"), list);
    strictEqual(customWithout(null, "acme"), null);
    strictEqual(customWithout(undefined, "acme"), undefined);
  });

  it("an edit renames, and an empty website clears it like the host", () => {
    const list = [custom("acme", "https://acme.co/")];
    const renamed = customWithDetails(list, "acme", {
      name: "Acme CRM",
      website: "",
    });
    strictEqual(renamed?.[0]?.name, "Acme CRM");
    strictEqual(renamed?.[0] && "website" in renamed[0], false);
    strictEqual(
      customWithDetails(renamed, "acme", { name: "Acme CRM", website: "" }),
      renamed,
    );
    strictEqual(
      customWithDetails(list, "acme", {
        name: "Acme CRM",
        website: "https://crm.acme.co/",
      })?.[0]?.website,
      "https://crm.acme.co/",
    );
  });

  it("on a shared host a removal paints every list (top-level, per agent, connections) at once", async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.customIntegrations(), [custom("acme")]);
    qc.setQueryData(queryKeys.agentCustomIntegrations("ag1"), [custom("acme")]);
    qc.setQueryData(queryKeys.integrationConnections("custom"), [
      conn("acme", "acme"),
    ]);
    let release!: () => void;
    const done = runOptimisticWrite(
      {
        qc,
        command: "custom_integration_remove",
        patches: customRemovalPatches("acme", {
          scope: "host",
          agentId: "ag1",
        }),
        write: () => new Promise<void>((resolve) => (release = resolve)),
        failure: { title: "t", description: "d" },
      },
      () => undefined,
    );
    deepStrictEqual(qc.getQueryData(queryKeys.customIntegrations()), []);
    deepStrictEqual(
      qc.getQueryData(queryKeys.agentCustomIntegrations("ag1")),
      [],
    );
    deepStrictEqual(
      qc.getQueryData(queryKeys.integrationConnections("custom")),
      [],
    );
    release();
    await done;
  });

  it("a refused edit puts the old name back", async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.agentCustomIntegrations("ag1"), [custom("acme")]);
    const refused: string[] = [];
    const done = runOptimisticWrite(
      {
        qc,
        command: "custom_integration_update_details",
        patches: customEditPatches(
          "acme",
          { name: "New", website: "" },
          { scope: "agent", agentId: "ag1" },
        ),
        write: () => Promise.reject(new Error("invalid_details")),
        failure: { title: "t", description: "d" },
      },
      (command) => refused.push(command),
    );
    strictEqual(
      qc.getQueryData<CustomIntegrationView[]>(
        queryKeys.agentCustomIntegrations("ag1"),
      )?.[0]?.name,
      "New",
    );
    await done;
    strictEqual(
      qc.getQueryData<CustomIntegrationView[]>(
        queryKeys.agentCustomIntegrations("ag1"),
      )?.[0]?.name,
      "ACME",
    );
    deepStrictEqual(refused, ["custom_integration_update_details"]);
  });

  it("on a per-agent deployment a removal paints only that agent's list", async () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.customIntegrations(), [custom("acme")]);
    qc.setQueryData(queryKeys.agentCustomIntegrations("ag1"), [custom("acme")]);
    qc.setQueryData(queryKeys.agentCustomIntegrations("ag2"), [custom("acme")]);
    const rows = [conn("acme", "acme")];
    qc.setQueryData(queryKeys.integrationConnections("custom"), rows);
    let release!: () => void;
    const done = runOptimisticWrite(
      {
        qc,
        command: "custom_integration_remove",
        patches: customRemovalPatches("acme", {
          scope: "agent",
          agentId: "ag1",
        }),
        write: () => new Promise<void>((resolve) => (release = resolve)),
        failure: { title: "t", description: "d" },
      },
      () => undefined,
    );
    deepStrictEqual(
      qc.getQueryData(queryKeys.agentCustomIntegrations("ag1")),
      [],
    );
    deepStrictEqual(
      qc
        .getQueryData<CustomIntegrationView[]>(
          queryKeys.agentCustomIntegrations("ag2"),
        )
        ?.map((i) => i.slug),
      ["acme"],
    );
    strictEqual(
      qc.getQueryData(queryKeys.integrationConnections("custom")),
      rows,
    );
    release();
    await done;
  });

  it("on a per-agent deployment an edit renames only that agent's copy", () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.agentCustomIntegrations("ag1"), [custom("acme")]);
    qc.setQueryData(queryKeys.agentCustomIntegrations("ag2"), [custom("acme")]);
    for (const patch of customEditPatches(
      "acme",
      { name: "New", website: "" },
      { scope: "agent", agentId: "ag1" },
    ))
      qc.setQueriesData({ queryKey: patch.queryKey }, patch.apply);
    const name = (agentId: string) =>
      qc.getQueryData<CustomIntegrationView[]>(
        queryKeys.agentCustomIntegrations(agentId),
      )?.[0]?.name;
    strictEqual(name("ag1"), "New");
    strictEqual(name("ag2"), "ACME");
  });

  it("a per-agent deployment with no agent named paints nothing", () => {
    deepStrictEqual(customRemovalPatches("acme", { scope: "agent" }), []);
    deepStrictEqual(
      customEditPatches("acme", { name: "N", website: "" }, { scope: "agent" }),
      [],
    );
  });
});
