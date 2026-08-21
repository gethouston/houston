import { mkdtempSync, readFileSync } from "node:fs";
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

  expect(() => normalizeAzureEndpoint("")).toThrow(/missing/);
  expect(() => normalizeAzureEndpoint("acme.openai.azure.com")).toThrow(
    /not a valid URL/,
  );
  // The portal only hands out https; http would send the key in the clear.
  expect(() => normalizeAzureEndpoint("http://acme.openai.azure.com")).toThrow(
    /https/,
  );
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
