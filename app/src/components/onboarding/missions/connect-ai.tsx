import { useTranslation } from "react-i18next";
import { ProviderBrowser } from "../../provider-browser/provider-browser";
import { useProviderBrowserData } from "../../provider-browser/use-provider-browser-data";
import { SetupCard } from "../setup-card";

interface ConnectAiMissionProps {
  eyebrow: string;
  /** Back to the previous step. Omitted when this is the first setup step (the
   *  welcome/intro screen was removed), so no Back button renders. */
  onBack?: () => void;
  /** Fired with (providerId, model) the instant a provider connects. */
  onConnected: (provider: string, model: string) => void;
  /** Leave onboarding WITHOUT connecting an AI. A user whose OAuth can't
   *  succeed (port conflict, missing entitlement, locked-down network) would
   *  otherwise be trapped here forever, so a quiet escape is mandatory. The
   *  orchestrator provisions the assistant provider-less and drops into the app. */
  onSkip: () => void;
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
  onSkip,
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
      backLabel={onBack ? t("tutorial.nav.back") : undefined}
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

      {/* Quiet escape from the connect step (the permanent-trap fix). Rendered
          BELOW the provider browser and outside its scroll area so it never
          competes with the primary connect action, matching the segment
          screen's secondary "skip" idiom: a muted hint plus an underlined
          text button, both always visible (no hover-only affordance). */}
      <div className="mt-4 flex flex-col items-center gap-1.5 border-t border-ink/10 pt-4 text-center">
        <p className="text-xs text-ink-muted">
          {t("tutorial.missions.connect.skipHint")}
        </p>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-ink-muted underline underline-offset-2 outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-focus"
        >
          {t("tutorial.missions.connect.skip")}
        </button>
      </div>
    </SetupCard>
  );
}
