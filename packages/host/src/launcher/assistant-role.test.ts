import { expect, test } from "vitest";
import { ASSISTANT_AGENT_NAME } from "../routes/assistant";
import {
  assistantRoleEnv,
  assistantRuntimeRole,
  readAssistantRole,
} from "./assistant-role";

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
  expect(
    assistantRuntimeRole({
      agentId: "ws-1/Assistant",
      hostEnv: {
        HOUSTON_MANAGED_CLOUD: "1",
        HOUSTON_ASSISTANT_USER_ID: "user-42",
      },
    }),
  ).toBe("coordinator");
  expect(
    assistantRuntimeRole({
      agentId: "ws-1/Assistant",
      hostEnv: {
        HOUSTON_MANAGED_CLOUD: "1",
        HOUSTON_ASSISTANT_USER_ID: "  ",
      },
    }),
  ).toBeNull();
});

test("the pod marker alone is not a coordinator off the managed profile", () => {
  for (const agentId of ["ws-1/Assistant", "ws-1/Writer"]) {
    expect(
      assistantRuntimeRole({
        agentId,
        hostEnv: {
          HOUSTON_ASSISTANT_USER_ID: "user-42",
          HOUSTON_ASSISTANT_CP_URL: "https://gateway.example",
          HOUSTON_ASSISTANT_TOKEN: "gw",
        },
      }),
    ).toBeNull();
  }
  expect(
    assistantRuntimeRole({
      agentId: `ws-1/${ASSISTANT_AGENT_NAME}`,
      hostEnv: { HOUSTON_ASSISTANT_USER_ID: "user-42" },
    }),
  ).toBe("coordinator");
});

test("holding the gateway credential does not make a pod an assistant pod", () => {
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
