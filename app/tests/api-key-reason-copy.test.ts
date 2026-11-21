import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { apiKeyReasonCopyKey } from "../src/lib/api-key-reason-copy.ts";
import {
  TRACKED_ALLOWED_PROPS as ALLOWED_PROPS,
  TRACKED_EVENTS as EVENTS,
} from "./fixtures/analytics-source.ts";

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

const TAURI = readFileSync(
  join(import.meta.dirname, "../src/lib/tauri.ts"),
  "utf8",
);

describe("provider_key_rejected wiring", () => {
  it("declares the analytics event and its props", () => {
    ok(EVENTS.has("provider_key_rejected"));
    ok(ALLOWED_PROPS.has("provider"));
    ok(ALLOWED_PROPS.has("error_kind"));
  });

  it("setApiKey silences user-fixable verdicts so they never reach Sentry", () => {
    const from = TAURI.indexOf('"set_provider_api_key"');
    ok(from >= 0);
    const call = TAURI.slice(from, TAURI.indexOf("setCustomEndpoint:", from));
    ok(call.includes("isApiKeyUserRejection(err)"));
    ok(call.includes("toast: false"));
  });
});
