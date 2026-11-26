import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import i18next from "i18next";
import { SUBSCRIPTION_OVERRIDES } from "../src/lib/provider-overrides/overrides-subscription.ts";

/**
 * Every curated Copilot row's picker copy names the Copilot plan it needs. The
 * per-model `modelDescriptions` speak for the card that owns the id (GPT-6.1
 * Terra's talks about the ChatGPT allowance), so each Copilot row lives under
 * `providerModelDescriptions.github-copilot`, which the picker reads first.
 * The lookup below is the one `usePickerViewModels` runs.
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

function describeRow(lang: string, modelId: string) {
  const t = instance.getFixedT(lang, "chat");
  const key = modelId.replace(/\./g, "_");
  return t(`modelSelector.providerModelDescriptions.github-copilot.${key}`, {
    defaultValue: t(`modelSelector.modelDescriptions.${key}`, {
      defaultValue: "fallback",
    }),
  });
}

const copilotModels = Object.entries(
  SUBSCRIPTION_OVERRIDES["github-copilot"].models ?? {},
);

describe("Copilot picker copy", () => {
  it("shows the Copilot card's own copy, never the ChatGPT allowance", () => {
    strictEqual(
      describeRow("en", "gpt-6.1-terra"),
      "OpenAI's balanced mid-tier model. Needs Copilot Pro.",
    );
    for (const lang of ["en", "es", "pt"])
      for (const modelId of ["gpt-6.1-terra", "gpt-6-luna"])
        ok(
          describeRow(lang, modelId).includes("Copilot"),
          `${lang} ${modelId}`,
        );
  });

  it("every curated row has its own copy in every locale", () => {
    for (const lang of ["en", "es", "pt"]) {
      const card = chat(lang).modelSelector.providerModelDescriptions[
        "github-copilot"
      ] as Record<string, string>;
      for (const [modelId] of copilotModels)
        ok(
          Object.hasOwn(card, modelId.replace(/\./g, "_")),
          `${lang} ${modelId}`,
        );
    }
  });

  it("the card's English fallbacks are the en locale's copy", () => {
    for (const [modelId, row] of copilotModels)
      strictEqual(row.description, describeRow("en", modelId), modelId);
  });

  it("Opus 4.8 reads as the previous Opus, kept for annual plans", () => {
    for (const lang of ["en", "es", "pt"]) {
      const copy = describeRow(lang, "claude-opus-4.8");
      ok(copy.includes("Copilot Pro+"), lang);
      ok(!/flagship|insignia|principal/i.test(copy), lang);
    }
  });
});
