import { deepStrictEqual, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import {
  confirmedConnectedProviders,
  connectedProviderIds,
  type ScannedProviderStatus,
} from "../src/lib/connected-providers.ts";
import { hydrateProviderCatalog } from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

function status(
  provider: string,
  auth_state: ScannedProviderStatus["auth_state"],
): ScannedProviderStatus {
  return { provider, cli_installed: true, auth_state };
}

function scan(
  statuses: ScannedProviderStatus[],
  flags: { isLoading?: boolean; isError?: boolean } = {},
) {
  return {
    statuses: Object.fromEntries(statuses.map((s) => [s.provider, s])),
    isLoading: flags.isLoading ?? false,
    isError: flags.isError ?? false,
  };
}

describe("confirmedConnectedProviders", () => {
  it("returns only the confirmed-authenticated providers", () => {
    deepStrictEqual(
      confirmedConnectedProviders(
        scan([
          status("openai", "authenticated"),
          status("anthropic", "unauthenticated"),
        ]),
      )?.map((p) => p.id),
      ["openai"],
    );
  });

  it("returns an empty list when the scan settled with nothing connected", () => {
    deepStrictEqual(
      confirmedConnectedProviders(scan([status("openai", "unauthenticated")])),
      [],
    );
  });

  it("returns null while the scan is still loading", () => {
    strictEqual(
      confirmedConnectedProviders(scan([], { isLoading: true })),
      null,
    );
  });

  it("returns null when the scan failed (HOU-1153: not 'nothing is connected')", () => {
    strictEqual(
      confirmedConnectedProviders(
        scan([status("openai", "authenticated")], { isError: true }),
      ),
      null,
    );
  });

  it("returns null when ANY probe is unconfirmable (HOU-979)", () => {
    strictEqual(
      confirmedConnectedProviders(
        scan([
          status("openai", "authenticated"),
          status("anthropic", "unknown"),
        ]),
      ),
      null,
    );
  });

  it("names each provider for the kickoff prompts", () => {
    const connected = confirmedConnectedProviders(
      scan([status("anthropic", "authenticated")]),
    );
    strictEqual(!!connected?.[0]?.name.length, true);
  });
});

describe("connectedProviderIds", () => {
  it("maps refs to ids", () => {
    deepStrictEqual(connectedProviderIds([{ id: "openai", name: "ChatGPT" }]), [
      "openai",
    ]);
  });

  it("preserves the unconfirmable null rather than collapsing it to an empty list", () => {
    strictEqual(connectedProviderIds(null), null);
  });
});
