import { Trans, useTranslation } from "react-i18next";
import { ProviderPicker } from "../../shell/provider-picker";
import { getProvider } from "../../../lib/providers";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { useUIStore } from "../../../stores/ui";

export function ProviderSection() {
  const { t } = useTranslation("settings");
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const updateProvider = useWorkspaceStore((s) => s.updateProvider);
  const addToast = useUIStore((s) => s.addToast);

  if (!currentWorkspace) return null;

  const handleProviderSelect = async (provider: string, model: string) => {
    await updateProvider(currentWorkspace.id, provider, model);
    // Source the display name from the canonical frontend catalog so adding
    // a provider to `PROVIDERS` (e.g. Gemini → "Google") flows through to
    // this toast automatically. The previous ternary hardcoded only OpenAI
    // and Anthropic, mislabeling every other provider as "Anthropic".
    const provName = getProvider(provider)?.name ?? provider;
    addToast({
      title: t("toasts.providerSwitched", { provider: provName, model }),
    });
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{t("provider.title")}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        <Trans
          i18nKey="settings:provider.description"
          components={{ emph: <strong className="text-foreground font-medium" /> }}
        />
      </p>
      <ProviderPicker
        value={currentWorkspace.provider ?? null}
        model={currentWorkspace.model ?? null}
        onSelect={handleProviderSelect}
      />
    </section>
  );
}
