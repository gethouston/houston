import { expect, test } from "vitest";
import { resolveAssistantGateway } from "../routes/assistant-wiring";
import { runtimeSpawnEnv } from "./runtime-env";

/**
 * What every spawned runtime is told. The load-bearing case: an UNFRONTED host
 * hands the runtime its own coordinates, so the assistant tool family is on
 * for a desktop user with nothing to configure — and a fronted host with no
 * configured gateway hands over neither variable, so the runtime offers no
 * tools whose every call would come back 501.
 */

const SELF = { url: "http://127.0.0.1:4318", token: "boot-token" };

test("an unfronted host injects its own coordinates as the assistant pair", () => {
  expect(
    runtimeSpawnEnv({
      transcriptDualWrite: false,
      assistant: resolveAssistantGateway({ env: {}, self: SELF }),
    }),
  ).toEqual({
    HOUSTON_TRANSCRIPT_DUAL_WRITE: "",
    HOUSTON_ASSISTANT_CP_URL: "http://127.0.0.1:4318",
    HOUSTON_ASSISTANT_TOKEN: "boot-token",
  });
});

test("a fronted host with no configured gateway injects neither variable", () => {
  const env = runtimeSpawnEnv({
    transcriptDualWrite: false,
    assistant: resolveAssistantGateway({ env: {} }),
  });
  expect(env).not.toHaveProperty("HOUSTON_ASSISTANT_CP_URL");
  expect(env).not.toHaveProperty("HOUSTON_ASSISTANT_TOKEN");
});

test("a fronted pod passes the gateway's own pair through", () => {
  expect(
    runtimeSpawnEnv({
      transcriptDualWrite: true,
      assistant: resolveAssistantGateway({
        env: {
          HOUSTON_ASSISTANT_CP_URL: "https://gateway.example",
          HOUSTON_ASSISTANT_TOKEN: "pod",
        },
      }),
    }),
  ).toEqual({
    HOUSTON_TRANSCRIPT_DUAL_WRITE: "1",
    HOUSTON_ASSISTANT_CP_URL: "https://gateway.example",
    HOUSTON_ASSISTANT_TOKEN: "pod",
  });
});

test("the product prompt and the sidecar role ride only when they apply", () => {
  expect(
    runtimeSpawnEnv({
      systemPrompt: "be kind",
      sidecarBinary: "/Applications/Houston.app/houston-engine",
      transcriptDualWrite: false,
      assistant: null,
    }),
  ).toEqual({
    HOUSTON_SYSTEM_PROMPT: "be kind",
    HOUSTON_SIDECAR_ROLE: "runtime",
    HOUSTON_TRANSCRIPT_DUAL_WRITE: "",
  });
});

test("shutdownDrainMs becomes HOUSTON_RUNTIME_DRAIN_MS, absent otherwise", () => {
  const withDrain = runtimeSpawnEnv({
    transcriptDualWrite: false,
    shutdownDrainMs: 1500,
    assistant: null,
  });
  assert.equal(withDrain.HOUSTON_RUNTIME_DRAIN_MS, "1500");
  const without = runtimeSpawnEnv({
    transcriptDualWrite: false,
    assistant: null,
  });
  assert.ok(!("HOUSTON_RUNTIME_DRAIN_MS" in without));
});
