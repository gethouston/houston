import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { appDisplay } from "./app-display";
import { AppRow } from "./app-row";
import { LOCKED_PREVIEW_CAP } from "./browse-model";

interface CatalogLockedSectionProps {
  /** Policy-blocked apps (already filtered + A-Z), rendered read-only. */
  locked: IntegrationToolkit[];
}

/**
 * The policy-blocked apps in the browse catalog, shown as LOCKED rows instead of
 * being hidden. So a member who searches for an app their admin hasn't enabled
 * finds a locked row, with the ask-your-admin line visible at rest, rather than
 * an empty list that reads as "Houston doesn't support it". Each row is
 * non-interactive (a lock icon where Connect would sit, no click) and carries the
 * ask-admin subtitle. Capped at {@link LOCKED_PREVIEW_CAP} with a "+N more" line
 * so a tiny allowlist over the ~1000-app catalog can't flood past the connectable
 * apps above. Only rendered on a Teams host with a real ceiling — the caller
 * passes an empty `locked` list off Teams, so nothing shows.
 */
export function CatalogLockedSection({ locked }: CatalogLockedSectionProps) {
  const { t } = useTranslation("integrations");
  const shown = locked.slice(0, LOCKED_PREVIEW_CAP);
  const overflow = locked.length - shown.length;

  return (
    <section className="mt-6">
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <Lock className="size-3.5" />
        {t("locked.heading")}
      </h4>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {shown.map((tk) => {
          const display = appDisplay(tk.slug, tk);
          return (
            <AppRow
              key={tk.slug}
              display={display}
              description={t("locked.askAdmin", { name: display.name })}
              trailing={<Lock className="size-3.5 text-ink-muted/70" />}
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
