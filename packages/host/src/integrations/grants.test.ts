import { expect, test } from "vitest";
import type {
  GrantAccount,
  GrantRecord,
  IntegrationGrantStore,
} from "./grant-store";
import { MemoryIntegrationGrantStore } from "./grant-store";
import { LocalIntegrationGrants } from "./grants";
import type { ActingContext, IntegrationProvider } from "./provider";
import { IntegrationRegistry } from "./registry";
import type {
  ActionResult,
  Connection,
  ProviderReadiness,
  SearchResult,
} from "./types";

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
  async rename() {}
  async search(
    _userId: string,
    _query: string,
    _acting?: ActingContext,
  ): Promise<SearchResult> {
    return { items: [] };
  }
  async execute(): Promise<ActionResult> {
    return { successful: true };
  }
}

/** A store that hands back a fixed record (for the legacy-upgrade path). */
class FixedStore implements IntegrationGrantStore {
  saved: GrantAccount[] | null = null;
  constructor(private readonly record: GrantRecord) {}
  async get(): Promise<GrantRecord> {
    return this.saved ? { stored: true, accounts: this.saved } : this.record;
  }
  async put(_agentId: string, accounts: GrantAccount[]): Promise<void> {
    this.saved = accounts;
  }
}

test("concurrent first-reads materialize + persist exactly once (accounts)", async () => {
  const provider = new CountingProvider([
    { toolkit: "gmail", connectionId: "c1", status: "active" },
    // A second gmail account + an errored slack are both materialized; the
    // pending github is excluded.
    { toolkit: "gmail", connectionId: "c2", status: "error" },
    { toolkit: "github", connectionId: "c3", status: "pending" },
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

  const expected: GrantAccount[] = [
    { connectionId: "c1", toolkit: "gmail" },
    { connectionId: "c2", toolkit: "gmail" },
  ];
  expect(ra).toEqual(expected);
  expect(rb).toEqual(expected);
  expect(provider.listCalls).toBe(1); // guarded — not double-materialized
  expect(await store.get("W/A")).toEqual({ stored: true, accounts: expected });
});

test("provider not ready → read returns [] WITHOUT persisting", async () => {
  const provider = new CountingProvider([
    { toolkit: "gmail", connectionId: "c1", status: "active" },
  ]);
  provider.ready = false;
  provider.open();
  const store = new MemoryIntegrationGrantStore();
  const grants = new LocalIntegrationGrants({
    store,
    registry: new IntegrationRegistry([provider]),
  });
  expect(await grants.read("W/A", "alice")).toEqual([]);
  expect(await store.get("W/A")).toEqual({ stored: false });
});

test("a legacy {toolkits} record materializes only those toolkits' accounts, then persists", async () => {
  const provider = new CountingProvider([
    { toolkit: "gmail", connectionId: "c1", status: "active" },
    { toolkit: "slack", connectionId: "c2", status: "active" },
    { toolkit: "notion", connectionId: "c3", status: "error" },
  ]);
  provider.open();
  // Legacy granted gmail + notion (NOT slack).
  const store = new FixedStore({
    stored: false,
    legacyToolkits: ["gmail", "notion"],
  });
  const grants = new LocalIntegrationGrants({
    store,
    registry: new IntegrationRegistry([provider]),
  });
  const read = await grants.read("W/A", "alice");
  expect(read).toEqual([
    { connectionId: "c1", toolkit: "gmail" },
    { connectionId: "c3", toolkit: "notion" },
  ]);
  // Upgrade persisted → the record is now a v2 accounts record.
  expect(store.saved).toEqual(read);
});

test("grantedOrNull: null with no record; stored accounts once written", async () => {
  const store = new MemoryIntegrationGrantStore();
  const grants = new LocalIntegrationGrants({
    store,
    registry: new IntegrationRegistry([new CountingProvider([])]),
  });
  expect(await grants.grantedOrNull("W/A", "alice")).toBeNull();

  const accounts: GrantAccount[] = [{ connectionId: "c1", toolkit: "gmail" }];
  await grants.replace("W/A", accounts);
  expect(await grants.grantedOrNull("W/A", "alice")).toEqual(accounts);
});

test("grantedOrNull ENFORCES a legacy {toolkits} file (no fail-open) + upgrades it once", async () => {
  // A v1 restrictive file granted gmail only, while slack is also connected for
  // other agents. Enforcement must materialize the gmail-only account set — NOT
  // return null (which the sandbox reads as "no filtering", escalating access).
  const provider = new CountingProvider([
    { toolkit: "gmail", connectionId: "c1", status: "active" },
    { toolkit: "slack", connectionId: "c2", status: "active" },
  ]);
  provider.open();
  const store = new FixedStore({ stored: false, legacyToolkits: ["gmail"] });
  const legacy = new LocalIntegrationGrants({
    store,
    registry: new IntegrationRegistry([provider]),
  });
  const expected: GrantAccount[] = [{ connectionId: "c1", toolkit: "gmail" }];
  expect(await legacy.grantedOrNull("W/A", "alice")).toEqual(expected);
  // One-time upgrade persisted the restricted set as a v2 accounts record.
  expect(store.saved).toEqual(expected);
});
