import { expect, test } from "vitest";
import {
  CLOUD_CAPABILITIES,
  LOCAL_CAPABILITIES,
  MANAGED_CLOUD_CAPABILITIES,
} from "../capabilities";
import { buildProviderCatalog } from "./pi-catalog";

test("GET /v1/catalog lists Azure as azure-openai-responses, never azure", () => {
  const ids = buildProviderCatalog().map((p) => p.id);
  expect(ids).toContain("azure-openai-responses");
  expect(ids).not.toContain("azure");
});

test("GET /v1/capabilities lists Azure as azure-openai-responses, never azure", () => {
  for (const caps of [
    LOCAL_CAPABILITIES,
    CLOUD_CAPABILITIES,
    MANAGED_CLOUD_CAPABILITIES,
  ]) {
    expect(caps.providers).toContain("azure-openai-responses");
    expect(caps.providers).not.toContain("azure");
  }
});
