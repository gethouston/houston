import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const previousDataDir = process.env.HOUSTON_DATA_DIR;

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.HOUSTON_DATA_DIR;
  else process.env.HOUSTON_DATA_DIR = previousDataDir;
  vi.resetModules();
});

test("the org-shared marker persists with the endpoint and clears with it", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "houston-shared-endpoint-"));
  process.env.HOUSTON_DATA_DIR = dataDir;
  vi.resetModules();
  const {
    clearCustomEndpointConfig,
    customEndpointStatus,
    setCustomEndpointConfig,
  } = await import("./openai-compatible");

  setCustomEndpointConfig({
    baseUrl: "https://local.example.com/v1",
    model: "qwen",
    name: "Qwen",
    reasoning: true,
    orgShared: true,
  });

  expect(customEndpointStatus()).toEqual({
    configured: true,
    orgShared: true,
    endpoint: {
      baseUrl: "https://local.example.com/v1",
      model: "qwen",
      name: "Qwen",
      reasoning: true,
    },
  });
  expect(
    JSON.parse(readFileSync(join(dataDir, "custom-endpoint.json"), "utf8")),
  ).toMatchObject({ orgShared: true });

  clearCustomEndpointConfig();

  expect(customEndpointStatus()).toEqual({
    configured: false,
    orgShared: false,
  });
  expect(
    JSON.parse(readFileSync(join(dataDir, "custom-endpoint.json"), "utf8")),
  ).toEqual({});
});
