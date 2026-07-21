import { Clock, Layers, Smartphone, TriangleAlert } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

/**
 * The idle-state pitch of the migration offer: the two intro lines, the
 * "what you get" benefit rows, and the reconnect-integrations warning.
 * Split from `MigrateToCloudOffer`, which owns the dialog chrome and the
 * install/progress states and swaps this out for a status line once an
 * install starts.
 */
export function MigrateToCloudPitch() {
  const { t } = useTranslation("shell");

  return (
    <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
      <p>
        {t("migrateToCloud.intro")}
        <br />
        <Trans
          ns="shell"
          i18nKey="migrateToCloud.introFree"
          components={{
            b: <strong className="font-medium text-foreground" />,
          }}
        />
      </p>

      {/* Elevated material for the gift, flat amber wash for the caveat:
          the hierarchy is felt through surface, not just colour. */}
      <div className="rounded-xl bg-card p-4 shadow-sm ring-1 ring-border/60">
        <p className="text-[13px] font-semibold text-foreground">
          {t("migrateToCloud.whatTitle")}
        </p>
        <ul className="mt-3 space-y-2.5">
          {(
            [
              [Clock, "whatAlwaysOn"],
              [Layers, "whatModels"],
              [Smartphone, "whatPhone"],
            ] as const
          ).map(([Icon, key]) => (
            <li key={key} className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-background to-muted/40 shadow-sm ring-1 ring-border/60">
                <Icon className="size-4 text-foreground" />
              </span>
              <span className="text-[13px]">
                <Trans
                  ns="shell"
                  i18nKey={`migrateToCloud.${key}`}
                  components={{
                    b: <strong className="font-medium text-foreground" />,
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl bg-warning/10 p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/15">
            <TriangleAlert className="size-4 text-warning" />
          </span>
          <p className="text-[13px] font-semibold text-foreground">
            {t("migrateToCloud.warnTitle")}
          </p>
        </div>
        <p className="mt-2 text-[13px]">{t("migrateToCloud.warnBody")}</p>
      </div>
    </div>
  );
}
