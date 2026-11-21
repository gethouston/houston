import { KeyRound, LogIn, Plug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChoiceCard } from "./choice-card";
import type { CuratedIntegration } from "./curated-integrations";

export function CuratedConnectOptions({
  curated,
  busy,
  providerConnect,
  onSignIn,
  onKey,
}: {
  curated: CuratedIntegration;
  busy: boolean;
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
