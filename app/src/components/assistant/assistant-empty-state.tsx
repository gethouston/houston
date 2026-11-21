import { useTranslation } from "react-i18next";

export function AssistantEmptyState() {
  const { t } = useTranslation("assistant");
  return (
    <div className="w-full self-stretch overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pt-6 pb-4 text-center md:pt-10">
        <h3 className="text-balance text-base font-medium text-ink">
          {t("empty.heading")}
        </h3>
        <p className="text-balance text-sm text-ink-muted">
          {t("empty.capabilities")}
        </p>
        <p className="text-balance text-sm text-ink-muted">
          {t("empty.safety")}
        </p>
      </div>
    </div>
  );
}
