import { expect, test } from "vitest";
import { ASSISTANT_AGENT_NAME } from "../routes/assistant";
import {
  assistantRoleEnv,
  assistantRuntimeRole,
  readAssistantRole,
} from "./assistant-role";

/**
 * WHO is the coordinator. The decision is the host's, taken from the agent it
 * is spawning plus its OWN environment, because the two deployments name the
 * assistant differently: locally it is the synthetic `.assistant` agent, and on
 * a managed pod it is an ordinarily-named agent whose pod the gateway marked.
 * A runtime-side guess (its working directory's name) reads that pod as a plain
 * agent, which is exactly the coordinator restriction failing to apply.
 */

test("locally the synthetic .assistant agent is the coordinator", () => {
  expect(
    assistantRuntimeRole({
      agentId: `ws-1/${ASSISTANT_AGENT_NAME}`,
      hostEnv: {},
    }),
  ).toBe("coordinator");
});

test("every ordinary agent on the same host is a plain runtime", () => {
  for (const agentId of ["ws-1/Writer", "ws-1/Assistant", "ws-1/assistant"]) {
    expect(assistantRuntimeRole({ agentId, hostEnv: {} })).toBeNull();
  }
});

test("a managed assistant pod's runtime is the coordinator whatever the agent is named", () => {
  // The pod provisions under /workspace with a seeded, ordinarily-named agent,
  // so ONLY the gateway's marker identifies it.
  expect(
    assistantRuntimeRole({
      agentId: "ws-1/Assistant",
      hostEnv: { HOUSTON_ASSISTANT_USER_ID: "user-42" },
    }),
  ).toBe("coordinator");
  // A blank marker is not a marker.
  expect(
    assistantRuntimeRole({
      agentId: "ws-1/Assistant",
      hostEnv: { HOUSTON_ASSISTANT_USER_ID: "  " },
    }),
  ).toBeNull();
});

test("holding the gateway credential does not make a pod an assistant pod", () => {
  // An ordinary agent pod configured against a gateway must NOT inherit the
  // coordinator's Houston-wide toolset.
  expect(
    assistantRuntimeRole({
      agentId: "ws-1/Writer",
      hostEnv: {
        HOUSTON_ASSISTANT_CP_URL: "https://gateway.example",
        HOUSTON_ASSISTANT_TOKEN: "gw",
      },
    }),
  ).toBeNull();
});

test("the role survives the process boundary as exactly one variable", () => {
  expect(assistantRoleEnv("coordinator")).toEqual({
    HOUSTON_ASSISTANT_ROLE: "coordinator",
  });
  expect(assistantRoleEnv(null)).toEqual({});
});

test("a runtime reads the coordinator role only from the exact value", () => {
  expect(readAssistantRole({ HOUSTON_ASSISTANT_ROLE: "coordinator" })).toBe(
    "coordinator",
  );
  expect(readAssistantRole({ HOUSTON_ASSISTANT_ROLE: " coordinator " })).toBe(
    "coordinator",
  );
  for (const raw of ["", "1", "true", "Coordinator", "assistant"]) {
    expect(readAssistantRole({ HOUSTON_ASSISTANT_ROLE: raw })).toBeNull();
  }
  expect(readAssistantRole({})).toBeNull();
});
