import { Trans, useTranslation } from "react-i18next";
import { tauriSystem } from "../../../lib/tauri";
import { ApiKeysBody } from "./api-keys-body";

/** Developer docs for the public API, opened in the OS browser. */
const DOCS_URL = "https://gethouston.ai/developers";

/**
 * Settings > API keys (C9): mint and revoke personal keys for the public API.
 * Shown only on a gateway that advertises `capabilities.apiKeys` (gated by the
 * caller in `settings-view`). The header links the concept to the developer
 * docs; the list, create, and revoke flows live in {@link ApiKeysBody}.
 */
export function ApiKeysSection() {
  const { t } = useTranslation("settings");

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">{t("apiKeys.title")}</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        <Trans
          t={t}
          i18nKey="apiKeys.intro"
          components={{
            docs: (
              <button
                type="button"
                onClick={() => void tauriSystem.openUrl(DOCS_URL)}
                className="cursor-pointer font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary/80"
              />
            ),
          }}
        />
      </p>
      <ApiKeysBody />
    </section>
  );
}
