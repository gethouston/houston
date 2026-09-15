import { expect, test } from "vitest";
import {
  assistantOperationsServedHere,
  formatAssistantModeLog,
  resolveAssistantGateway,
} from "./assistant-wiring";

/**
 * The ONE decision about where Houston operations are performed. What these
 * pin: a gateway-fronted pod uses the pair the gateway stamped, an unfronted
 * host performs its own operations with nothing to configure, and a host that
 * is neither says so. What is resolved here stays with the HOST's dispatcher:
 * the runtimes it spawns are told a role, never this credential
 * (launcher/assistant-role.ts).
 */

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
    // The trailing slash is trimmed so route paths never double up.
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
  expect(resolveAssistantGateway({ env: {}, self: SELF })).toEqual(SELF);
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

/**
 * WHOSE route table answers "what can this deployment do". Behind a real
 * gateway it is the gateway's, and the gateway serves the whole catalogued
 * surface — a pod that read its OWN routes would withdraw spaces, teams and
 * billing from a managed assistant that can perform every one of them.
 */
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
  // BEING FRONTED IS THE FACT, not the env pair that usually proves it: a pod
  // whose gateway stamped nothing (a rollout that dropped the variables, a
  // half-applied manifest) still serves one agent's routes, and reading them
  // as the catalogued surface would withdraw spaces, teams and billing from a
  // managed AI Manager that can perform every one of them.
  expect(assistantOperationsServedHere({ env: {}, gatewayFronted: true })).toBe(
    false,
  );
});
