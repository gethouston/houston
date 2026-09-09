import { expect, test } from "vitest";
import { isBridgeUnsupported } from "./errors";
import { bridgeRetry } from "./retry";

test("isBridgeUnsupported reads the code at the top level and inside an engine error body", () => {
  expect(
    isBridgeUnsupported({ status: 503, code: "bridge_not_supported" }),
  ).toBe(true);
  expect(
    isBridgeUnsupported({
      status: 503,
      body: { code: "bridge_not_supported" },
    }),
  ).toBe(true);
  expect(
    isBridgeUnsupported({ status: 503, body: { code: "engine_unavailable" } }),
  ).toBe(false);
  expect(isBridgeUnsupported(new Error("offline"))).toBe(false);
  expect(isBridgeUnsupported(null)).toBe(false);
});

test("bridgeRetry disables the bridge for an unsupported deployment instead of reconnecting", () => {
  expect(
    bridgeRetry(
      { status: 503, body: { code: "bridge_not_supported" } },
      0,
      () => 0,
    ),
  ).toEqual({
    status: "disabled",
    delay: null,
  });
  expect(
    bridgeRetry(
      { status: 503, body: { code: "engine_unavailable" } },
      0,
      () => 0,
    ).status,
  ).toBe("reconnecting");
});
