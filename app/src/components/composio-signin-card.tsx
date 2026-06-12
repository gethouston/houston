import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { useConnections, useResetConnections } from "../hooks/queries";
import { useComposioAuth } from "../hooks/use-composio-auth";
import { ComposioAuthDialog } from "./composio-auth-dialog";

const COMPOSIO_LOGO =
  "https://www.google.com/s2/favicons?domain=composio.dev&sz=128";

/**
 * Inline card the agent posts when its Composio call fails because the
 * user isn't signed into Composio at all (no token, not just a missing
 * per-toolkit connection). Mirrors `ComposioLinkCard` visually so the
 * agent can hand the user a one-click sign-in directly in chat instead
 * of telling them to "go to settings".
 *
 * Reflects live `useConnections()` state — flips to a green "Connected"
 * pill the moment auth completes.
 */
export function ComposioSigninCard() {
  const { t } = useTranslation("chat");
  const { data: status } = useConnections();
  const reset = useResetConnections();
  const auth = useComposioAuth(() => reset());
  const isSignedIn = status?.status === "ok";

  const handleSignIn = useCallback(() => {
    void auth.startAuth();
  }, [auth]);

  return (
    <span className="not-prose inline-flex my-1 max-w-full align-middle">
      <span className="inline-flex items-center gap-3 px-3 py-2.5 rounded-xl border border-black/5 bg-background min-w-0">
        <img
          src={COMPOSIO_LOGO}
          alt={t("composioSignin.appName")}
          className="size-8 rounded-lg object-contain shrink-0"
        />
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-[13px] font-medium text-foreground truncate">
            {t("composioSignin.appName")}
          </span>
          <span className="text-[11px] text-muted-foreground truncate">
            {isSignedIn
              ? t("composioSignin.alreadySignedIn")
              : t("composioSignin.description")}
          </span>
        </span>
        {isSignedIn ? (
          <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium shrink-0">
            <Check className="size-3" />
            {t("composioSignin.signedIn")}
          </span>
        ) : (
          <button
            type="button"
            onClick={handleSignIn}
            disabled={auth.state.phase === "waiting"}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity duration-200 disabled:opacity-50 shrink-0"
          >
            {auth.state.phase === "waiting" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <>
                {t("composioSignin.signIn")}
                <ExternalLink className="size-3" />
              </>
            )}
          </button>
        )}
      </span>
      <ComposioAuthDialog
        state={auth.state}
        onClose={auth.close}
        onReopenBrowser={auth.reopenBrowser}
        onRetry={auth.startAuth}
      />
    </span>
  );
}

/**
 * Detects URLs the agent posts to request Composio account sign-in.
 * Pattern: any URL with `#houston_composio_signin=1` (or just the
 * marker present) in the hash fragment. Mirrors
 * `parseComposioToolkitFromHref` so both card types share the same
 * mental model.
 */
export function isComposioSigninHref(href: string): boolean {
  try {
    const url = new URL(href);
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    if (!hash) return false;
    const params = new URLSearchParams(hash);
    return params.has("houston_composio_signin");
  } catch {
    return false;
  }
}
