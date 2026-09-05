import { KeyRound, LogIn, Plug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChoiceCard } from "./choice-card";
import type { CuratedIntegration } from "./curated-integrations";

/**
 * The curated connect dialog's choice step: the service's own paths first
 * (browser sign-in, then a key or token, whichever the service offers), then
 * the provider (Composio) connect when the deployment's catalog has this
 * app. Every offered option ALWAYS shows: the fork is the product promise. A
 * deployment that cannot run the browser sign-in rejects at the host
 * (`oauth_unsupported`) and the wrapper toasts the honest reason — better
 * than hiding a path behind a capability read that may still be resolving.
 */
export function CuratedConnectOptions({
  curated,
  busy,
  providerConnect,
  onSignIn,
  onKey,
}: {
  curated: CuratedIntegration;
  busy: boolean;
  /** Present only when the provider catalog carries this slug. */
  providerConnect?: () => void;
  onSignIn: () => void;
  onKey: () => void;
}) {
  const { t } = useTranslation("integrations");
  const name = curated.name;
  const offersSignIn = curated.authModes.includes("oauth");
  const offersProvider =
    providerConnect !== undefined && curated.providerTitleKey !== undefined;
  const offersKey =
    curated.authModes.includes("credential") &&
    curated.keyHelpKey !== undefined;
  // The first option the service offers leads: its own sign-in when it has
  // one, else its token (HighLevel), with the provider's app after either.
  const lead = offersSignIn ? "signIn" : offersKey ? "key" : "provider";
  const leadProps = (which: typeof lead) =>
    lead === which
      ? {
          emphasis: "lead" as const,
          badge: t("curated.connect.recommendedBadge"),
        }
      : {};

  return (
    <div className="flex flex-col gap-2">
      {offersSignIn && (
        <ChoiceCard
          icon={<LogIn className="size-5" />}
          title={
            curated.signInTitleKey
              ? t(curated.signInTitleKey)
              : t("curated.connect.signInTitle", { name })
          }
          description={
            curated.signInDescKey
              ? t(curated.signInDescKey)
              : t("curated.connect.signInDesc", { name })
          }
          {...leadProps("signIn")}
          disabled={busy}
          onClick={onSignIn}
        />
      )}
      {offersKey && (
        <ChoiceCard
          icon={<KeyRound className="size-5" />}
          title={
            curated.keyTitleKey
              ? t(curated.keyTitleKey)
              : t("curated.connect.keyTitle")
          }
          description={
            curated.keyDescKey
              ? t(curated.keyDescKey)
              : t("curated.connect.keyDesc", { name })
          }
          {...leadProps("key")}
          disabled={busy}
          onClick={onKey}
        />
      )}
      {offersProvider && curated.providerTitleKey && (
        <ChoiceCard
          icon={<Plug className="size-5" />}
          title={t(curated.providerTitleKey)}
          description={
            curated.providerDescKey ? t(curated.providerDescKey) : ""
          }
          {...leadProps("provider")}
          disabled={busy}
          onClick={providerConnect}
        />
      )}
    </div>
  );
}
