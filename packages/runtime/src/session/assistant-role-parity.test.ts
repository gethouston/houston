import {
  ASSISTANT_ROLE_ENV,
  ASSISTANT_USER_ID_ENV,
  readAssistantRole,
} from "@houston/domain/assistant-role";
import {
  ASSISTANT_ROLE_ENV as HOST_ROLE_ENV,
  ASSISTANT_USER_ID_ENV as HOST_USER_ID_ENV,
  assistantRoleEnv as hostAssistantRoleEnv,
} from "@houston/host/src/launcher/assistant-role";
import { expect, test } from "vitest";

test("the host and the runtime name the same variables", () => {
  expect(HOST_ROLE_ENV).toBe(ASSISTANT_ROLE_ENV);
  expect(HOST_USER_ID_ENV).toBe(ASSISTANT_USER_ID_ENV);
});

test("what the host stamps is what the runtime reads back", () => {
  expect(readAssistantRole(hostAssistantRoleEnv("coordinator"))).toBe(
    "coordinator",
  );
  expect(readAssistantRole(hostAssistantRoleEnv(null))).toBeNull();
});

test("anything but the exact value is a plain agent", () => {
  for (const value of ["", " ", "Coordinator", "assistant", "true"]) {
    expect(readAssistantRole({ [ASSISTANT_ROLE_ENV]: value })).toBeNull();
  }
  expect(readAssistantRole({ [ASSISTANT_ROLE_ENV]: " coordinator " })).toBe(
    "coordinator",
  );
});
