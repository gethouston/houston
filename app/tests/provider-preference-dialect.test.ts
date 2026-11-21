import { match, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { toDisplayProviderIdOrNull } from "@houston/sdk/provider-catalog";

const tauri = readFileSync(
  fileURLToPath(new URL("../src/lib/tauri.ts", import.meta.url)),
  "utf8",
);

describe("the stored default-provider preference", () => {
  it("is read through exactly ONE accessor, so both callers see one dialect", () => {
    const reads = tauri.match(/getPreference\(DEFAULT_PROVIDER_PREF_KEY\)/g);
    strictEqual(reads?.length, 1);
  });

  it("normalizes that read to the DISPLAY dialect the catalog is keyed by", () => {
    match(
      tauri,
      /toDisplayProviderIdOrNull\(\s*await getEngine\(\)\.getPreference\(DEFAULT_PROVIDER_PREF_KEY\),?\s*\)/,
    );
  });

  it("maps the one id the two dialects spell differently", () => {
    strictEqual(toDisplayProviderIdOrNull("openai-codex"), "openai");
    strictEqual(toDisplayProviderIdOrNull("anthropic"), "anthropic");
    strictEqual(toDisplayProviderIdOrNull(""), null);
  });
});
