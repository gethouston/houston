import { expect, test } from "vitest";
import {
  assistantOperationsServedHere,
  formatAssistantModeLog,
  resolveAssistantGateway,
} from "./assistant-wiring";

const SELF = { url: "http://127.0.0.1:4318", token: "boot-token" };

test("the configured env pair wins — an operator who named a gateway meant it", () => {
  expect(
    resolveAssistantGateway({
      env: {
        HOUSTON_ASSISTANT_CP_URL: "https://gateway.example/",
        HOUSTON_ASSISTANT_TOKEN: "pod",
      },
      self: SELF,
    }),
  ).toEqual({ url: "https://gateway.example", token: "pod" });
});

test("both env halves are required — a half-configured pair is not a gateway", () => {
  expect(resolveAssistantGateway({ env: {} })).toBeNull();
  expect(
    resolveAssistantGateway({ env: { HOUSTON_ASSISTANT_CP_URL: "https://g" } }),
  ).toBeNull();
  expect(
    resolveAssistantGateway({ env: { HOUSTON_ASSISTANT_TOKEN: "t" } }),
  ).toBeNull();
});

test("an unfronted host is its own gateway — the family is on with nothing to configure", () => {
  expect(resolveAssistantGateway({ env: {}, self: SELF })).toEqual({
    ...SELF,
    loopback: true,
  });
});

test("a configured gateway is never loopback, even beside a self", () => {
  const gateway = resolveAssistantGateway({
    env: {
      HOUSTON_ASSISTANT_CP_URL: "https://g",
      HOUSTON_ASSISTANT_TOKEN: "t",
    },
    self: SELF,
  });
  expect(gateway).not.toHaveProperty("loopback");
});

test("gateway-fronted with no env pair resolves nothing — the dispatcher stays 501", () => {
  expect(resolveAssistantGateway({ env: {} })).toBeNull();
});

test("the boot line names the gateway, this host, or the missing env", () => {
  expect(
    formatAssistantModeLog({
      env: {
        HOUSTON_ASSISTANT_CP_URL: "https://g",
        HOUSTON_ASSISTANT_TOKEN: "t",
      },
    }),
  ).toContain("gateway https://g");
  expect(formatAssistantModeLog({ env: {}, self: SELF })).toContain(
    "this host (http://127.0.0.1:4318)",
  );
  const off = formatAssistantModeLog({ env: {} });
  expect(off).toContain("HOUSTON_ASSISTANT_CP_URL");
  expect(off).toContain("HOUSTON_ASSISTANT_TOKEN");
  expect(
    formatAssistantModeLog({ env: { HOUSTON_ASSISTANT_CP_URL: "https://g" } }),
  ).toContain("HOUSTON_ASSISTANT_TOKEN");
});

test("only a host nothing fronts answers for the catalogued surface itself", () => {
  expect(assistantOperationsServedHere({ env: {}, self: SELF })).toBe(true);
  expect(assistantOperationsServedHere({ env: {} })).toBe(true);
  expect(
    assistantOperationsServedHere({
      env: {
        HOUSTON_ASSISTANT_CP_URL: "https://gateway.example",
        HOUSTON_ASSISTANT_TOKEN: "pod",
      },
      self: SELF,
    }),
  ).toBe(false);
});

test("a fronted pod answers no even when its env pair never arrived", () => {
  expect(assistantOperationsServedHere({ env: {}, gatewayFronted: true })).toBe(
    false,
  );
});
