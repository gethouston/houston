import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("normalizeAzureEndpoint accepts https, trims a trailing slash, rejects the rest", async () => {
  const { normalizeAzureEndpoint } = await import("./azure-openai");

  expect(normalizeAzureEndpoint("https://acme.openai.azure.com")).toBe(
    "https://acme.openai.azure.com",
  );
  expect(normalizeAzureEndpoint("  https://acme.openai.azure.com/  ")).toBe(
    "https://acme.openai.azure.com",
  );
  // The Foundry tab's per-project endpoint (what the portal shows first for a
  // Foundry resource — and what the PRODUCT-1477 reporter pasted): the OpenAI
  // v1 surface lives at the host root, so the project path is dropped.
  expect(
    normalizeAzureEndpoint(
      "https://acme.services.ai.azure.com/api/projects/my-agents",
    ),
  ).toBe("https://acme.services.ai.azure.com");
  // A non-Azure host (proxy/gateway) keeps its path verbatim.
  expect(normalizeAzureEndpoint("https://llm.corp.example/azure/")).toBe(
    "https://llm.corp.example/azure",
  );

  expect(() => normalizeAzureEndpoint("")).toThrow(/missing/);
  expect(() => normalizeAzureEndpoint("acme.openai.azure.com")).toThrow(
    /not a valid URL/,
  );
  // The portal only hands out https; http would send the key in the clear.
  expect(() => normalizeAzureEndpoint("http://acme.openai.azure.com")).toThrow(
    /https/,
  );
});

test("applyServedAzureEndpoint lands a served endpoint, idempotently, azure-only, never throwing", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "houston-azure-served-"));
  const {
    AZURE_OPENAI,
    applyServedAzureEndpoint,
    azureBaseUrl,
    azureEndpointFileIn,
  } = await import("./azure-openai");

  // The served row's endpoint lands where model resolution reads it —
  // normalized exactly like a connect-time paste.
  applyServedAzureEndpoint(
    AZURE_OPENAI,
    "https://acme.openai.azure.com/",
    dataDir,
  );
  expect(azureBaseUrl(dataDir)).toBe("https://acme.openai.azure.com");

  // Same value again: no rewrite (the file's mtime is what store-sync watches).
  const file = azureEndpointFileIn(dataDir);
  const before = statSync(file).mtimeMs;
  applyServedAzureEndpoint(
    AZURE_OPENAI,
    "https://acme.openai.azure.com",
    dataDir,
  );
  expect(statSync(file).mtimeMs).toBe(before);

  // A different served value replaces the stored one (a reconnect elsewhere).
  applyServedAzureEndpoint(
    AZURE_OPENAI,
    "https://other.openai.azure.com",
    dataDir,
  );
  expect(azureBaseUrl(dataDir)).toBe("https://other.openai.azure.com");

  // Non-azure providers (copilot's enterprise domain) and absent values are
  // ignored; a malformed central value reports but never throws or clobbers.
  applyServedAzureEndpoint("github-copilot", "acme.ghe.com", dataDir);
  applyServedAzureEndpoint(AZURE_OPENAI, null, dataDir);
  applyServedAzureEndpoint(AZURE_OPENAI, "not-a-url", dataDir);
  expect(azureBaseUrl(dataDir)).toBe("https://other.openai.azure.com");
});

test("setAzureEndpoint persists and azure models resolve with the stored base URL", async () => {
  const prevDataDir = process.env.HOUSTON_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), "houston-azure-endpoint-"));
  process.env.HOUSTON_DATA_DIR = dataDir;

  try {
    vi.resetModules();
    const { AZURE_OPENAI, azureBaseUrl, setAzureEndpoint, withAzureBaseUrl } =
      await import("./azure-openai");
    const { safeGetModel } = await import("./providers");

    expect(azureBaseUrl()).toBe("");
    setAzureEndpoint("https://acme.openai.azure.com/");
    expect(azureBaseUrl()).toBe("https://acme.openai.azure.com");
    // The file the pod's /data hydration carries between restarts.
    expect(
      JSON.parse(readFileSync(join(dataDir, "azure-endpoint.json"), "utf8")),
    ).toEqual({ baseUrl: "https://acme.openai.azure.com" });

    // The catalog ships baseUrl "" — the overlay is what makes pi able to
    // build a request at all (its azure client throws without a base URL).
    const model = safeGetModel(AZURE_OPENAI, "gpt-5.5", false);
    expect(model.provider).toBe(AZURE_OPENAI);
    expect(model.baseUrl).toBe("https://acme.openai.azure.com");

    // Non-azure models are never touched by the overlay helper.
    const bedrock = safeGetModel(
      "amazon-bedrock",
      "amazon.nova-lite-v1:0",
      false,
    );
    expect(withAzureBaseUrl(bedrock)).toBe(bedrock);
  } finally {
    restoreEnv("HOUSTON_DATA_DIR", prevDataDir);
    vi.resetModules();
  }
});
