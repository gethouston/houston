import { expect, test } from "vitest";
import { capturePodFence, type PodGatewayConfig } from "./pod-gateway";

function gateway(token = "4"): PodGatewayConfig {
  return {
    baseUrl: "https://gateway.example",
    orgSlug: "acme",
    agentSlug: "helper",
    podToken: "pod-token",
    bootId: "boot-1",
    fence: { token },
  };
}

test("capturePodFence ignores fencing tokens on non-ok responses", () => {
  const config = gateway();
  capturePodFence(
    config,
    new Response(null, {
      status: 409,
      headers: { "X-Houston-Fencing-Token": "5" },
    }),
  );
  expect(config.fence.token).toBe("4");
});

test("capturePodFence ignores an empty fencing token on an ok response", () => {
  const config = gateway();
  capturePodFence(
    config,
    new Response(null, {
      status: 200,
      headers: { "X-Houston-Fencing-Token": "" },
    }),
  );
  expect(config.fence.token).toBe("4");
});

test("capturePodFence adopts a newer fencing token on an ok response", () => {
  const config = gateway();
  capturePodFence(
    config,
    new Response(null, {
      status: 200,
      headers: { "X-Houston-Fencing-Token": "5" },
    }),
  );
  expect(config.fence.token).toBe("5");
});

test("capturePodFence never moves the token back", () => {
  const config = gateway("5");
  capturePodFence(
    config,
    new Response(null, {
      status: 200,
      headers: { "X-Houston-Fencing-Token": "4" },
    }),
  );
  expect(config.fence.token).toBe("5");
});
