import { strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import i18next from "i18next";
import { CURATED_API_KEY_OVERRIDES } from "../src/lib/provider-overrides/overrides-api-key-curated.ts";
import { SUBSCRIPTION_OVERRIDES } from "../src/lib/provider-overrides/overrides-subscription.ts";

/**
 * Gemini 4 Neon's picker copy names the plan each card needs (a paid Gemini
 * key, Copilot Pro+), so it lives under `providerModelDescriptions.<card>`
 * ahead of the per-model `modelDescriptions`. The lookup below is the one
 * `usePickerViewModels` runs, against the shipped locale files.
 */
const chat = (lang: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../src/locales/${lang}/chat.json`, import.meta.url),
      "utf8",
    ),
  );

const instance = i18next.createInstance();
await instance.init({
  lng: "en",
  ns: ["chat"],
  defaultNS: "chat",
  resources: Object.fromEntries(
    ["en", "es", "pt"].map((lang) => [lang, { chat: chat(lang) }]),
  ),
});

function describeRow(lang: string, providerId: string, modelId: string) {
  const t = instance.getFixedT(lang, "chat");
  const key = modelId.replace(/\./g, "_");
  return t(`modelSelector.providerModelDescriptions.${providerId}.${key}`, {
    defaultValue: t(`modelSelector.modelDescriptions.${key}`, {
      defaultValue: "fallback",
    }),
  });
}

describe("Gemini 4 Neon picker copy", () => {
  it("names the plan each card needs, in every locale", () => {
    for (const lang of ["en", "es", "pt"]) {
      const google = describeRow(lang, "google", "gemini-4-neon");
      const copilot = describeRow(lang, "github-copilot", "gemini-4-neon");
      strictEqual(google.includes("Gemini 4"), true, `${lang} google`);
      strictEqual(copilot.includes("Copilot Pro+"), true, `${lang} copilot`);
      strictEqual(google === copilot, false, lang);
    }
  });

  it("the cards' English fallbacks are the en locale's copy", () => {
    strictEqual(
      CURATED_API_KEY_OVERRIDES.google.models?.["gemini-4-neon"]?.description,
      describeRow("en", "google", "gemini-4-neon"),
    );
    strictEqual(
      SUBSCRIPTION_OVERRIDES["github-copilot"].models?.["gemini-4-neon"]
        ?.description,
      describeRow("en", "github-copilot", "gemini-4-neon"),
    );
  });

  it("a row with no card entry still reads the per-model description", () => {
    strictEqual(
      describeRow("en", "google", "gemini-3.5-flash"),
      "Fast and capable. Best default.",
    );
    strictEqual(
      describeRow("en", "google-vertex", "gemini-4-neon"),
      "fallback",
    );
  });
});
