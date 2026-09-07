import { expect, test } from "vitest";
import {
  assistantRuntimeEnv,
  formatAssistantModeLog,
  resolveAssistantGateway,
} from "./assistant-wiring";

/**
 * The ONE decision about where Houston operations are performed. What these
 * pin: a gateway-fronted pod uses the pair the gateway stamped, an unfronted
 * host performs its own operations with nothing to configure, a host that is
 * neither says so, and whatever is resolved is exactly what a spawned runtime
 * sees — the host and the runtime can never disagree about whether the
 * assistant tool family is on.
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

test("a spawned runtime carries exactly the resolved pair, or neither variable", () => {
  expect(
    assistantRuntimeEnv(resolveAssistantGateway({ env: {}, self: SELF })),
  ).toEqual({
    HOUSTON_ASSISTANT_CP_URL: "http://127.0.0.1:4318",
    HOUSTON_ASSISTANT_TOKEN: "boot-token",
  });
  expect(assistantRuntimeEnv(null)).toEqual({});
});
