import { Trans, useTranslation } from "react-i18next";
import { ProviderSettings } from "../../shell/provider-settings";

export function ProviderSection() {
  const { t } = useTranslation("settings");

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{t("provider.title")}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        <Trans
          i18nKey="settings:provider.description"
          components={{
            emph: <strong className="text-foreground font-medium" />,
          }}
        />
      </p>
      <ProviderSettings />
    </section>
  );
}
