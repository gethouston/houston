import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  openWarmingReads,
  type ProvisioningEntry,
  warmingIsCreation,
  warmingReadsAnswerEmpty,
} from "../src/lib/agent-provisioning/entry.ts";
import { completeWarmupHandoff } from "../src/lib/agent-provisioning/handoff.ts";

const REAL_CONFIG = '{"firstDay":"pending"}';

/**
 * A just-created agent mid-handoff, wired the way the app wires it: the entry
 * lives in a store until `clear`, and a read answers the `""` placeholder
 * while a stored entry says reads answer empty (`lib/tauri.ts` readFile).
 */
function harness() {
  const entry: ProvisioningEntry = {
    agentId: "a1",
    agentPath: "/w/a1",
    since: 0,
    reason: "create",
  };
  const store = new Map([[entry.agentId, entry]]);
  const readConfig = () => {
    const current = store.get(entry.agentId);
    return current && warmingReadsAnswerEmpty(current) ? "" : REAL_CONFIG;
  };
  const cache = new Map<string, unknown>();
  const log: string[] = [];
  const deps = {
    flush: async () => {
      log.push("flush");
    },
    refetch: async (key: readonly unknown[]) => {
      if (key[0] !== "config") return;
      const raw = readConfig();
      log.push(`refetch config while marked=${store.has(entry.agentId)}`);
      cache.set(key.join(":"), raw ? JSON.parse(raw) : {});
    },
    clear: () => {
      log.push("clear");
      store.delete(entry.agentId);
    },
  };
  return { entry, store, cache, log, deps };
}

describe("completeWarmupHandoff (first-day offer after a warm-up)", () => {
  it("re-reads the config from the engine, not the creating placeholder", async () => {
    const { entry, cache, deps } = harness();
    await completeWarmupHandoff(entry, deps);
    deepStrictEqual(cache.get("config:/w/a1"), { firstDay: "pending" });
  });

  it("keeps the entry (and its optimistic rows) until the refetch landed", async () => {
    const { entry, log, deps } = harness();
    await completeWarmupHandoff(entry, deps);
    deepStrictEqual(log, [
      "flush",
      "refetch config while marked=true",
      "clear",
    ]);
  });

  it("keeps reads on the placeholder while the queued sends flush", async () => {
    const { entry, deps } = harness();
    let readsEmptyDuringFlush: boolean | undefined;
    await completeWarmupHandoff(entry, {
      ...deps,
      flush: async (e) => {
        readsEmptyDuringFlush = warmingReadsAnswerEmpty(e);
      },
    });
    strictEqual(readsEmptyDuringFlush, true);
  });

  it("still clears the entry when the flush fails", async () => {
    const { entry, store, deps } = harness();
    await rejects(
      completeWarmupHandoff(entry, {
        ...deps,
        flush: () => Promise.reject(new Error("boom")),
      }),
      /boom/,
    );
    strictEqual(store.size, 0);
  });
});

describe("openWarmingReads", () => {
  it("sends reads to the engine while the entry still counts as a creation", () => {
    const entry: ProvisioningEntry = {
      agentId: "a1",
      agentPath: "/w/a1",
      since: 0,
      reason: "create",
    };
    openWarmingReads(entry);
    strictEqual(warmingReadsAnswerEmpty(entry), false);
    // The first-day placement keeps holding until the entry clears.
    strictEqual(warmingIsCreation(entry), true);
  });

  it("opens only the entry it was given: a re-mark starts on the placeholder", () => {
    const entry: ProvisioningEntry = {
      agentId: "a1",
      agentPath: "/w/a1",
      since: 0,
    };
    openWarmingReads(entry);
    strictEqual(warmingReadsAnswerEmpty({ ...entry }), true);
  });
});
