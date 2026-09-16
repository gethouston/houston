import { expect, test } from "vitest";
import { NoAgentForProviderWriteError } from "../no-agent-provider-write-error";
import { BridgeStateError } from "./errors";
import { bridgeQuietClass } from "./quiet";

// PRODUCT-1833: the SDK names the expected bridge states once; a surface only
// binds the answer to its quiet report. Anything else stays a real failure.
test("names the three expected bridge states and nothing else", () => {
  expect(
    bridgeQuietClass(
      Object.assign(new Error("unsupported"), {
        status: 503,
        body: { code: "bridge_not_supported" },
      }),
    ),
  ).toBe("bridge_unsupported");
  expect(bridgeQuietClass(new NoAgentForProviderWriteError())).toBe(
    "bridge_no_agent",
  );
  for (const status of ["model_unavailable", "reconnecting"] as const)
    expect(bridgeQuietClass(new BridgeStateError(status))).toBe("bridge_state");
  expect(
    bridgeQuietClass(
      Object.assign(new Error("forbidden"), {
        status: 403,
        body: { code: "bridge_forbidden" },
      }),
    ),
  ).toBeNull();
  expect(bridgeQuietClass(new Error("BridgeStateError"))).toBeNull();
});
