import { useTranslation } from "react-i18next";

/**
 * Per-provider "how to get your key" walkthrough inside the connect dialog.
 * Only providers whose key page needs a non-obvious choice get one — NVIDIA
 * first (HOU-890): a working key must be an NGC Personal Key with the
 * "Public API Endpoints" service included, a picker the quick
 * build.nvidia.com key flow never shows, so without these steps users mint
 * keys that fail on every chat model. Amazon Bedrock second (PRODUCT-1477):
 * the console shows a generated key's VALUE exactly once and afterwards lists
 * only its name, which users then paste as the key.
 */
const GUIDES = {
  nvidia: [
    "apiKey.guide.nvidia1",
    "apiKey.guide.nvidia2",
    "apiKey.guide.nvidia3",
  ],
  "amazon-bedrock": [
    "apiKey.guide.bedrock1",
    "apiKey.guide.bedrock2",
    "apiKey.guide.bedrock3",
  ],
  "azure-openai-responses": [
    "apiKey.guide.azure1",
    "apiKey.guide.azure2",
    "apiKey.guide.azure3",
  ],
} as const;

export function ProviderApiKeyGuide({ providerId }: { providerId: string }) {
  const { t } = useTranslation("providers");
  const steps = GUIDES[providerId as keyof typeof GUIDES];
  if (!steps) return null;
  return (
    <div className="rounded-xl bg-chip-subtle px-4 py-3">
      <p className="text-sm font-medium text-ink">{t("apiKey.guide.title")}</p>
      <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[13px] leading-relaxed text-ink-muted marker:text-ink-muted">
        {steps.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ol>
    </div>
  );
}
