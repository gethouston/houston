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

/**
 * THE HANDSHAKE that decides which runtime is the user's coordinator: the host
 * STAMPS one variable when it spawns, this process READS it at boot. The
 * runtime reads the declaration in `@houston/domain`; this pins that the host's
 * stamp is the same one - a runtime that misread the stamp would silently run
 * as a plain agent, keeping the coordinator's Houston-wide toolset with none of
 * the rails that govern it.
 */

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
