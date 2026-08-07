import { deepStrictEqual, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { providerConnectionState } from "../src/lib/provider-connection.ts";
import {
  classifyStatusScan,
  PROVIDER_STATUS_REPROBE_MS,
  providerProbeReady,
  providerStatusesLoading,
  providerStatusesQueryKey,
  providerStatusesRefetchInterval,
} from "../src/lib/provider-statuses-query.ts";
import type { ProviderStatus } from "../src/lib/tauri.ts";

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

/**
 * HOU-1153 — an unreachable probe must be an ERROR, not a successful
 * "everything is unknown".
 *
 * Symptom it closes: on desktop with zero providers connected the adapter's
 * batched `providerStatuses()` swallows every failure (and skips the call
 * outright while agent routing is unsettled), resolving all ~35 providers as
 * `unknown`. That is a SUCCESSFUL query as far as TanStack is concerned, so
 * nothing retried: `unknown` maps to `checking`, the picker sat on "Loading
 * providers…" forever, and the connect-AI composer empty state — which fails
 * closed while anything is `checking` — never fired. The scan carries no
 * information, so the honest shape is a rejected query that keeps re-probing.
 */
const scanStatus = (
  id: string,
  auth_state: ProviderStatus["auth_state"],
): ProviderStatus => ({
  provider: id,
  cli_installed: true,
  auth_state,
  authenticated: auth_state === "authenticated",
  cli_name: id,
});

describe("classifying a status scan", () => {
  it("calls an all-unknown scan unreachable — it carries no information", () => {
    strictEqual(
      classifyStatusScan(["anthropic", "openai"], {
        anthropic: scanStatus("anthropic", "unknown"),
        openai: scanStatus("openai", "unknown"),
      }),
      "unreachable",
    );
  });

  it("calls a scan with any CONFIRMED answer definitive", () => {
    strictEqual(
      classifyStatusScan(["anthropic", "openai"], {
        anthropic: scanStatus("anthropic", "unknown"),
        openai: scanStatus("openai", "unauthenticated"),
      }),
      "definitive",
    );
  });

  it("calls an all-unauthenticated scan definitive — zero connected IS an answer", () => {
    // The exact shape the bug hid: a fresh install with nothing connected must
    // settle here so the composer can offer its connect-AI empty state.
    strictEqual(
      classifyStatusScan(["anthropic"], {
        anthropic: scanStatus("anthropic", "unauthenticated"),
      }),
      "definitive",
    );
  });

  it("calls an empty probe set definitive — nothing was asked, nothing failed", () => {
    strictEqual(classifyStatusScan([], {}), "definitive");
  });
});

describe("the self-heal re-probe interval", () => {
  it("re-probes on a bounded interval while the last probe failed", () => {
    strictEqual(
      providerStatusesRefetchInterval({ status: "error" }),
      PROVIDER_STATUS_REPROBE_MS,
    );
    strictEqual(PROVIDER_STATUS_REPROBE_MS > 0, true);
  });

  it("stops the moment a definitive answer arrives", () => {
    // Otherwise a settled picker would poll the engine forever for nothing.
    strictEqual(providerStatusesRefetchInterval({ status: "success" }), false);
  });

  it("does not poll while the first probe is still in flight", () => {
    // TanStack's own retry/backoff owns that window; a second timer on top
    // would stack overlapping probes.
    strictEqual(providerStatusesRefetchInterval({ status: "pending" }), false);
  });
});

describe("what the picker paints once the probe has ERRORED", () => {
  it("settles on 'nothing connected' rather than spinning forever", () => {
    // The end of the chain the throw buys. TanStack's `isLoading` is
    // `isPending && isFetching`, so an errored query is NOT loading...
    const isLoading = providerStatusesLoading({
      hasData: false,
      queryIsLoading: false,
      probeReady: true,
    });
    strictEqual(isLoading, false);
    // ...which makes every provider's absent status a settled `disconnected`,
    // not the `checking` that pinned the level-1 list on its loading state.
    // `providerListLoading([...disconnected], "ready") === false` is pinned on
    // the other side of the seam in ui/core's model-picker-catalog tests, so
    // the picker lands on its "Connect more providers" empty state.
    strictEqual(providerConnectionState(undefined, isLoading), "disconnected");
  });

  it("keeps painting the last known statuses when a refetch errors", () => {
    // Data + error is a background self-heal tick failing: never regress a
    // connected picker into an empty one.
    strictEqual(
      providerStatusesLoading({
        hasData: true,
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

  it("throws on an unreachable scan and self-heals on an interval", () => {
    strictEqual(hook.includes("classifyStatusScan"), true);
    strictEqual(hook.includes("ProviderProbeUnreachableError"), true);
    strictEqual(hook.includes("providerStatusesRefetchInterval"), true);
    // The client-wide default is `retry: false`, so the retry/backoff this
    // relies on has to be opted into explicitly on THIS query.
    strictEqual(/retry:\s*\d/.test(hook), true);
  });

  it("leaves the AI hub's sibling hook consuming the all-unknown shape", () => {
    // The hub deliberately keeps painting its last-known snapshot on an
    // unreachable scan; it must NOT start throwing.
    const hub = read(
      "../src/hooks/provider-connections/use-provider-statuses.ts",
    );
    strictEqual(hub.includes("scanIsUnreachable"), true);
    strictEqual(hub.includes("ProviderProbeUnreachableError"), false);
  });

  it("makes every consumer that DEFERRED on 'unknown' defer on the error too", () => {
    // The throw replaces a map of `unknown`s with no statuses at all. Consumers
    // that read "somebody is checking" as "do not act yet" would otherwise see
    // an empty map and act on it as a confident "nothing is connected" — the
    // migration reconnect card firing at a user who IS connected, and the setup
    // chats telling the agent the user has no providers (and PRODUCT-1236,
    // switching their kickoff off the configured provider on that same
    // fabricated evidence).
    for (const path of [
      "../src/hooks/use-migration-reconnect.ts",
      // The ONE derivation the setup chats read through (`useConnectedProviders`).
      "../src/lib/connected-providers.ts",
    ]) {
      strictEqual(
        /isError/.test(read(path)),
        true,
        `${path} defers on isError`,
      );
    }
    // ...and the setup chats must go through it rather than re-deriving.
    for (const path of [
      "../src/components/tabs/use-routine-chat-setup.ts",
      "../src/components/tabs/use-skill-chat-setup.ts",
      "../src/components/integrations/use-integration-chat-setup.ts",
    ]) {
      strictEqual(
        read(path).includes("useConnectedProviders"),
        true,
        `${path} reads the shared connected-provider derivation`,
      );
    }
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
