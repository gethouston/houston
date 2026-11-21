import { assistantUnservedEnv } from "@houston/domain/assistant-deployment";
import { processAssistantCatalog } from "@houston/host/src/assistant/catalog-source";
import { expect, test } from "vitest";
import {
  HOUSTON_API_KEY_OPERATIONS,
  houstonApiServedHere,
} from "./houston-api-served";

test("the API-key operations it reads are real catalog names", () => {
  const names = new Set(
    processAssistantCatalog()?.operations.map((o) => o.name),
  );
  for (const name of HOUSTON_API_KEY_OPERATIONS) expect(names).toContain(name);
});

test("served unless the host stamps the API-key operations unserved", () => {
  expect(houstonApiServedHere({})).toBe(true);
  expect(houstonApiServedHere(assistantUnservedEnv(["createOrg"]))).toBe(true);
  expect(
    houstonApiServedHere(assistantUnservedEnv([...HOUSTON_API_KEY_OPERATIONS])),
  ).toBe(false);
  expect(houstonApiServedHere(assistantUnservedEnv(["createApiKey"]))).toBe(
    false,
  );
});
