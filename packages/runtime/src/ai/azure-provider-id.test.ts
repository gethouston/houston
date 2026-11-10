import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getEnvApiKey,
  getModel,
  getProviders,
} from "@earendil-works/pi-ai/compat";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { HoustonAuthStore } from "../auth/credential-store";
import { probePath } from "../auth/serve-probe";
import { piApiKeyProviderIds, piModelIds } from "./pi-catalog";

/**
 * pi 1.0.3 renamed its Azure provider from `azure-openai-responses` to `azure`.
 * Houston keeps the old id everywhere (the wire, the gateway's credential rows
 * and model ceilings, settings.json, pins, routines, older desktop clients), so
 * the pi-ai patch (patches/@earendil-works__pi-ai@<version>.patch) reverts the
 * rename inside pi: the provider id, its catalog rows, the env-key table and
 * the Responses tool-call provider set. With it, nothing in Houston translates.
 * A pi bump must carry that hunk forward; these guards fail if it is dropped.
 */
type ModelId = Parameters<typeof getModel>[1];
type Provider = Parameters<typeof getModel>[0];

test("pi's catalog knows Azure only as azure-openai-responses", () => {
  expect(getProviders()).toContain("azure-openai-responses");
  expect(getProviders()).not.toContain("azure");
  const m = getModel("azure-openai-responses", "gpt-5.5" as ModelId);
  expect(m?.provider).toBe("azure-openai-responses");
  expect(m?.api).toBe("azure-openai-responses");
  expect(getModel("azure" as Provider, "gpt-5.5" as ModelId)).toBeUndefined();
  expect(piModelIds("azure-openai-responses")).toContain("gpt-6-luna");
});

test("pi reads the Azure env key under the Houston id", () => {
  expect(
    getEnvApiKey("azure-openai-responses", {
      AZURE_OPENAI_API_KEY: "env-key",
    }),
  ).toBe("env-key");
});

test("a key stored under azure-openai-responses is the one pi authenticates with", async () => {
  const dir = mkdtempSync(join(tmpdir(), "houston-azure-id-"));
  const authPath = join(dir, "auth.json");
  writeFileSync(
    authPath,
    JSON.stringify({
      "azure-openai-responses": { type: "api_key", key: "stored-key" },
    }),
  );
  const runtime = await ModelRuntime.create({
    credentials: new HoustonAuthStore(authPath),
    modelsPath: null,
  });
  const model = getModel("azure-openai-responses", "gpt-5.5" as ModelId);
  if (!model) throw new Error("azure catalog row missing");
  expect((await runtime.getAuth(model))?.auth.apiKey).toBe("stored-key");
});

test("serve mode asks the gateway for the azure-openai-responses row", () => {
  // runServedSync probes exactly these ids (curated + pi's api-key providers).
  expect(piApiKeyProviderIds()).toContain("azure-openai-responses");
  expect(piApiKeyProviderIds()).not.toContain("azure");
  expect(probePath("azure-openai-responses", false)).toBe(
    "/sandbox/credential?provider=azure-openai-responses",
  );
});
