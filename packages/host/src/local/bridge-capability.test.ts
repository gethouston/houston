import { expect, test } from "vitest";
import {
  managedBridgeCapability,
  managedBridgeRuntimeEnv,
} from "./bridge-capability";

const callback = {
  url: "http://gateway.internal:8080",
  orgSlug: "org",
  agentSlug: "agent",
  podToken: "host-token",
};
test("managed bridge capability requires complete trusted callback wiring", () => {
  expect(managedBridgeCapability(false, callback)).toEqual({});
  expect(managedBridgeCapability(true, undefined)).toEqual({});
  expect(managedBridgeCapability(true, { ...callback, podToken: "" })).toEqual(
    {},
  );
  expect(managedBridgeCapability(true, callback)).toEqual({
    localModelBridge: { versions: [1] },
  });
});
test("advertised transport receives the same callback credentials in the child runtime", () => {
  expect(managedBridgeRuntimeEnv(true, callback)).toEqual({
    HOUSTON_CREDENTIALS_URL: callback.url,
    HOUSTON_ORG_SLUG: "org",
    HOUSTON_AGENT_SLUG: "agent",
    HOUSTON_HOST_TOKEN: "host-token",
  });
  expect(managedBridgeRuntimeEnv(false, callback)).toEqual({});
});
