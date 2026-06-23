import { Loader2, LogIn, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ComingSoonProviderInfo, ProviderInfo } from "../../lib/providers";
import {
  ClaudeLogo,
  DeepSeekLogo,
  GeminiLogo,
  MiniMaxLogo,
  OpenAILogo,
  OpenCodeLogo,
  OpenRouterLogo,
} from "./provider-logos";

/**
 * Exhaustive logo dispatch for active providers. Adding a new entry to
 * `PROVIDERS` MUST come with a `case` here, otherwise the user sees the
 * fallback mark (first letter of the provider name) instead of a real logo.
 */
function ProviderLogo({ provider }: { provider: ProviderInfo }) {
  switch (provider.id) {
    case "anthropic":
      return <ClaudeLogo />;
    case "openai":
      return <OpenAILogo />;
    case "openrouter":
      return <OpenRouterLogo />;
    case "google":
      return <GeminiLogo />;
    case "opencode":
    case "opencode-go":
      return <OpenCodeLogo />;
    default:
      return (
        <span className="text-[10px] font-semibold tracking-tight text-muted-foreground">
          {provider.name.slice(0, 1).toUpperCase()}
        </span>
      );
  }
}

function ComingSoonLogo({ provider }: { provider: ComingSoonProviderInfo }) {
  switch (provider.id) {
    case "deepseek":
      return <DeepSeekLogo />;
    case "minimax":
      return <MiniMaxLogo />;
    default:
      return (
        <span className="text-[10px] font-semibold tracking-tight text-muted-foreground">
          {provider.mark}
        </span>
      );
  }
}

export function ProviderCard({
  provider,
  connected,
  pending,
  onClick,
  onCancel,
}: {
  provider: ProviderInfo;
  connected: boolean;
  pending: boolean;
  onClick: () => void;
  /**
   * Abort an in-flight sign-in. While `pending`, the whole card becomes
   * the cancel target (the trailing slot shows a visible "Cancel" label
   * next to the spinner — never hover-gated) so a user who closed the
   * OAuth tab isn't stuck on a forever-spinner (#237).
   */
  onCancel: () => void;
}) {
  const { t } = useTranslation("providers");
  return (
    <button
      type="button"
      onClick={pending ? onCancel : onClick}
      title={
        pending
          ? t("card.cancelTitle", { name: provider.name })
          : connected
            ? t("card.signOutTitle", { name: provider.name })
            : t("card.connectTitle", { name: provider.name })
      }
      className="group w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary hover:bg-black/[0.05] transition-colors focus-visible:outline-none focus-visible:bg-black/[0.05]"
    >
      <div className="size-8 rounded-lg bg-background flex items-center justify-center shrink-0">
        <ProviderLogo provider={provider} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground truncate flex items-center gap-1.5">
          {provider.name}
          {connected && (
            <span
              role="img"
              aria-label={t("card.connected")}
              className="size-1.5 rounded-full bg-emerald-500 shrink-0"
            />
          )}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">
          {pending
            ? t("card.connecting")
            : connected
              ? provider.cost
              : provider.subtitle}
        </p>
      </div>
      {pending ? (
        <span className="inline-flex items-center gap-1.5 shrink-0 text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          <Loader2 className="size-3.5 animate-spin" />
          {t("card.cancel")}
        </span>
      ) : connected ? (
        <LogOut className="size-3.5 text-muted-foreground/60 shrink-0 group-hover:text-muted-foreground transition-colors" />
      ) : (
        <LogIn className="size-3.5 text-muted-foreground/60 shrink-0 group-hover:text-muted-foreground transition-colors" />
      )}
    </button>
  );
}

export function ComingSoonCard({
  provider,
}: {
  provider: ComingSoonProviderInfo;
}) {
  const { t } = useTranslation("providers");
  return (
    <div
      aria-disabled="true"
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary opacity-60 cursor-not-allowed select-none"
    >
      <div className="size-8 rounded-lg bg-background flex items-center justify-center shrink-0">
        <ComingSoonLogo provider={provider} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground truncate">
          {provider.name}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">
          {provider.subtitle}
        </p>
      </div>
      <span className="rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground shrink-0">
        {t("card.comingSoon")}
      </span>
    </div>
  );
}
