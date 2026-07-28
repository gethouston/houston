import { deepStrictEqual, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  providerProbeReady,
  providerStatusesLoading,
  providerStatusesQueryKey,
} from "../src/lib/provider-statuses-query.ts";

/**
 * HOU-979 — the CHAT PICKER's status query must be as space-safe as the AI
 * hub's, which the HOU-906 space fix only reached.
 *
 * Symptom it closes: switching into a team space wiped the query cache, which
 * refired this query while the engine adapter still held the PREVIOUS space's
 * agents. The per-agent probe 404'd under the new org header, every provider
 * came back `unknown`, and the picker rendered no providers at all until the
 * next `ProviderLoginComplete`.
 */

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("the probe gate", () => {
  it("is closed until the agent list has settled at least once", () => {
    strictEqual(providerProbeReady({ loaded: false, loading: false }), false);
    strictEqual(providerProbeReady({ loaded: false, loading: true }), false);
  });

  it("is closed while a RE-load runs, which is the space-switch window", () => {
    // `loaded` stays true across a switch while `loadAgents` re-runs for the new
    // space. Gating on `loaded` alone would leave exactly the window the
    // misrouted probe fired in open.
    strictEqual(providerProbeReady({ loaded: true, loading: true }), false);
  });

  it("is open once the current space's agents are settled", () => {
    strictEqual(providerProbeReady({ loaded: true, loading: false }), true);
  });
});

describe("the query key", () => {
  it("separates spaces so one space never serves another's statuses", () => {
    const base = ["provider-statuses", "anthropic"];
    const personal = providerStatusesQueryKey({
      base,
      catalogUpdatedAt: 7,
      workspaceId: "personal",
    });
    const team = providerStatusesQueryKey({
      base,
      catalogUpdatedAt: 7,
      workspaceId: "org:00000000000000ab",
    });
    deepStrictEqual(personal, [
      "provider-statuses",
      "anthropic",
      7,
      "personal",
    ]);
    strictEqual(JSON.stringify(personal) === JSON.stringify(team), false);
  });

  it("still re-keys on the catalog hydration", () => {
    const base = ["provider-statuses"];
    const before = providerStatusesQueryKey({
      base,
      catalogUpdatedAt: 0,
      workspaceId: null,
    });
    const after = providerStatusesQueryKey({
      base,
      catalogUpdatedAt: 1,
      workspaceId: null,
    });
    strictEqual(JSON.stringify(before) === JSON.stringify(after), false);
  });
});

describe("the loading signal the picker reads", () => {
  it("reports checking while the gate is closed, not 'settled with nothing'", () => {
    // The trap: a DISABLED TanStack query is pending but not fetching, so
    // `isLoading` is false. Reading it raw would tell the picker statuses had
    // settled empty, which filters every provider out and paints the honest
    // "no providers connected" empty state at the exact moment we know nothing.
    strictEqual(
      providerStatusesLoading({
        hasData: false,
        queryIsLoading: false,
        probeReady: false,
      }),
      true,
    );
  });

  it("reports checking while the first fetch is in flight", () => {
    strictEqual(
      providerStatusesLoading({
        hasData: false,
        queryIsLoading: true,
        probeReady: true,
      }),
      true,
    );
  });

  it("stops checking once data has arrived, even mid-refetch", () => {
    strictEqual(
      providerStatusesLoading({
        hasData: true,
        queryIsLoading: true,
        probeReady: false,
      }),
      false,
    );
  });

  it("reports settled once the gate is open and the fetch resolved", () => {
    strictEqual(
      providerStatusesLoading({
        hasData: false,
        queryIsLoading: false,
        probeReady: true,
      }),
      false,
    );
  });
});

describe("the picker hook is actually wired to the gate", () => {
  const hook = read("../src/hooks/use-provider-statuses.ts");

  it("keys the query by the active workspace and gates the fetch", () => {
    strictEqual(hook.includes("providerStatusesQueryKey"), true);
    strictEqual(hook.includes("useWorkspaceStore"), true);
    strictEqual(hook.includes("providerProbeReady"), true);
    strictEqual(hook.includes("enabled: probeReady"), true);
    strictEqual(hook.includes("providerStatusesLoading"), true);
  });

  it("reads the SAME agent-store signals the AI hub's sibling hook gates on", () => {
    const hub = read(
      "../src/hooks/provider-connections/use-provider-statuses.ts",
    );
    for (const signal of ["s.loaded", "s.loading"]) {
      strictEqual(hook.includes(signal), true, `picker reads ${signal}`);
      strictEqual(hub.includes(signal), true, `hub reads ${signal}`);
    }
  });
});
