import { useTranslation } from "react-i18next";

const GUIDES = {
  huggingface: [
    "apiKey.guide.huggingface1",
    "apiKey.guide.huggingface2",
    "apiKey.guide.huggingface3",
  ],
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
