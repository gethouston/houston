import { expect, test } from "vitest";
import { resolveAssistantGateway } from "../routes/assistant-wiring";
import { assistantRuntimeRole } from "./assistant-role";
import { runtimeSpawnEnv } from "./runtime-env";

/**
 * What every spawned runtime is told. The load-bearing case: NO credential
 * crosses the process boundary. An unfronted desktop host is its own assistant
 * gateway and authorizes that gateway with the same per-boot token that
 * authorizes every one of its routes — so handing that pair to a runtime would
 * put a master credential in the environment of every agent on the machine,
 * readable with one `echo` from a bash tool. A runtime learns only its ROLE.
 */

const SELF = { url: "http://127.0.0.1:4318", token: "boot-token" };

test("the host's own gateway credential never reaches a spawned runtime", () => {
  // The desktop wiring, end to end: this host resolves ITSELF as the gateway
  // (that is where the credential belongs) and the runtime it spawns for an
  // ordinary agent is told nothing about it.
  const gateway = resolveAssistantGateway({ env: {}, self: SELF });
  expect(gateway).toEqual(SELF);

  const env = runtimeSpawnEnv({
    transcriptDualWrite: false,
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
    shutdownDrainMs: 1500,
    assistantRole: null,
  });
  expect(withDrain.HOUSTON_RUNTIME_DRAIN_MS).toBe("1500");
  const without = runtimeSpawnEnv({
    transcriptDualWrite: false,
    assistantRole: null,
  });
  expect("HOUSTON_RUNTIME_DRAIN_MS" in without).toBe(false);
});
