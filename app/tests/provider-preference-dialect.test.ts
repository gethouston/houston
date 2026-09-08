import { match, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { toDisplayProviderIdOrNull } from "@houston/sdk/provider-catalog";

const tauri = readFileSync(
  fileURLToPath(new URL("../src/lib/tauri.ts", import.meta.url)),
  "utf8",
);

/**
 * The stored `default_provider` preference is read by TWO accessors —
 * `getDefault` (the chat panel's initial provider, the boot CLI probe) and
 * `getLastUsed` (the creation dialogs' seed) — and it can hold either dialect:
 * an install that last picked Codex has pi's canonical `openai-codex` in it,
 * while every catalog lookup downstream is keyed by Houston's display `openai`.
 *
 * `getLastUsed` normalized and `getDefault` did not, so the same stored value
 * meant two different providers depending on which accessor asked: the chat
 * panel's `resolveEffectiveProvider` and `use-houston-init`'s connection probe
 * both got the raw id and missed the catalog. The fix is structural — ONE read
 * of the key, normalized once — so the two can never diverge again.
 *
 * Pinned against the source because the accessors close over the live engine
 * client; the policy, not the transport, is what must not drift. Same pattern
 * as `shared-skills-availability.test.ts`.
 */
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
    // The whole reason the normalization exists.
    strictEqual(toDisplayProviderIdOrNull("openai-codex"), "openai");
    strictEqual(toDisplayProviderIdOrNull("anthropic"), "anthropic");
    strictEqual(toDisplayProviderIdOrNull(""), null);
  });
});
