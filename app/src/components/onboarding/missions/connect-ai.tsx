import { useTranslation } from "react-i18next";
import { ProviderBrowser } from "../../provider-browser/provider-browser";
import { useProviderBrowserData } from "../../provider-browser/use-provider-browser-data";
import { SetupCard } from "../setup-card";

interface ConnectAiMissionProps {
  eyebrow: string;
  onBack: () => void;
  /** Fired with (providerId, model) the instant a provider connects. */
  onConnected: (provider: string, model: string) => void;
}

/**
 * The single "Connect your AI" setup step. Replaces the old pick-then-login pair
 * with the SAME `<ProviderBrowser>` the AI Hub, the migration screen, and
 * workspace setup use. Onboarding alone passes `curated`, so by default it shows
 * only the featured providers (`FEATURED_PROVIDER_IDS`) split into Subscription /
 * API-key sections, with a "see all providers" chip that expands to the
 * deployment's full runnable pi-ai catalog; a search query bypasses curation and
 * matches across every provider. It still connects via EVERY auth type: OAuth
 * subscriptions, pasted API keys, an OpenAI-compatible endpoint, and Copilot's
 * enterprise-domain flow. The browser owns the connect interactions, the status
 * polling, and the failure toasts (no silent failures) and fires `onSelect` the
 * instant a provider connects; we advance to the success screen from there.
 * `selectOnMount` matches the legacy picker: an already-connected provider (the
 * user restarted onboarding) counts as a transition on the first status snapshot
 * so the step still advances instead of stranding.
 */
export function ConnectAiMission({
  eyebrow,
  onBack,
  onConnected,
}: ConnectAiMissionProps) {
  const { t } = useTranslation("setup");
  const { providers, connections, catalog } = useProviderBrowserData();

  return (
    <SetupCard
      onSpace
      eyebrow={eyebrow}
      title={t("tutorial.missions.connect.title")}
      subtitle={t("tutorial.missions.connect.body")}
      onBack={onBack}
      backLabel={t("tutorial.nav.back")}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ProviderBrowser
          providers={providers}
          connections={connections}
          catalog={catalog}
          onSelect={onConnected}
          selectOnMount
          curated
        />
      </div>
    </SetupCard>
  );
}
