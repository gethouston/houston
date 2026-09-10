import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { apiKeyReasonCopyKey } from "../src/lib/api-key-reason-copy.ts";

// The connect dialog's verdict → copy map. Providers with a KNOWN remedy must
// name it: the generic "check the key" sent Hugging Face users (a token
// missing the Inference Providers permission) and Google users (a key with
// its own restrictions) in circles (PRODUCT-1730). Every key it returns must
// exist in the en source of truth, and the remedy sentences must name the
// thing to change.
const EN = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../src/locales/en/providers.json"),
    "utf8",
  ),
) as { apiKey: Record<string, string> };

const read = (key: string) => EN.apiKey[key.replace(/^apiKey\./, "")];

describe("apiKeyReasonCopyKey", () => {
  it("names the Inference Providers permission for a restricted huggingface token", () => {
    const key = apiKeyReasonCopyKey("huggingface", "key_restricted");
    strictEqual(key, "apiKey.errorHuggingfaceInferenceGated");
    ok(read(key)?.includes("Make calls to Inference Providers"));
  });

  it("names the key's own restrictions for a restricted google key", () => {
    const key = apiKeyReasonCopyKey("google", "key_restricted");
    strictEqual(key, "apiKey.errorGoogleKeyRestricted");
    ok(read(key)?.includes("restrictions"));
  });

  it("keeps the earlier per-provider remedies", () => {
    strictEqual(
      apiKeyReasonCopyKey("nvidia", "key_restricted"),
      "apiKey.errorNvidiaAccountGated",
    );
    strictEqual(
      apiKeyReasonCopyKey("amazon-bedrock", "invalid_key"),
      "apiKey.errorBedrockInvalidKey",
    );
  });

  it("falls back to the generic verdict copy everywhere else", () => {
    strictEqual(
      apiKeyReasonCopyKey("huggingface", "invalid_key"),
      "apiKey.errorInvalidKey",
    );
    strictEqual(
      apiKeyReasonCopyKey("deepseek", "invalid_key"),
      "apiKey.errorInvalidKey",
    );
    strictEqual(
      apiKeyReasonCopyKey("google", "provider_unavailable"),
      "apiKey.errorProviderUnavailable",
    );
  });

  it("every returned key exists in the en locale", () => {
    for (const provider of [
      "huggingface",
      "google",
      "nvidia",
      "amazon-bedrock",
      "x",
    ])
      for (const reason of [
        "invalid_key",
        "key_restricted",
        "provider_unavailable",
      ] as const)
        ok(
          read(apiKeyReasonCopyKey(provider, reason)),
          `${provider}/${reason}`,
        );
  });
});

// `analytics.ts` can't be imported here (posthog-js comes with it), so the
// rejection counter's contract is pinned against the source: the event must be
// in the name union and both its props in ALLOWED_PROPS, or `cleanProps`
// silently drops them and the dashboard goes quiet.
const ANALYTICS = readFileSync(
  join(import.meta.dirname, "../src/lib/analytics.ts"),
  "utf8",
);
const TAURI = readFileSync(
  join(import.meta.dirname, "../src/lib/tauri.ts"),
  "utf8",
);

describe("provider_key_rejected wiring", () => {
  it("declares the analytics event and its props", () => {
    ok(ANALYTICS.includes('| "provider_key_rejected"'));
    const allowed = ANALYTICS.slice(
      ANALYTICS.indexOf("const ALLOWED_PROPS = new Set<AnalyticsProperty>(["),
    );
    ok(allowed.includes('"provider",'));
    ok(allowed.includes('"error_kind",'));
  });

  it("setApiKey silences user-fixable verdicts so they never reach Sentry", () => {
    const from = TAURI.indexOf('"set_provider_api_key"');
    ok(from >= 0);
    const call = TAURI.slice(from, TAURI.indexOf("setCustomEndpoint:", from));
    ok(call.includes("isApiKeyUserRejection(err)"));
    ok(call.includes("toast: false"));
  });
});
