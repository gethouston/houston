import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { config } from "../config";
import type { PiCred } from "./auth-file";
import { exportCredential, selectExportCredential } from "./export";

const oauth = (access: string, refresh: string): PiCred => ({
  type: "oauth",
  access,
  refresh,
  expires: 1_900_000_000_000,
});

test("an api_key entry (the pasted setup token) exports as kind api_key", () => {
  const auth: Record<string, PiCred> = {
    anthropic: { type: "api_key", key: "sk-ant-oat01-setup-token" },
  };
  expect(selectExportCredential(auth, "anthropic")).toEqual({
    provider: "anthropic",
    kind: "api_key",
    key: "sk-ant-oat01-setup-token",
  });
  expect(selectExportCredential(auth)).toEqual({
    provider: "anthropic",
    kind: "api_key",
    key: "sk-ant-oat01-setup-token",
  });
});

test("OAuth-with-refresh outranks an api_key when both are present", () => {
  const auth: Record<string, PiCred> = {
    openrouter: { type: "api_key", key: "sk-or-key" },
    "openai-codex": oauth("AT-codex", "RT-codex"),
  };
  expect(selectExportCredential(auth)?.provider).toBe("openai-codex");
  expect(selectExportCredential(auth, "openrouter")).toEqual({
    provider: "openrouter",
    kind: "api_key",
    key: "sk-or-key",
  });
});

test("access-only OAuth (a served projection / scrubbed entry) stays unexportable", () => {
  const auth: Record<string, PiCred> = {
    "openai-codex": oauth("AT-served", ""),
  };
  expect(selectExportCredential(auth)).toBeNull();
  expect(selectExportCredential(auth, "openai-codex")).toBeNull();
});

test("a keyless api_key entry (pi's provider-env-only variant) is not exportable", () => {
  const auth: Record<string, PiCred> = {
    "amazon-bedrock": { type: "api_key", key: "" },
  };
  expect(selectExportCredential(auth)).toBeNull();
});

test("servedProviders gates api_key exports but never refresh-bearing OAuth", () => {
  const served = new Set(["anthropic", "openai-codex"]);
  expect(
    selectExportCredential(
      { anthropic: { type: "api_key", key: "sk-ant-oat01-served-copy" } },
      "anthropic",
      { servedProviders: served },
    ),
  ).toBeNull();
  expect(
    selectExportCredential(
      { "openai-codex": oauth("AT", "RT") },
      "openai-codex",
      { servedProviders: served },
    ),
  ).toMatchObject({ provider: "openai-codex", refresh: "RT" });
});

function withDataDir(files: Record<string, unknown>, body: () => void): void {
  const prev = config.dataDir;
  config.dataDir = mkdtempSync(join(tmpdir(), "houston-export-"));
  try {
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(join(config.dataDir, name), JSON.stringify(contents));
    }
    body();
  } finally {
    config.dataDir = prev;
  }
}

test("exportCredential reads the setup token from auth.json; excludeServed consults the manifest", () => {
  withDataDir(
    {
      "auth.json": {
        anthropic: { type: "api_key", key: "sk-ant-oat01-on-disk" },
      },
      "served-providers.json": [],
    },
    () => {
      expect(exportCredential("anthropic")).toEqual({
        provider: "anthropic",
        kind: "api_key",
        key: "sk-ant-oat01-on-disk",
      });
      expect(exportCredential("anthropic", { excludeServed: true })).toEqual({
        provider: "anthropic",
        kind: "api_key",
        key: "sk-ant-oat01-on-disk",
      });
    },
  );
  withDataDir(
    {
      "auth.json": {
        anthropic: { type: "api_key", key: "sk-ant-oat01-served-copy" },
      },
      "served-providers.json": ["anthropic"],
    },
    () => {
      expect(exportCredential("anthropic", { excludeServed: true })).toBeNull();
      expect(exportCredential("anthropic")).toMatchObject({
        kind: "api_key",
        key: "sk-ant-oat01-served-copy",
      });
    },
  );
});

test("an azure api_key export carries the stored endpoint as enterpriseUrl (PRODUCT-1532)", () => {
  withDataDir(
    {
      "auth.json": {
        "azure-openai-responses": { type: "api_key", key: "azure-key" },
      },
      "azure-endpoint.json": { baseUrl: "https://acme.openai.azure.com" },
    },
    () => {
      expect(exportCredential("azure-openai-responses")).toEqual({
        provider: "azure-openai-responses",
        kind: "api_key",
        key: "azure-key",
        enterpriseUrl: "https://acme.openai.azure.com",
      });
    },
  );
  withDataDir(
    {
      "auth.json": {
        "azure-openai-responses": { type: "api_key", key: "azure-key" },
      },
    },
    () => {
      expect(exportCredential("azure-openai-responses")).toEqual({
        provider: "azure-openai-responses",
        kind: "api_key",
        key: "azure-key",
      });
    },
  );
});
