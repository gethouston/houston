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

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("the probe gate", () => {
  it("is closed until the agent list has settled at least once", () => {
    strictEqual(providerProbeReady({ loaded: false, loading: false }), false);
    strictEqual(providerProbeReady({ loaded: false, loading: true }), false);
  });

  it("is closed while a RE-load runs, which is the space-switch window", () => {
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
      providerIds: ["anthropic"],
      workspaceId: "personal",
    });
    const team = providerStatusesQueryKey({
      base,
      providerIds: ["anthropic"],
      workspaceId: "org:00000000000000ab",
    });
    deepStrictEqual(personal, [
      "provider-statuses",
      "anthropic",
      ["anthropic"],
      "personal",
    ]);
    strictEqual(JSON.stringify(personal) === JSON.stringify(team), false);
  });

  it("re-keys when the catalog hydration grows the probed set", () => {
    const base = ["provider-statuses"];
    const seed = providerStatusesQueryKey({
      base,
      providerIds: ["anthropic"],
      workspaceId: null,
    });
    const hydrated = providerStatusesQueryKey({
      base,
      providerIds: ["anthropic", "openai"],
      workspaceId: null,
    });
    strictEqual(JSON.stringify(seed) === JSON.stringify(hydrated), false);
  });
});

describe("the loading signal the picker reads", () => {
  it("reports checking while the gate is closed, not 'settled with nothing'", () => {
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
    strictEqual(providerStatusesRefetchInterval({ status: "success" }), false);
  });

  it("does not poll while the first probe is still in flight", () => {
    strictEqual(providerStatusesRefetchInterval({ status: "pending" }), false);
  });
});

describe("what the picker paints once the probe has ERRORED", () => {
  it("settles on 'nothing connected' rather than spinning forever", () => {
    const isLoading = providerStatusesLoading({
      hasData: false,
      queryIsLoading: false,
      probeReady: true,
    });
    strictEqual(isLoading, false);
    strictEqual(providerConnectionState(undefined, isLoading), "disconnected");
  });

  it("keeps painting the last known statuses when a refetch errors", () => {
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

  it("keys on the probed ids, never on when the catalog was fetched (H-055)", () => {
    const keyCall = hook.slice(hook.indexOf("providerStatusesQueryKey({"));
    const keyArgs = keyCall.slice(0, keyCall.indexOf("})"));
    strictEqual(keyArgs.includes("providerIds"), true);
    strictEqual(/updatedAt/i.test(keyArgs), false);
  });

  it("throws on an unreachable scan and self-heals on an interval", () => {
    strictEqual(hook.includes("classifyStatusScan"), true);
    strictEqual(hook.includes("ProviderProbeUnreachableError"), true);
    strictEqual(hook.includes("providerStatusesRefetchInterval"), true);
    strictEqual(/retry:\s*\d/.test(hook), true);
  });

  it("leaves the AI hub's sibling hook consuming the all-unknown shape", () => {
    const hub = read(
      "../src/hooks/provider-connections/use-provider-statuses.ts",
    );
    strictEqual(hub.includes("scanIsUnreachable"), true);
    strictEqual(hub.includes("ProviderProbeUnreachableError"), false);
  });

  it("makes every consumer that DEFERRED on 'unknown' defer on the error too", () => {
    for (const path of [
      "../src/hooks/use-migration-reconnect.ts",
      "../src/lib/connected-providers.ts",
    ]) {
      strictEqual(
        /isError/.test(read(path)),
        true,
        `${path} defers on isError`,
      );
    }
    for (const path of [
      "../src/components/agent/use-routine-chat-setup.ts",
      "../src/components/agent/use-skill-chat-writes.ts",
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
