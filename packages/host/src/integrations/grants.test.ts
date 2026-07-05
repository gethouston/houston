import { expect, test } from "vitest";
import { MemoryIntegrationGrantStore } from "./grant-store";
import {
  actionInToolkit,
  filterMatchesToGranted,
  isActionGranted,
  LocalIntegrationGrants,
  normalizeToolkits,
} from "./grants";
import type { IntegrationProvider } from "./provider";
import { IntegrationRegistry } from "./registry";
import type { Connection, ProviderReadiness, ToolMatch } from "./types";

/** A provider that counts listConnections calls and can gate them behind a
 *  manually-resolved barrier, to prove concurrent first-reads materialize once. */
class CountingProvider implements IntegrationProvider {
  readonly id = "composio";
  listCalls = 0;
  ready = true;
  private release?: () => void;
  readonly gate = new Promise<void>((r) => {
    this.release = r;
  });
  constructor(private readonly conns: Connection[]) {}
  open(): void {
    this.release?.();
  }
  async readiness(): Promise<ProviderReadiness> {
    return this.ready ? { ready: true } : { ready: false, reason: "signin" };
  }
  async listConnections(): Promise<Connection[]> {
    this.listCalls++;
    await this.gate;
    return this.conns;
  }
  async listToolkits() {
    return [];
  }
  async connect(): Promise<{ redirectUrl: string; connectionId: string }> {
    throw new Error("unused");
  }
  async connection() {
    return null;
  }
  async disconnect() {}
  async search(): Promise<ToolMatch[]> {
    return [];
  }
  async execute() {
    return { successful: true };
  }
}

test("actionInToolkit matches the full slug prefix (single- and multi-word)", () => {
  expect(actionInToolkit("GMAIL_SEND_EMAIL", "gmail")).toBe(true);
  expect(actionInToolkit("SLACK_POST_MESSAGE", "slack")).toBe(true);
  // Multi-word slug: the action keeps the underscore, and the FULL slug matches.
  expect(actionInToolkit("GOOGLE_MAPS_GET_ROUTE", "google_maps")).toBe(true);
  // The buggy first-`_` prefix would have said `google`; it must NOT match here.
  expect(actionInToolkit("GOOGLE_MAPS_GET_ROUTE", "google")).toBe(true); // prefix-of, documented residual
  // A shorter slug must not swallow a different, longer toolkit's actions.
  expect(actionInToolkit("GMAIL_SEND", "gm")).toBe(false);
  expect(actionInToolkit("NOTELY_CREATE", "note")).toBe(false);
});

test("isActionGranted lets a granted multi-word toolkit execute (regression)", () => {
  // The confirmed break: a granted `google_maps` was 403'd on GOOGLE_MAPS_*.
  expect(isActionGranted("GOOGLE_MAPS_GET_ROUTE", ["google_maps"])).toBe(true);
  expect(isActionGranted("GOOGLE_MAPS_GEOCODE_ADDRESS", ["google_maps"])).toBe(
    true,
  );
  // A different multi-word toolkit is still refused.
  expect(isActionGranted("GOOGLE_DRIVE_UPLOAD", ["google_maps"])).toBe(false);
});

test("normalizeToolkits validates + dedupes; rejects non-slugs", () => {
  expect(normalizeToolkits(["gmail", "gmail", "slack"])).toEqual({
    ok: true,
    toolkits: ["gmail", "slack"],
  });
  expect(normalizeToolkits([]).ok).toBe(true);
  expect(normalizeToolkits("gmail").ok).toBe(false);
  expect(normalizeToolkits([1]).ok).toBe(false);
  expect(normalizeToolkits(["Bad Slug"]).ok).toBe(false);
});

test("filter + grant checks are case-insensitive on the toolkit", () => {
  const matches: ToolMatch[] = [
    { action: "GMAIL_SEND", toolkit: "Gmail", description: "" },
    { action: "SLACK_POST", toolkit: "slack", description: "" },
  ];
  expect(
    filterMatchesToGranted(matches, ["gmail"]).map((m) => m.action),
  ).toEqual(["GMAIL_SEND"]);
  expect(isActionGranted("GMAIL_SEND_EMAIL", ["GMAIL"])).toBe(true);
  expect(isActionGranted("SLACK_POST", ["gmail"])).toBe(false);
});

test("not-connected matches pass the grant filter (in-chat connect discovery)", () => {
  const matches: ToolMatch[] = [
    {
      action: "GMAIL_SEND",
      toolkit: "gmail",
      description: "",
      connected: true,
    },
    // Connected but ungranted → hidden from this agent.
    {
      action: "SLACK_POST",
      toolkit: "slack",
      description: "",
      connected: true,
    },
    // Not connected → can never be granted; must survive so the agent can
    // offer the connect card (HOU-670).
    {
      action: "NOTION_ADD",
      toolkit: "notion",
      description: "",
      connected: false,
    },
  ];
  expect(
    filterMatchesToGranted(matches, ["gmail"]).map((m) => m.action),
  ).toEqual(["GMAIL_SEND", "NOTION_ADD"]);
});

test("concurrent first-reads materialize + persist exactly once", async () => {
  const provider = new CountingProvider([
    { toolkit: "gmail", connectionId: "c1", status: "active" },
  ]);
  const store = new MemoryIntegrationGrantStore();
  const grants = new LocalIntegrationGrants({
    store,
    registry: new IntegrationRegistry([provider]),
  });

  const a = grants.read("W/A", "alice");
  const b = grants.read("W/A", "alice");
  provider.open();
  const [ra, rb] = await Promise.all([a, b]);

  expect(ra).toEqual(["gmail"]);
  expect(rb).toEqual(["gmail"]);
  expect(provider.listCalls).toBe(1); // guarded — not double-materialized
  expect(await store.get("W/A")).toEqual({ stored: true, toolkits: ["gmail"] });
});

test("grantedOrNull returns null when no record exists (backward-compat)", async () => {
  const store = new MemoryIntegrationGrantStore();
  const grants = new LocalIntegrationGrants({
    store,
    registry: new IntegrationRegistry([new CountingProvider([])]),
  });
  expect(await grants.grantedOrNull("W/A")).toBeNull();
  await grants.replace("W/A", ["gmail"]);
  expect(await grants.grantedOrNull("W/A")).toEqual(["gmail"]);
});
