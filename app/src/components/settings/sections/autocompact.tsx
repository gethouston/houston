import { useTranslation } from "react-i18next";
import { useAutocompactSettings } from "../../../stores/autocompact-settings";

/**
 * Autocompact settings. When on, Houston summarizes a conversation and
 * continues on a fresh session once its context gets full, so long chats keep
 * working. The user still sees the full history. The fullness threshold is a
 * build-time constant (`VITE_AUTOCOMPACT_THRESHOLD`), not exposed here.
 */
export function AutocompactSection() {
  const { t } = useTranslation("settings");
  const enabled = useAutocompactSettings((s) => s.enabled);
  const setEnabled = useAutocompactSettings((s) => s.setEnabled);

  const pill = (selected: boolean) =>
    `flex items-center gap-2 px-4 py-2.5 rounded-full text-sm transition-colors ${
      selected
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-foreground hover:bg-accent"
    }`;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{t("autocompact.title")}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("autocompact.description")}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setEnabled(true)} className={pill(enabled)}>
          {t("autocompact.on")}
        </button>
        <button
          type="button"
          onClick={() => setEnabled(false)}
          className={pill(!enabled)}
        >
          {t("autocompact.off")}
        </button>
      </div>
    </section>
  );
}
