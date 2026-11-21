import { expect, test } from "vitest";
import { resolveAssistantGateway } from "../routes/assistant-wiring";
import { assistantRuntimeRole } from "./assistant-role";
import { runtimeSpawnEnv } from "./runtime-env";

const SELF = { url: "http://127.0.0.1:4318", token: "boot-token" };

test("the host's own gateway credential never reaches a spawned runtime", () => {
  const gateway = resolveAssistantGateway({ env: {}, self: SELF });
  expect(gateway).toEqual({ ...SELF, loopback: true });

  const env = runtimeSpawnEnv({
    transcriptDualWrite: false,
    unservedOperations: [],
    assistantRole: assistantRuntimeRole({
      agentId: "ws/Writer",
      hostEnv: {},
    }),
  });

  expect(Object.values(env)).not.toContain(SELF.token);
  expect(env).not.toHaveProperty("HOUSTON_ASSISTANT_TOKEN");
  expect(env).not.toHaveProperty("HOUSTON_ASSISTANT_CP_URL");
  expect(env).not.toHaveProperty("HOUSTON_ASSISTANT_ROLE");
});

test("only the coordinator's runtime carries the assistant role", () => {
  expect(
    runtimeSpawnEnv({
      transcriptDualWrite: false,
      unservedOperations: [],
      assistantRole: assistantRuntimeRole({
        agentId: "ws/.assistant",
        hostEnv: {},
      }),
    }),
  ).toEqual({
    HOUSTON_TRANSCRIPT_DUAL_WRITE: "",
    HOUSTON_ASSISTANT_ROLE: "coordinator",
  });
});

test("a fronted pod passes no gateway pair down, whatever its own env holds", () => {
  const env = runtimeSpawnEnv({
    transcriptDualWrite: true,
    unservedOperations: [],
    assistantRole: assistantRuntimeRole({
      agentId: "ws/Assistant",
      hostEnv: {
        HOUSTON_MANAGED_CLOUD: "1",
        HOUSTON_ASSISTANT_CP_URL: "https://gateway.example",
        HOUSTON_ASSISTANT_TOKEN: "pod",
        HOUSTON_ASSISTANT_USER_ID: "user-42",
      },
    }),
  });

  expect(env).toEqual({
    HOUSTON_TRANSCRIPT_DUAL_WRITE: "1",
    HOUSTON_ASSISTANT_ROLE: "coordinator",
  });
});

test("the product prompt and the sidecar role ride only when they apply", () => {
  expect(
    runtimeSpawnEnv({
      systemPrompt: "be kind",
      sidecarBinary: "/Applications/Houston.app/houston-engine",
      transcriptDualWrite: false,
      unservedOperations: [],
      assistantRole: null,
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
    unservedOperations: [],
    shutdownDrainMs: 1500,
    assistantRole: null,
  });
  expect(withDrain.HOUSTON_RUNTIME_DRAIN_MS).toBe("1500");
  const without = runtimeSpawnEnv({
    transcriptDualWrite: false,
    unservedOperations: [],
    assistantRole: null,
  });
  expect("HOUSTON_RUNTIME_DRAIN_MS" in without).toBe(false);
});
