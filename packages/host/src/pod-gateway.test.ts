import { expect, test } from "vitest";
import { capturePodFence, type PodGatewayConfig } from "./pod-gateway";

function gateway(token = "old"): PodGatewayConfig {
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
      headers: { "X-Houston-Fencing-Token": "new" },
    }),
  );
  expect(config.fence.token).toBe("old");
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
  expect(config.fence.token).toBe("old");
});

test("capturePodFence adopts a real fencing token on an ok response", () => {
  const config = gateway();
  capturePodFence(
    config,
    new Response(null, {
      status: 200,
      headers: { "X-Houston-Fencing-Token": "new" },
    }),
  );
  expect(config.fence.token).toBe("new");
});
