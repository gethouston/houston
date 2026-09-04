import { KeyRound, LogIn, Plug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChoiceCard } from "./choice-card";
import type { CuratedIntegration } from "./curated-integrations";

/**
 * The curated connect dialog's choice step: the provider (Composio) connect
 * when the deployment's catalog has this app — the lead, since that app
 * covers the whole API — then the service's own MCP sign-in, then an API key
 * for services that take one. Every offered option ALWAYS shows: the fork is
 * the product promise. A deployment that cannot run the browser sign-in
 * rejects at the host (`oauth_unsupported`) and the wrapper toasts the honest
 * reason — better than hiding a path behind a capability read that may still
 * be resolving.
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
  const leadsWithProvider =
    providerConnect !== undefined && curated.providerTitleKey !== undefined;
  const offersKey =
    curated.authModes.includes("credential") &&
    curated.keyHelpKey !== undefined;

  return (
    <div className="flex flex-col gap-2">
      {leadsWithProvider && curated.providerTitleKey && (
        <ChoiceCard
          icon={<Plug className="size-5" />}
          title={t(curated.providerTitleKey)}
          description={
            curated.providerDescKey ? t(curated.providerDescKey) : ""
          }
          emphasis="lead"
          badge={t("curated.connect.recommendedBadge")}
          disabled={busy}
          onClick={providerConnect}
        />
      )}
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
        emphasis={leadsWithProvider ? undefined : "lead"}
        badge={
          leadsWithProvider ? undefined : t("curated.connect.recommendedBadge")
        }
        disabled={busy}
        onClick={onSignIn}
      />
      {offersKey && (
        <ChoiceCard
          icon={<KeyRound className="size-5" />}
          title={t("curated.connect.keyTitle")}
          description={t("curated.connect.keyDesc", { name })}
          disabled={busy}
          onClick={onKey}
        />
      )}
    </div>
  );
}
