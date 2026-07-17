import { CatalogCount } from "@houston-ai/core";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { appDisplay } from "./app-display";
import { AppRow } from "./app-row";
import type { PermissionsFix } from "./blocked-ceiling";
import { LOCKED_PREVIEW_CAP } from "./browse-model";
import { EnableInPermissionsButton } from "./enable-in-permissions-button";

interface CatalogLockedSectionProps {
  /** Policy-blocked apps (already filtered + A-Z), rendered read-only. */
  locked: IntegrationToolkit[];
  /**
   * Resolve the "Enable it in Permissions" deep-link for a blocked app, or
   * `undefined` when the viewer can't lift that app's ceiling. When set (a viewer
   * who CAN act), the row's ask-your-admin line is replaced by the CTA; when
   * absent or `undefined` for a row (the member view), the ask-admin line stays.
   */
  onEnable?: PermissionsFix;
}

/**
 * The policy-blocked apps in the browse catalog, shown as LOCKED rows instead of
 * being hidden. So a member who searches for an app their admin hasn't enabled
 * finds a locked row, with the ask-your-admin line visible at rest, rather than
 * an empty list that reads as "Houston doesn't support it". Each row is
 * non-interactive (a lock icon where Connect would sit, no click) and carries the
 * ask-admin subtitle. The heading carries the total locked count and a subtitle
 * naming this as an admin choice. Capped at {@link LOCKED_PREVIEW_CAP} with a "+N more" line
 * so a tiny allowlist over the ~1000-app catalog can't flood past the connectable
 * apps above. Only rendered on a Teams host with a real ceiling — the caller
 * passes an empty `locked` list off Teams, so nothing shows.
 */
export function CatalogLockedSection({
  locked,
  onEnable,
}: CatalogLockedSectionProps) {
  const { t } = useTranslation("integrations");
  const shown = locked.slice(0, LOCKED_PREVIEW_CAP);
  const overflow = locked.length - shown.length;

  return (
    <section className="mt-6">
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <Lock className="size-3.5" />
        {t("locked.heading")}
        <CatalogCount count={locked.length} />
      </h4>
      <p className="mt-1 mb-3 text-xs text-ink-muted">{t("locked.subtitle")}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {shown.map((tk) => {
          const display = appDisplay(tk.slug, tk);
          const fix = onEnable?.(tk.slug);
          return (
            <AppRow
              key={tk.slug}
              display={display}
              description={
                fix ? undefined : t("locked.askAdmin", { name: display.name })
              }
              trailing={
                fix ? (
                  <EnableInPermissionsButton
                    label={t("locked.enableInPermissions")}
                    onClick={fix}
                  />
                ) : (
                  <Lock className="size-3.5 text-ink-muted/70" />
                )
              }
            />
          );
        })}
      </div>
      {overflow > 0 && (
        <p className="mt-2 text-xs text-ink-muted">
          {t("locked.more", { count: overflow })}
        </p>
      )}
    </section>
  );
}
