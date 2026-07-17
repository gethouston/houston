import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { scanIsUnreachable } from "../src/hooks/provider-connections/unreachable-scan.ts";
import type { ProviderStatus } from "../src/lib/tauri.ts";

function status(
  id: string,
  auth_state: ProviderStatus["auth_state"],
): ProviderStatus {
  return {
    provider: id,
    cli_installed: true,
    auth_state,
    authenticated: auth_state === "authenticated",
    cli_name: "",
  };
}

describe("scanIsUnreachable", () => {
  it("flags a scan where every gateway reports unknown (engine unreachable)", () => {
    strictEqual(
      scanIsUnreachable(["anthropic", "opencode"], {
        anthropic: status("anthropic", "unknown"),
        opencode: status("opencode", "unknown"),
      }),
      true,
    );
  });

  it("does not flag a scan with any confirmed answer", () => {
    strictEqual(
      scanIsUnreachable(["anthropic", "opencode"], {
        anthropic: status("anthropic", "unknown"),
        opencode: status("opencode", "unauthenticated"),
      }),
      false,
    );
  });

  it("does not flag an all-confirmed scan", () => {
    strictEqual(
      scanIsUnreachable(["anthropic"], {
        anthropic: status("anthropic", "authenticated"),
      }),
      false,
    );
  });

  it("does not flag an empty scan (no gateways requested)", () => {
    strictEqual(scanIsUnreachable([], {}), false);
  });

  it("does not flag when a gateway is simply missing from the result", () => {
    strictEqual(
      scanIsUnreachable(["anthropic", "opencode"], {
        anthropic: status("anthropic", "unknown"),
      }),
      false,
    );
  });
});
