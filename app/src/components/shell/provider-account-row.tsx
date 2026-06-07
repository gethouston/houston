import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import type { ProviderInfo } from "../../lib/providers";
import { providerHarnessI18nKey } from "../../lib/providers";
import type { ClaudeInstallState } from "../../hooks/use-claude-install";
import { ClaudeInstallHint } from "./claude-install-hint";
import { ClaudeLogo, OpenAILogo, OpenRouterLogo } from "./provider-logos";

function ProviderLogo({ provider }: { provider: ProviderInfo }) {
  switch (provider.id) {
    case "anthropic":
      return <ClaudeLogo />;
    case "openai":
      return <OpenAILogo />;
    case "openrouter":
      return <OpenRouterLogo />;
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
  installed,
  pending,
  onConnect,
  onSignOut,
  claudeInstall,
  onCancel,
  onManageModels,
  cloudSyncAvailable = false,
  cloudSyncPending = false,
  onCloudSync,
}: {
  provider: ProviderInfo;
  connected: boolean;
  /** `cli_installed` alone (independent of auth). When `false` and
   *  `claudeInstall` is provided, the row shows the managed-install hint
   *  (real reason + Retry) instead of a Connect button that would only
   *  fail with "claude CLI is not installed" — issue #231. */
  installed?: boolean;
  pending: boolean;
  onConnect: () => void;
  onSignOut: () => void;
  /** Houston-managed runtime install state for the Anthropic CLI. `null`
   *  for every bundled-CLI provider — those fall through to the normal
   *  Connect button. */
  claudeInstall?: ClaudeInstallState | null;
  /**
   * Abort an in-flight sign-in. While `pending`, the action button
   * turns into a Cancel control (spinner + visible label) so a user who
   * abandoned the OAuth tab can retry without restarting Houston (#237).
   */
  onCancel: () => void;
  onManageModels?: () => void;
  cloudSyncAvailable?: boolean;
  cloudSyncPending?: boolean;
  onCloudSync?: () => void;
}) {
  const { t } = useTranslation("providers");

  // When Houston still owes the user a `claude` download (install failed,
  // or is mid-flight), a Connect button would only produce a
  // "claude CLI is not installed" bad-request — so swap it for the same
  // reason + Retry surface the onboarding card shows (issue #231).
  const showInstallHint = claudeInstall != null && installed === false;

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
      className={`flex min-w-0 w-full overflow-hidden gap-3 px-3 py-2.5 rounded-xl transition-colors ${
        showInstallHint ? "flex-col" : "items-center"
      } ${connected ? "bg-secondary" : "bg-secondary/40"}`}
    >
      <div className="flex min-w-0 items-center gap-3 w-full">
        <div
          className={`flex items-center gap-3 flex-1 min-w-0 overflow-hidden transition-opacity ${
            connected ? "" : "opacity-50"
          }`}
        >
          <div className="size-8 rounded-lg bg-background flex items-center justify-center shrink-0">
            <ProviderLogo provider={provider} />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <p className="text-[13px] font-medium text-foreground truncate">{provider.name}</p>
            <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5 min-w-0">
              <span className="shrink-0 rounded px-1.5 py-px text-[10px] font-medium tracking-wide text-foreground/75 bg-foreground/5">
                {t(providerHarnessI18nKey(provider.id))}
              </span>
              <span className="truncate">
                {connected ? t("card.connected") : provider.subtitle}
              </span>
            </p>
          </div>
        </div>
        {!showInstallHint && (
          <div className="flex shrink-0 items-center gap-1.5">
            {connected && provider.id === "openrouter" && onManageModels ? (
              <button
                type="button"
                onClick={onManageModels}
                className="text-[12px] font-medium px-2.5 py-1 rounded-md border border-input bg-background hover:bg-black/[0.05] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {t("openrouterConnect.manageModels")}
              </button>
            ) : null}
            {connected && cloudSyncAvailable && onCloudSync && (
              <button
                type="button"
                onClick={onCloudSync}
                disabled={cloudSyncPending}
                className="text-[12px] font-medium px-2.5 py-1 rounded-md border border-input bg-background hover:bg-black/[0.05] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
              >
                {cloudSyncPending ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" />
                    {t("row.syncingToCloud")}
                  </span>
                ) : (
                  t("row.syncToCloud")
                )}
              </button>
            )}
            <button
              type="button"
              onClick={pending ? onCancel : connected ? onSignOut : onConnect}
              title={pending ? t("card.cancelTitle", { name: provider.name }) : undefined}
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
        )}
      </div>
      {showInstallHint && claudeInstall && (
        <div className="pl-11">
          <ClaudeInstallHint state={claudeInstall} />
        </div>
      )}
    </div>
  );
}
