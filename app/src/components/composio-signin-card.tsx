import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink } from "lucide-react";
import { useConnections, useResetConnections } from "../hooks/queries";
import { useComposioAuth } from "../hooks/use-composio-auth";
import { ComposioAuthDialog } from "./composio-auth-dialog";
import { RowCard } from "./cards/row-card";
import { RowCardButton } from "./cards/row-card-button";

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
    <>
      <RowCard
        inline
        truncate
        media={
          <img
            src={COMPOSIO_LOGO}
            alt={t("composioSignin.appName")}
            className="size-full object-contain"
          />
        }
        title={t("composioSignin.appName")}
        description={
          isSignedIn
            ? t("composioSignin.alreadySignedIn")
            : t("composioSignin.description")
        }
        action={
          isSignedIn ? (
            <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700">
              <Check className="size-3" />
              {t("composioSignin.signedIn")}
            </span>
          ) : (
            <RowCardButton
              label={t("composioSignin.signIn")}
              onClick={handleSignIn}
              icon={<ExternalLink className="size-3" />}
              iconPosition="trailing"
              loading={auth.state.phase === "waiting"}
            />
          )
        }
      />
      <ComposioAuthDialog
        state={auth.state}
        onClose={auth.close}
        onReopenBrowser={auth.reopenBrowser}
        onRetry={auth.startAuth}
      />
    </>
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
