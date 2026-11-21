import { Trans, useTranslation } from "react-i18next";
import { DEVELOPER_DOCS } from "../../../lib/agent-connect-model";
import { tauriSystem } from "../../../lib/tauri";
import { ApiKeysBody } from "./api-keys-body";
import { ApiOrgId } from "./api-org-id";

export function ApiKeysSection() {
  const { t } = useTranslation("settings");

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">{t("apiKeys.title")}</h2>
      <p className="mb-4 text-sm text-ink-muted">
        <Trans
          t={t}
          i18nKey="apiKeys.intro"
          components={{
            docs: (
              <button
                type="button"
                onClick={() =>
                  void tauriSystem.openUrl(DEVELOPER_DOCS.overview)
                }
                className="cursor-pointer font-medium text-link underline underline-offset-2 transition-colors hover:text-link/80"
              />
            ),
          }}
        />
      </p>
      <ApiOrgId />
      <ApiKeysBody />
    </section>
  );
}
