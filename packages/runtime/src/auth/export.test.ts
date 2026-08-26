import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { config } from "../config";
import type { PiCred } from "./auth-file";
import { exportCredential, selectExportCredential } from "./export";

/**
 * PRODUCT-1370: the Anthropic setup-token connect stores the pasted token as
 * an `api_key` entry, but the export refused everything that wasn't
 * OAuth-with-refresh — so `/auth/export` answered {}, capture 400'd "agent is
 * not connected yet", the gateway never stored anthropic, every serve 404'd,
 * and the UI re-asked for the code in an endless loop. api_key entries are
 * exportable now, with the exact wire shape the host's capture branch consumes
 * (`{ provider, kind: "api_key", key }`).
 */

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
  // Unfiltered export finds it too.
  expect(selectExportCredential(auth)).toEqual({
    provider: "anthropic",
    kind: "api_key",
    key: "sk-ant-oat01-setup-token",
  });
});

test("OAuth-with-refresh outranks an api_key when both are present", () => {
  const auth: Record<string, PiCred> = {
    // The api_key comes FIRST in the record — priority must be semantic, not
    // positional.
    openrouter: { type: "api_key", key: "sk-or-key" },
    "openai-codex": oauth("AT-codex", "RT-codex"),
  };
  expect(selectExportCredential(auth)?.provider).toBe("openai-codex");
  // The provider filter still returns exactly what was asked for.
  expect(selectExportCredential(auth, "openrouter")).toEqual({
    provider: "openrouter",
    kind: "api_key",
    key: "sk-or-key",
  });
});

test("access-only OAuth (a served projection / scrubbed entry) stays unexportable", () => {
  // Capturing a refresh-less OAuth entry would seed the central store with a
  // token that dies at first expiry — the exact hazard the healer's
  // local-origin contract exists for. api_key support must not loosen this.
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
  // An api_key entry is byte-identical whether pasted locally or serve-written;
  // the manifest is the proof of origin. A serve-written projection must not be
  // re-exported (the healer would resurrect a central disconnect), while a
  // refresh-BEARING OAuth entry is provably a fresh local login even when the
  // manifest lists its provider (the PRODUCT-1318 lost-scrub leftover the
  // healer is SUPPOSED to re-push).
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

/** Drives the config-bound wrapper against a real temp dataDir. */
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
      // The user-initiated capture path: exported regardless of the flag.
      expect(exportCredential("anthropic")).toEqual({
        provider: "anthropic",
        kind: "api_key",
        key: "sk-ant-oat01-on-disk",
      });
      // The healer path: still exported — the manifest does not list it, so it
      // is attested local-origin (exactly the looping paste-flow victim).
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
      // Serve-written projection: the healer must not re-export it…
      expect(exportCredential("anthropic", { excludeServed: true })).toBeNull();
      // …while a user-initiated capture (a fresh re-paste overwrote the entry
      // milliseconds ago) still exports the current value.
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
      // The endpoint lives in its own file, not auth.json — the export joins
      // them so the captured central row serves a usable credential.
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
      // No stored endpoint (a legacy connect): the export stays key-only
      // rather than inventing an empty enterpriseUrl.
      expect(exportCredential("azure-openai-responses")).toEqual({
        provider: "azure-openai-responses",
        kind: "api_key",
        key: "azure-key",
      });
    },
  );
});
