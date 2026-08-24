import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("azure verify aims the REAL request at the pasted endpoint (PRODUCT-1477)", async () => {
  // Regression for the endpoint silently dropping before pi's azure client:
  // pi's completeSimple path rebuilds options through an allowlist that
  // forwards `env` but not `azureBaseUrl`, so passing only the option made
  // every azure verify throw "base URL is required" before any HTTP. This
  // test runs the UNMOCKED verify path with an injected transport and pins
  // where the probe actually connects.
  const prevDataDir = process.env.HOUSTON_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), "houston-azure-verify-"));
  process.env.HOUSTON_DATA_DIR = dataDir;

  try {
    vi.resetModules();
    const { verifyApiKey } = await import("./verify-api-key");

    const urls: string[] = [];
    const fakeFetch: typeof fetch = async (input, _init) => {
      urls.push(String(input instanceof Request ? input.url : input));
      return new Response(
        JSON.stringify({
          error: { message: "Access denied due to invalid subscription key" },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    };

    // A rejected key must reject the connect — but through a REAL request to
    // the pasted endpoint, never through a pre-request "base URL" throw.
    await expect(
      verifyApiKey("azure-openai-responses", "bad-key", {
        azureBaseUrl: "https://acme.openai.azure.com",
        fetch: fakeFetch,
      }),
    ).rejects.toThrow(/rejected this API key/);

    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      // pi appends its /openai/v1 base path to the bare resource host.
      expect(url).toMatch(/^https:\/\/acme\.openai\.azure\.com\/openai\/v1\//);
    }
  } finally {
    restoreEnv("HOUSTON_DATA_DIR", prevDataDir);
    vi.resetModules();
  }
});
