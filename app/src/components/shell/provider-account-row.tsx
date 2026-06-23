import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProviderInfo } from "../../lib/providers";
import {
  ClaudeLogo,
  GeminiLogo,
  GitHubCopilotLogo,
  OpenAILogo,
  OpenCodeLogo,
  OpenRouterLogo,
} from "./provider-logos";

function ProviderLogo({ provider }: { provider: ProviderInfo }) {
  switch (provider.id) {
    case "anthropic":
      return <ClaudeLogo />;
    case "openai":
      return <OpenAILogo />;
    case "github-copilot":
    case "github-copilot-enterprise":
      return <GitHubCopilotLogo />;
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

export function ProviderAccountRow({
  provider,
  connected,
  pending,
  onConnect,
  onSignOut,
  onCancel,
}: {
  provider: ProviderInfo;
  connected: boolean;
  pending: boolean;
  onConnect: () => void;
  onSignOut: () => void;
  /**
   * Abort an in-flight sign-in. While `pending`, the action button
   * turns into a Cancel control (spinner + visible label) so a user who
   * abandoned the OAuth tab can retry without restarting Houston (#237).
   */
  onCancel: () => void;
}) {
  const { t } = useTranslation("providers");

  // Disconnected rows get a faded background via the `bg-secondary/40` alpha
  // modifier AND a CSS-opacity dim on the identity cluster (logo + name +
  // subtitle). The button is kept OUTSIDE the inner opacity wrapper and
  // uses a non-opacity-derived background, so it pops at full strength —
  // same visual weight as the Sign out button on a connected row.
  //
  // Why a Tailwind alpha modifier instead of `opacity-40` on the outer div:
  // CSS opacity cascades to descendants and can't be undone by a child
  // class, which would mute the button too. `bg-secondary/40` only thins
  // the bg color, leaving children rendering at their own colors.
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
        connected ? "bg-secondary" : "bg-secondary/40"
      }`}
    >
      <div className="flex items-center gap-3 w-full">
        <div
          className={`flex items-center gap-3 flex-1 min-w-0 transition-opacity ${
            connected ? "" : "opacity-50"
          }`}
        >
          <div className="size-8 rounded-lg bg-background flex items-center justify-center shrink-0">
            <ProviderLogo provider={provider} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-foreground truncate">
              {provider.name}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {connected ? t("card.connected") : provider.subtitle}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={pending ? onCancel : connected ? onSignOut : onConnect}
          title={
            pending ? t("card.cancelTitle", { name: provider.name }) : undefined
          }
          className="text-[12px] font-medium px-2.5 py-1 rounded-md border border-input bg-background hover:bg-black/[0.05] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 shrink-0"
        >
          {pending ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" />
              {t("row.cancel")}
            </span>
          ) : connected ? (
            t("row.signOut")
          ) : (
            t("row.connect")
          )}
        </button>
      </div>
    </div>
  );
}
